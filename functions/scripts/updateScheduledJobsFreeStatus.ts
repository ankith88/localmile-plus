import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

async function updateScheduledJobsFreeStatus() {
  console.log('Starting audit of scheduled_jobs free status (customer role only)...');

  const scheduledJobsRef = db.collection('scheduled_jobs');
  const companiesRef = db.collection('companies');
  const usersRef = db.collection('users');

  const snapshot = await scheduledJobsRef.get();

  if (snapshot.empty) {
    console.log('No scheduled jobs found.');
    return;
  }

  console.log(`Found ${snapshot.size} total scheduled job templates to inspect.`);

  let updatedCount = 0;
  let skippedNonCustomerCount = 0;
  let skippedActiveTrialCount = 0;

  for (const doc of snapshot.docs) {
    const template = doc.data();

    // 1. Verify creator role is 'customer'
    let isCustomerRole = template.userRole === 'customer';
    if (!isCustomerRole && template.uid) {
      try {
        const userSnap = await usersRef.doc(template.uid).get();
        if (userSnap.exists && userSnap.data()?.role === 'customer') {
          isCustomerRole = true;
        }
      } catch (err) {
        console.error(`Error checking user ${template.uid}:`, err);
      }
    }

    if (!isCustomerRole) {
      skippedNonCustomerCount++;
      continue;
    }

    // 2. Fetch customer company data
    const customerId = template.customer_id;
    if (!customerId) {
      console.warn(`Scheduled job ${doc.id} missing customer_id.`);
      continue;
    }

    let trialBalance = 0;
    let companyData: any = null;
    try {
      const compSnap = await companiesRef.doc(customerId).get();
      if (compSnap.exists) {
        companyData = compSnap.data();
        trialBalance = typeof companyData?.trial_credits_balance === 'number' ? companyData.trial_credits_balance : 0;
      }
    } catch (err) {
      console.error(`Error fetching company ${customerId}:`, err);
    }

    // 3. If trial credits balance <= 0 and job is currently marked free, update to false
    const isCurrentlyFree = template.is_free_job === true || template.is_free_job === 'true';

    if (trialBalance <= 0) {
      if (isCurrentlyFree) {
        const updateData: any = {
          is_free_job: false
        };

        // If it was using trial service ID, revert to standard service ID
        if (companyData && companyData.servicePMPOInternalID && template.serviceInternalId === companyData.serviceTrialInternalID) {
          updateData.serviceInternalId = companyData.servicePMPOInternalID;
          if (companyData.servicePMPORate) {
            updateData.serviceRate = companyData.servicePMPORate;
          }
        }

        await scheduledJobsRef.doc(doc.id).update(updateData);
        console.log(`Updated scheduled job template ${doc.id} for customer ${customerId}: set is_free_job = false.`);
        updatedCount++;
      }
    } else {
      skippedActiveTrialCount++;
    }
  }

  console.log('\n--- Migration Audit Summary ---');
  console.log(`Total inspected: ${snapshot.size}`);
  console.log(`Skipped (non-customer role): ${skippedNonCustomerCount}`);
  console.log(`Skipped (active trial balance > 0): ${skippedActiveTrialCount}`);
  console.log(`Updated to is_free_job = false: ${updatedCount}`);
}

updateScheduledJobsFreeStatus().catch(console.error);
