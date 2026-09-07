import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'localmile-plus'
  });
}
const db = admin.firestore();

interface MissingServiceIdReport {
  companyId: string;
  companyName: string;
  servicePMPOInternalID: string | null;
  serviceTrialInternalID: string | null;
  trial_credits_balance: number | string;
  missingFields: string[];
  associatedUsers: {
    uid: string;
    email?: string;
    name?: string;
  }[];
}

async function auditCustomerCompanyServiceIds() {
  console.log('--- Starting Audit for Customer Company Service IDs ---');

  const usersRef = db.collection('users');
  const companiesRef = db.collection('companies');

  // 1. Fetch all users and identify customer role users
  const usersSnap = await usersRef.get();
  console.log(`Total users in collection: ${usersSnap.size}`);

  const customerCompanyMap = new Map<string, {
    users: { uid: string; email?: string; name?: string }[];
  }>();

  usersSnap.forEach(doc => {
    const data = doc.data();
    const isCustomer = (data.role && data.role.toLowerCase() === 'customer') ||
                       (data.userRole && data.userRole.toLowerCase() === 'customer') ||
                       (data.defaultRole && data.defaultRole.toLowerCase() === 'customer') ||
                       (Array.isArray(data.assignedRoles) && data.assignedRoles.some((r: string) => r.toLowerCase() === 'customer'));

    if (isCustomer) {
      const compId = data.companyId || data.company_id || data.customer_id || data.customerId;
      if (compId) {
        if (!customerCompanyMap.has(compId)) {
          customerCompanyMap.set(compId, { users: [] });
        }
        customerCompanyMap.get(compId)!.users.push({
          uid: doc.id,
          email: data.email || '',
          name: ((data.first_name || '') + ' ' + (data.last_name || '')).trim() || data.displayName || ''
        });
      }
    }
  });

  console.log(`Unique customer companies found linked to customer users: ${customerCompanyMap.size}`);

  // 2. Also check if any company document has trial_credits_balance
  const companiesSnap = await companiesRef.get();
  console.log(`Total companies in collection: ${companiesSnap.size}`);

  companiesSnap.forEach(doc => {
    const data = doc.data();
    if (typeof data.trial_credits_balance === 'number') {
      if (!customerCompanyMap.has(doc.id)) {
        customerCompanyMap.set(doc.id, { users: [] });
      }
    }
  });

  console.log(`Total customer companies to inspect: ${customerCompanyMap.size}`);

  const missingReport: MissingServiceIdReport[] = [];
  const validReport: { companyId: string; companyName: string }[] = [];

  for (const [compId, meta] of customerCompanyMap.entries()) {
    const compDoc = await companiesRef.doc(compId).get();

    if (!compDoc.exists) {
      missingReport.push({
        companyId: compId,
        companyName: 'DOCUMENT_DOES_NOT_EXIST',
        servicePMPOInternalID: null,
        serviceTrialInternalID: null,
        trial_credits_balance: 'N/A',
        missingFields: ['Company document does not exist in companies collection'],
        associatedUsers: meta.users
      });
      continue;
    }

    const compData = compDoc.data() || {};
    const pmpoId = compData.servicePMPOInternalID || null;
    const trialId = compData.serviceTrialInternalID || null;

    const missingFields: string[] = [];
    if (!pmpoId || pmpoId === '' || pmpoId === 'null') missingFields.push('servicePMPOInternalID');
    if (!trialId || trialId === '' || trialId === 'null') missingFields.push('serviceTrialInternalID');

    if (missingFields.length > 0) {
      missingReport.push({
        companyId: compId,
        companyName: compData.companyName || compData.name || 'N/A',
        servicePMPOInternalID: pmpoId,
        serviceTrialInternalID: trialId,
        trial_credits_balance: compData.trial_credits_balance ?? 'N/A',
        missingFields,
        associatedUsers: meta.users
      });
    } else {
      validReport.push({
        companyId: compId,
        companyName: compData.companyName || compData.name || 'N/A'
      });
    }
  }

  console.log('\n=========================================');
  console.log('AUDIT RESULTS:');
  console.log(`Total Customer Companies Checked: ${customerCompanyMap.size}`);
  console.log(`Companies Fully Configured: ${validReport.length}`);
  console.log(`Companies Missing Fields: ${missingReport.length}`);
  console.log('=========================================\n');

  if (missingReport.length > 0) {
    console.log('COMPANIES MISSING servicePMPOInternalID OR serviceTrialInternalID:');
    console.dir(missingReport, { depth: null });
  } else {
    console.log('All customer companies have both servicePMPOInternalID and serviceTrialInternalID properly set.');
  }
}

auditCustomerCompanyServiceIds().catch(console.error);
