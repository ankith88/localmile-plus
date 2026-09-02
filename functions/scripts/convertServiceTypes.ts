import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'localmile-plus'
  });
}

const db = admin.firestore();

const isDryRun = process.argv.includes('--dry-run');

interface ConversionMap {
  [key: string]: string;
}

const SERVICE_MAPPING: ConversionMap = {
  'site-to-lpo': 'site-to-australia post',
  'lpo-to-site': 'australia post-to-site'
};

async function convertCollection(collectionName: string) {
  console.log(`\n========================================`);
  console.log(`Processing Collection: ${collectionName} ${isDryRun ? '(DRY RUN)' : ''}`);
  console.log(`========================================`);

  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();

  console.log(`Total documents in '${collectionName}': ${snapshot.size}`);

  const serviceCounts: Record<string, number> = {};
  let updatedCount = 0;

  let batch = db.batch();
  let operationCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const rawService = data.service;
    const normalizedService = (rawService || '').trim().toLowerCase();

    serviceCounts[rawService || 'undefined'] = (serviceCounts[rawService || 'undefined'] || 0) + 1;

    const newService = SERVICE_MAPPING[normalizedService] || SERVICE_MAPPING[rawService];

    if (newService && oldServiceMismatch(rawService, newService)) {
      console.log(`  [${doc.id}] '${rawService}' -> '${newService}'`);
      updatedCount++;

      if (!isDryRun) {
        batch.update(doc.ref, {
          service: newService,
          updatedAt: admin.firestore.Timestamp.now()
        });
        operationCount++;

        if (operationCount >= 400) {
          await batch.commit();
          console.log(`  --> Committed batch of ${operationCount} updates.`);
          batch = db.batch();
          operationCount = 0;
        }
      }
    }
  }

  function oldServiceMismatch(oldVal: string, newVal: string) {
    return oldVal !== newVal;
  }

  if (!isDryRun && operationCount > 0) {
    await batch.commit();
    console.log(`  --> Committed final batch of ${operationCount} updates.`);
  }

  console.log(`\nService breakdown for '${collectionName}':`, serviceCounts);
  console.log(`Finished processing '${collectionName}'. Total ${isDryRun ? 'would update' : 'updated'}: ${updatedCount}`);
  return { total: snapshot.size, updated: updatedCount };
}

async function run() {
  console.log(`Starting Service Type Conversion Script`);
  if (isDryRun) {
    console.log(`*** DRY RUN MODE ENABLED - No changes will be written to Firestore ***`);
  }

  try {
    const scheduledJobsResult = await convertCollection('scheduled_jobs');
    const jobsResult = await convertCollection('jobs');

    console.log(`\n========================================`);
    console.log(`MIGRATION SUMMARY ${isDryRun ? '(DRY RUN)' : ''}`);
    console.log(`========================================`);
    console.log(`scheduled_jobs: Total ${scheduledJobsResult.total}, Updated ${scheduledJobsResult.updated}`);
    console.log(`jobs          : Total ${jobsResult.total}, Updated ${jobsResult.updated}`);
    console.log(`========================================\n`);

  } catch (error) {
    console.error('Error running migration script:', error);
    process.exit(1);
  }
}

run();
