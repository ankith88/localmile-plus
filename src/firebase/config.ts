import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getMessaging } from 'firebase/messaging';
import { getAnalytics } from "firebase/analytics";
import { getFunctions } from 'firebase/functions';

// TODO: Replace with actual Firebase config from USER
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCEKfFKLTso-t3Lu6YV8XOpCCBF2az9Hcg",
  authDomain: "localmile-plus.firebaseapp.com",
  projectId: "localmile-plus",
  storageBucket: "localmile-plus.firebasestorage.app",
  messagingSenderId: "1058596386803",
  appId: "1:1058596386803:web:ee4cf205f3512224c70486",
  measurementId: "G-P2FC478MV0"
};

export const googleMapsApiKey = "AIzaSyD0WG8MAX_KgiIOkrW4jGnxZ8b66R5zuKs";

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export default app;
