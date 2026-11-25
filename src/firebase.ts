import { initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

// Your web app's Firebase configuration (APP TOTEM - EBC)
const firebaseConfig = {
  apiKey: "AIzaSyCOFCIRlX5tmbsuIjpxaE9EN1q8LJWfIco",
  authDomain: "app-toten-ebc.firebaseapp.com",
  projectId: "app-toten-ebc",
  storageBucket: "app-toten-ebc.firebasestorage.app",
  messagingSenderId: "1056109925886",
  appId: "1:1056109925886:web:947156a4ce3dfac04ddcaf",
  measurementId: "G-5TKFF4WTB7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  });
} catch {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);

let analyticsInstance: Analytics | null = null;
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analyticsInstance = getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics safely skipped in restricted iframe / browser environments
    });
}
export { analyticsInstance as analytics };
