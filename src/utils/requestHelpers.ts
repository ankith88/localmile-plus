import { 
  doc, 
  updateDoc, 
  addDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  increment 
} from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { formatDateForInput, getDayName } from './scheduling';
import { isSuperAdminUid } from '../context/LpoContext';

export interface AcceptRequestParams {
  request: any;
  parentId?: string;
  userData?: any;
  companyData?: any;
  onProgress?: (progress: number, status: string) => void;
  sendEmail?: boolean;
}

export const acceptJobRequest = async ({
  request,
  parentId = "",
  userData = null,
  companyData: _companyData = null,
  onProgress,
  sendEmail
}: AcceptRequestParams) => {
  if (!request) throw new Error("No request provided.");

  const effectiveParentId = parentId || request.parent_id || "";

  if (request.status === 'awaiting-activation') {
    throw new Error("This customer is still awaiting T&C activation. You cannot accept the job until they are Active.");
  }

  onProgress?.(5, "Initializing acceptance flow...");

  // Fetch trial balance early to pass to APIs
  let isFreeJob = false;
  let companyDataFromDb: any = null;
  if (request.customer_id) {
    try {
      const compDoc = await getDoc(doc(db, 'companies', request.customer_id));
      if (compDoc.exists()) {
        companyDataFromDb = compDoc.data();
        if (typeof companyDataFromDb.trial_credits_balance === 'number' && companyDataFromDb.trial_credits_balance > 0) {
          isFreeJob = true;
        }
      }
    } catch (e) {
      console.error("Failed to check trial balance:", e);
    }
  }

  let jobDocRef: any = null;
  const today = formatDateForInput(new Date());
  let finalJobId = "";
  let netsuiteCustomerId = request.netsuiteCustomerId || request.customer?.netsuiteId || "";
  
  onProgress?.(15, "Analyzing service requirements...");

  let serviceInternalId = request.serviceInternalId || 
    request.imServiceH2H2InternalID || 
    request.imServiceH2HInternalID || 
    request.imServiceAMPOInternalID || 
    request.servicePMPOInternalID || 
    '';
  let serviceRate = request.serviceRate || 
    request.imServiceH2H2Rate || 
    request.imServiceH2HIRate || 
    request.imServiceAMPORate || 
    request.servicePMPORate || 
    '';

  if (request.jobType === 'scheduled') {
    onProgress?.(25, "Fetching customer service metadata...");
    
    try {
      if (effectiveParentId) {
        const custQ = query(
          collection(db, `companies/${effectiveParentId}/customers`),
          where('companyName', '==', request.customer.company)
        );
        const custSnap = await getDocs(custQ);
        if (!custSnap.empty) {
          const c = custSnap.docs[0].data();
          if (userData?.role === 'parent') {
            if (c.companyId || c.customerInternalId) {
              netsuiteCustomerId = c.companyId || c.customerInternalId;
            }
            if (Array.isArray(c.serviceList)) {
              const matched = c.serviceList.find((s: any) => s.name === request.service);
              if (matched) {
                serviceInternalId = matched.id || serviceInternalId;
                serviceRate = matched.rate || serviceRate;
              }
            }
          } else {
            if (request.service === 'lpo-to-site' || request.service === 'australia post-to-site') {
              serviceInternalId = c.lpoServiceAMPOInternalID || serviceInternalId;
              serviceRate = c.lpoServiceAMPORate || serviceRate;
            } else if (request.service === 'site-to-lpo' || request.service === 'site-to-australia post') {
              serviceInternalId = (isFreeJob && companyDataFromDb?.serviceTrialInternalID)
                ? companyDataFromDb.serviceTrialInternalID
                : (c.lpoServicePMPOInternalID || serviceInternalId);
              serviceRate = c.lpoServicePMPORate || serviceRate;
            } else if (request.service === 'round-trip') {
              serviceInternalId = c.lpoServiceAMPOPMPOInternalID || serviceInternalId;
              serviceRate = c.lpoServiceAMPOPMPORate || serviceRate;
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching customer service metadata:", err);
    }

    onProgress?.(35, "Generating recurring schedule template...");

    const { id: _, ...requestData } = request;

    let scheduledService = requestData.service;
    const isCustomerRequest = requestData.userRole === 'customer' || requestData.user_role === 'customer' || request.userRole === 'customer' || request.user_role === 'customer';
    if (isCustomerRequest) {
      if (scheduledService === 'site-to-lpo') {
        scheduledService = 'site-to-australia post';
      } else if (scheduledService === 'lpo-to-site') {
        scheduledService = 'australia post-to-site';
      }
    }

    const isAusPostService = scheduledService?.includes('australia post') || scheduledService?.includes('lpo');
    const effectiveAuspostContact = requestData.auspostContact || (isAusPostService ? {
      firstName: requestData.recipient?.firstName || 'Australia',
      lastName: requestData.recipient?.lastName || 'Post',
      phone: requestData.recipient?.phone || '13 13 18',
      email: requestData.recipient?.email || 'no-reply@auspost.com.au'
    } : null);

    const effectiveRecipient = requestData.recipient || (isAusPostService ? {
      company: 'Australia Post',
      address: requestData.customer?.address || '',
      suburb: requestData.customer?.suburb || '',
      state: requestData.customer?.state || 'NSW',
      postcode: requestData.customer?.postcode || '',
      firstName: 'Australia',
      lastName: 'Post',
      phone: '13 13 18',
      email: 'no-reply@auspost.com.au',
      coordinates: null
    } : null);

    const templateRef = await addDoc(collection(db, 'scheduled_jobs'), {
      ...requestData,
      service: scheduledService,
      parent_id: effectiveParentId,
      status: 'scheduled',
      recipient: effectiveRecipient,
      auspostContact: effectiveAuspostContact,
      serviceInternalId,
      serviceRate,
      createdAt: new Date(),
      originalRequestId: request.id,
      operatorNetSuiteId: null,
      operatorName: null,
      operatorEmail: null,
      operatorPhone: null
    });
    
    console.log("Created scheduled_jobs template:", templateRef.id);
    finalJobId = templateRef.id;
    
    // Check if today matches frequency to immediately generate first instance
    const todayDayName = getDayName(new Date());
    if (request.date <= today && request.frequency?.includes(todayDayName)) {
      onProgress?.(50, "Creating first job instance...");
      jobDocRef = await addDoc(collection(db, 'jobs'), {
        ...requestData,
        service: scheduledService,
        parent_id: effectiveParentId,
        status: 'scheduled',
        recipient: effectiveRecipient,
        auspostContact: effectiveAuspostContact,
        serviceInternalId,
        serviceRate,
        createdAt: new Date(),
        jobType: 'scheduled_instance',
        scheduledJobId: templateRef.id,
        date: today,
        originalRequestId: request.id,
        operatorNetSuiteId: null,
        operatorName: null,
        operatorEmail: null,
        operatorPhone: null
      });
      console.log("Created immediate job instance:", jobDocRef.id);
      finalJobId = jobDocRef.id;
    }
  } else {
    // Normal one-off job
    onProgress?.(25, "Fetching customer service metadata...");
    
    try {
      if (effectiveParentId) {
        const custQ = query(
          collection(db, `companies/${effectiveParentId}/customers`),
          where('companyName', '==', request.customer.company)
        );
        const custSnap = await getDocs(custQ);
        if (!custSnap.empty) {
          const c = custSnap.docs[0].data();
          if (userData?.role === 'parent') {
            if (c.companyId || c.customerInternalId) {
              netsuiteCustomerId = c.companyId || c.customerInternalId;
            }
            if (Array.isArray(c.serviceList)) {
              const matched = c.serviceList.find((s: any) => s.name === request.service);
              if (matched) {
                serviceInternalId = matched.id || serviceInternalId;
                serviceRate = matched.rate || serviceRate;
              }
            }
          } else {
            if (request.service === 'lpo-to-site' || request.service === 'australia post-to-site') {
              serviceInternalId = c.lpoServiceAMPOInternalID || serviceInternalId;
              serviceRate = c.lpoServiceAMPORate || serviceRate;
            } else if (request.service === 'site-to-lpo' || request.service === 'site-to-australia post') {
              serviceInternalId = (isFreeJob && companyDataFromDb?.serviceTrialInternalID)
                ? companyDataFromDb.serviceTrialInternalID
                : (c.lpoServicePMPOInternalID || serviceInternalId);
              serviceRate = c.lpoServicePMPORate || serviceRate;
            } else if (request.service === 'round-trip') {
              serviceInternalId = c.lpoServiceAMPOPMPOInternalID || serviceInternalId;
              serviceRate = c.lpoServiceAMPOPMPORate || serviceRate;
            }
          }
        }
      }
    } catch (err) {
      console.error("Error fetching one-off service metadata:", err);
    }

    onProgress?.(45, "Creating job record...");

    const { id: _, ...requestData } = request;
    jobDocRef = await addDoc(collection(db, 'jobs'), {
      ...requestData,
      parent_id: effectiveParentId,
      status: 'scheduled',
      serviceInternalId,
      serviceRate,
      createdAt: new Date(),
      originalRequestId: request.id,
      operatorNetSuiteId: null,
      operatorName: null,
      operatorEmail: null,
      operatorPhone: null
    });
    console.log("Created one-off job:", jobDocRef.id);
    finalJobId = jobDocRef.id;
  }

  // Sync with NetSuite if same-day job instance was created
  if (request.date === today && jobDocRef) {
    onProgress?.(65, "Syncing instance...");
    const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2650&deploy=1&compid=1048144&ns-at=AAEJ7tMQwOy-VLSQwqUcq11USKGh9PAqMVQtMt6Mu_VXgYTiUyM";
    
    const params = new URLSearchParams({
      job_id: jobDocRef.id,
      billing: request.billing || "",
      customer_id: request.netsuiteCustomerId || request.customer?.netsuiteId || "",
      instructions: request.customer?.instructions || "",
      job_type: request.jobType || "",
      parent_id: effectiveParentId,
      request_id: request.id,
      preferred_time: request.preferredTime || "",
      service_name: request.service || "null",
      service_internal_id: serviceInternalId || "null",
      date: request.date || "null",
      service_pmpo_internal_id: request.servicePMPOInternalID || "null",
      service_pmpo_rate: request.servicePMPORate || "null",
      service_ampo_internal_id: request.serviceAMPOInternalID || "null",
      service_ampo_rate: request.serviceAMPORate || "null",
      service_h2h_internal_id: request.serviceH2HInternalID || "null",
      service_h2h_rate: request.serviceH2HRate || "null",
      auspost_first_name: request.auspostContact?.firstName || "null",
      auspost_last_name: request.auspostContact?.lastName || "null",
      auspost_phone: request.auspostContact?.phone || "null",
      auspost_email: request.auspostContact?.email || "null",
      auspost_company: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.company : request.recipient?.company) || "null",
      auspost_address: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.address : request.recipient?.address) || "null",
      auspost_state: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.state : request.recipient?.state) || "null",
      auspost_suburb: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.suburb : request.recipient?.suburb) || "null",
      auspost_postcode: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.postcode : request.recipient?.postcode) || "null",
      auspost_lat: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.coordinates?.lat : request.recipient?.coordinates?.lat)?.toString() || "null",
      auspost_lng: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.coordinates?.lng : request.recipient?.coordinates?.lng)?.toString() || "null",
      is_free_job: isFreeJob.toString(),
      admin_accepted: (userData?.role === 'admin' || userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid)) ? "true" : "false",
      send_email: sendEmail !== undefined ? (sendEmail ? "true" : "false") : "false",
      no_email: (sendEmail === false || (sendEmail === undefined && (userData?.role === 'admin' || userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid)))) ? "true" : "false",
      suppress_email: (sendEmail === false || (sendEmail === undefined && (userData?.role === 'admin' || userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid)))) ? "true" : "false"
    });

    try {
      const res = await fetch(`${NETSUITE_API}&${params.toString()}`);
      const data = await res.json();
      console.log("NetSuite Script 2650 Response:", data);
    } catch (err) {
      console.error("NetSuite Script 2650 Error:", err);
    }
  }

  // Secondary NetSuite Sync (Confirmation)
  const SECOND_NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2649&deploy=1&compid=1048144&ns-at=AAEJ7tMQX4gDftlZvyZi8scPrWJRKTOWGovx9I5Cz06qXdzpiRU";
  if (finalJobId) {
    onProgress?.(85, "Sending confirmation...");
    const params2649 = new URLSearchParams({
      job_id: finalJobId,
      parent_id: effectiveParentId,
      customer_id: netsuiteCustomerId,
      email: request.customer?.email || "",
      firstName: request.customer?.firstName || "",
      phone: request.customer?.phone || "",
      service: request.service || "",
      date: request.date || "null",
      frequency: request.jobType === 'scheduled' ? (request.frequency?.join(',') || "null") : "null",
      service_pmpo_internal_id: request.servicePMPOInternalID || "null",
      service_pmpo_rate: request.servicePMPORate || "null",
      service_ampo_internal_id: request.serviceAMPOInternalID || "null",
      service_ampo_rate: request.serviceAMPORate || "null",
      service_h2h_internal_id: request.serviceH2HInternalID || "null",
      service_h2h_rate: request.serviceH2HRate || "null",
      auspost_first_name: request.auspostContact?.firstName || "null",
      auspost_last_name: request.auspostContact?.lastName || "null",
      auspost_phone: request.auspostContact?.phone || "null",
      auspost_email: request.auspostContact?.email || "null",
      auspost_company: (request.service === 'lpo-to-site' || request.service === 'australia post-to-site' ? request.customer?.company : request.recipient?.company) || "null",
      is_free_job: isFreeJob.toString(),
      user_first_name: request.customer?.firstName || "null",
      user_last_name: request.customer?.lastName || "null",
      user_email: request.customer?.email || "null",
      user_phone: request.customer?.phone || "null",
      admin_accepted: (userData?.role === 'admin' || userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid)) ? "true" : "false",
      send_email: sendEmail !== undefined ? (sendEmail ? "true" : "false") : "false",
      no_email: (sendEmail === false || (sendEmail === undefined && (userData?.role === 'admin' || userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid)))) ? "true" : "false",
      suppress_email: (sendEmail === false || (sendEmail === undefined && (userData?.role === 'admin' || userData?.role === 'superadmin' || isSuperAdminUid(userData?.uid)))) ? "true" : "false"
    });

    try {
      const res = await fetch(`${SECOND_NETSUITE_API}&${params2649.toString()}`);
      const data = await res.json();
      console.log("NetSuite Script 2649 Response:", data);
    } catch (err) {
      console.error("NetSuite Script 2649 Error:", err);
    }
  }

  // Update Request Status
  onProgress?.(95, "Finalizing request status...");
  await updateDoc(doc(db, 'requests', request.id), {
    status: 'scheduled'
  });

  // Decrement trial balance for customer job requests
  if (isFreeJob && request.customer_id) {
    try {
      await updateDoc(doc(db, 'companies', request.customer_id), {
        trial_credits_balance: increment(-1)
      });
      const compSnap = await getDoc(doc(db, 'companies', request.customer_id));
      if (compSnap.exists()) {
        const newBalance = compSnap.data().trial_credits_balance;
        if (typeof newBalance === 'number') {
          const syncFn = httpsCallable(functions, 'syncProspectPlusTrialCredits');
          await syncFn({ customer_id: request.customer_id, trial_credits_balance: newBalance });
        }
      }
    } catch (e) {
      console.error("Failed to decrement and sync trial balance:", e);
    }
  }

  onProgress?.(100, "Job accepted successfully!");
  return { success: true, finalJobId };
};
