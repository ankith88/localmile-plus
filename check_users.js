import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, limit, query } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "localmile-plus" // Just need project ID if running locally via emulators, or we can use admin SDK
};

console.log("Checking");
