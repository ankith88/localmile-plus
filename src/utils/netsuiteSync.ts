import { doc, getDoc, getDocs, collection, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Manually calls NetSuite API (Suitelet Script 2650) for a job
 * and updates Firestore document to syncedWithNetSuite: true.
 */
export const syncJobWithNetSuite = async (
  job: any, 
  userData?: any
): Promise<{ success: boolean; message?: string }> => {
  if (!job || !job.id) {
    return { success: false, message: "Invalid job data." };
  }

  try {
    const NETSUITE_API = "https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl?script=2650&deploy=1&compid=1048144&ns-at=AAEJ7tMQwOy-VLSQwqUcq11USKGh9PAqMVQtMt6Mu_VXgYTiUyM";

    let customerIdVal = job.netsuiteCustomerId || job.customer?.netsuiteId || "";
    let parentId = job.parent_id || userData?.parent_id || "";
    let serviceInternalId = job.serviceInternalId || job.service_internal_id || "";
    let serviceRate = job.serviceRate || job.service_rate || "";
    const serviceName = job.service || job.service_name || "null";
    const isFreeJob = job.is_free_job === true || job.is_free_job === 'true';

    // If customerIdVal is missing, attempt to resolve from company doc
    if (!customerIdVal && job.customer_id) {
      try {
        const compSnap = await getDoc(doc(db, 'companies', job.customer_id));
        if (compSnap.exists()) {
          const cData = compSnap.data();
          customerIdVal = cData.netsuite_id || cData.netsuiteCustomerId || cData.customerInternalId || "";
        }
      } catch (e) {
        console.warn("Could not fetch company doc for NetSuite customer ID:", e);
      }
    }

    // If customer metadata or serviceInternalId is missing, attempt resolution from sub-customer record
    if (parentId && (!customerIdVal || !serviceInternalId) && job.customer?.company) {
      try {
        const custQ = query(
          collection(db, `companies/${parentId}/customers`),
          where('companyName', '==', job.customer.company)
        );
        const custSnap = await getDocs(custQ);
        if (!custSnap.empty) {
          const c = custSnap.docs[0].data();
          if (!customerIdVal) {
            customerIdVal = c.companyId || c.customerInternalId || "";
          }
          if (!serviceInternalId) {
            if (Array.isArray(c.serviceList)) {
              const matched = c.serviceList.find((s: any) => s.name === serviceName);
              if (matched) {
                serviceInternalId = matched.id || serviceInternalId;
                serviceRate = matched.rate || serviceRate;
              }
            }
            if (!serviceInternalId) {
              if (serviceName === 'lpo-to-site' || serviceName === 'australia post-to-site') {
                serviceInternalId = c.lpoServiceAMPOInternalID || "";
                serviceRate = c.lpoServiceAMPORate || serviceRate;
              } else if (serviceName === 'site-to-lpo' || serviceName === 'site-to-australia post') {
                serviceInternalId = c.lpoServicePMPOInternalID || "";
                serviceRate = c.lpoServicePMPORate || serviceRate;
              } else if (serviceName === 'round-trip') {
                serviceInternalId = c.lpoServiceAMPOPMPOInternalID || "";
                serviceRate = c.lpoServiceAMPOPMPORate || serviceRate;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Could not fetch sub-customer pricing metadata:", e);
      }
    }

    // Australia Post contact & recipient address resolution
    const isLpoToSite = serviceName === 'lpo-to-site' || serviceName === 'australia post-to-site';
    const auspostContact = job.auspostContact || {};
    const recipient = job.recipient || {};
    const customer = job.customer || {};

    const auspostCompany = (isLpoToSite ? customer?.company : (recipient?.company || customer?.company)) || "null";
    const auspostAddress = (isLpoToSite ? customer?.address : (recipient?.address || customer?.address)) || "null";
    const auspostState = (isLpoToSite ? customer?.state : (recipient?.state || customer?.state)) || "null";
    const auspostSuburb = (isLpoToSite ? customer?.suburb : (recipient?.suburb || customer?.suburb)) || "null";
    const auspostPostcode = (isLpoToSite ? customer?.postcode : (recipient?.postcode || customer?.postcode)) || "null";
    const auspostLat = (isLpoToSite ? customer?.coordinates?.lat : (recipient?.coordinates?.lat || customer?.coordinates?.lat))?.toString() || "null";
    const auspostLng = (isLpoToSite ? customer?.coordinates?.lng : (recipient?.coordinates?.lng || customer?.coordinates?.lng))?.toString() || "null";

    const params = new URLSearchParams({
      job_id: job.id,
      billing: job.billing || "",
      customer_id: customerIdVal || job.customer_id || "",
      instructions: customer?.instructions || job.instructions || "",
      job_type: job.jobType || "",
      parent_id: parentId,
      request_id: job.originalRequestId || job.requestId || "null",
      preferred_time: job.preferredTime || "",
      service_name: serviceName,
      service_internal_id: serviceInternalId || "null",
      date: job.date || "null",
      service_pmpo_internal_id: job.servicePMPOInternalID || job.service_pmpo_internal_id || "null",
      service_pmpo_rate: job.servicePMPORate || job.service_pmpo_rate || (serviceRate ? String(serviceRate) : "null"),
      service_ampo_internal_id: job.serviceAMPOInternalID || job.service_ampo_internal_id || "null",
      service_ampo_rate: job.serviceAMPORate || job.service_ampo_rate || "null",
      service_h2h_internal_id: job.serviceH2HInternalID || job.service_h2h_internal_id || "null",
      service_h2h_rate: job.serviceH2HRate || job.service_h2h_rate || "null",
      auspost_first_name: auspostContact?.firstName || "null",
      auspost_last_name: auspostContact?.lastName || "null",
      auspost_phone: auspostContact?.phone || "null",
      auspost_email: auspostContact?.email || "null",
      auspost_company: auspostCompany,
      auspost_address: auspostAddress,
      auspost_state: auspostState,
      auspost_suburb: auspostSuburb,
      auspost_postcode: auspostPostcode,
      auspost_lat: auspostLat,
      auspost_lng: auspostLng,
      is_free_job: isFreeJob.toString(),
      admin_accepted: "true",
      send_email: "false",
      no_email: "true",
      suppress_email: "true"
    });

    const fullUrl = `${NETSUITE_API}&${params.toString()}`;
    await fetch(fullUrl, { mode: 'no-cors' });

    // Update Firestore job doc
    await updateDoc(doc(db, 'jobs', job.id), {
      syncedWithNetSuite: true,
      syncedAt: serverTimestamp(),
      syncedBy: userData?.email || userData?.uid || 'admin'
    });

    return { success: true };
  } catch (err: any) {
    console.error("NetSuite manual sync failed:", err);
    return { success: false, message: err?.message || "Failed to sync with NetSuite" };
  }
};
