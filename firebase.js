import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAc1esUcE7tXVRIXvknsUZCrRJR_PNhMzE",
  authDomain: "chat-373ed.firebaseapp.com",
  projectId: "chat-373ed",
  storageBucket: "chat-373ed.appspot.com",
  messagingSenderId: "457068201028",
  appId: "1:457068201028:web:cf014c885371cf5c13e811"
};

// 1. Initialize Firebase App
const app = initializeApp(firebaseConfig);

// 2. Initialize and EXPORT Auth, Firestore (db), and Messaging
export const auth = getAuth(app);
export const db = getFirestore(app);

// Messaging needs a fallback for browsers that don't support it
export let messaging = null;
isSupported().then((supported) => {
    if (supported) {
        messaging = getMessaging(app);
    }
});