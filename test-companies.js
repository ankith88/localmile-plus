const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = require('./src/firebase/config.ts'); // Wait, config is TS. I can't require it directly.
