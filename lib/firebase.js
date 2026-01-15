// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBe9gFYlDfa_AkKXVZMGJq9LiRCTwA7sTQ",
  authDomain: "atenea-3f809.firebaseapp.com",
  projectId: "atenea-3f809",
  storageBucket: "atenea-3f809.firebasestorage.app",
  messagingSenderId: "132441776864",
  appId: "1:132441776864:web:7dad18918b980238ce2685",
  measurementId: "G-NHCY41G3MJ"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
