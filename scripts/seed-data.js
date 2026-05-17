import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, setDoc, terminate } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDklo95QYbj4PGZeKAqRBBzCfFKc9CFoXs",
  authDomain: "localmile-plus.firebaseapp.com",
  projectId: "localmile-plus",
  storageBucket: "localmile-plus.firebasestorage.app",
  messagingSenderId: "672243562252",
  appId: "1:672243562252:web:fa94020bf1184b4d817b29"
};

const app = initializeApp(firebaseConfig);

// Try initializing with explicit settings
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true, // Forces REST-like connection instead of GRPC
}, "lpoconnect");

const USER_EMAIL = "ankith88@gmail.com"; 
const USER_UID = "Or7QliQg8hbHCPmPVwGJmqiErJB2";

const seedData = async () => {
  console.log("🚀 Starting seeding for project:", firebaseConfig.projectId);

  try {
    const lpoId = "ROUSE_HILL_001";
    console.log("Writing LPO document...");
    await setDoc(doc(db, "lpo", lpoId), {
      name: "Rouse Hill LPO",
      location: "Rouse Hill",
      address: "10-14 Market Lane, Rouse Hill, NSW, 2155",
      lpo_id: lpoId,
      franchiseeTerritoryJSON: JSON.stringify([
        { suburb: "CASTLE HILL", state: "NSW", postcode: "2154" },
        { suburb: "KELLYVILLE", state: "NSW", postcode: "2155" },
        { suburb: "NORTH KELLYVILLE", state: "NSW", postcode: "2155" }
      ])
    });
    console.log("✅ LPO created.");

    console.log("Writing User mapping...");
    await setDoc(doc(db, "users", USER_UID), {
      email: USER_EMAIL,
      lpo_id: lpoId,
      role: "admin"
    });
    console.log(`✅ User mapping for ${USER_EMAIL} created.`);

    await terminate(db);
    console.log("\n✨ Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed with detailed error:");
    console.error(error);
    process.exit(1);
  }
};

seedData();
