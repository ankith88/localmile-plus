import * as admin from 'firebase-admin';

// Initialize the Firebase app
// NOTE: To run this script, you must have your service account credentials set up.
// Example: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-file.json"
// Then run: npx ts-node scripts/migrateScheduledJobs.ts

admin.initializeApp();

const db = admin.firestore();

async function migrate() {
  console.log('Starting migration of scheduled jobs...');
  
  const jobsRef = db.collection('jobs');
  const scheduledJobsRef = db.collection('scheduled_jobs');

  const snapshot = await jobsRef.where('jobType', '==', 'scheduled').get();

  if (snapshot.empty) {
    console.log('No existing scheduled jobs found in the `jobs` collection.');
    return;
  }

  console.log(`Found ${snapshot.size} scheduled jobs to migrate.`);

  let batch = db.batch();
  let operationCount = 0;
  let migratedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Create new document in scheduled_jobs with the SAME ID
    const newDocRef = scheduledJobsRef.doc(doc.id);
    batch.set(newDocRef, data);
    
    // Delete the old document from jobs
    const oldDocRef = jobsRef.doc(doc.id);
    batch.delete(oldDocRef);

    operationCount += 2; // Set and Delete
    migratedCount++;

    // Firestore limits batch operations to 500
    if (operationCount >= 450) {
      await batch.commit();
      console.log(`Committed batch of ${operationCount} operations.`);
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${operationCount} operations.`);
  }

  console.log(`Migration complete. Successfully migrated ${migratedCount} scheduled jobs.`);
}

migrate().catch(console.error);
