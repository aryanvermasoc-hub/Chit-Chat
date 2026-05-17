import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, query, orderBy, getDoc, getDocs, deleteDoc, updateDoc, arrayUnion, arrayRemove, writeBatch, limit, where } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAc1esUcE7tXVRIXvknsUZCrRJR_PNhMzE", 
  authDomain: "chat-373ed.firebaseapp.com",
  databaseURL: "https://chat-373ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-373ed", 
  storageBucket: "chat-373ed.firebasestorage.app",
  messagingSenderId: "457068201028", 
  appId: "1:457068201028:web:cf014c885371cf5c13e811"
};

export const app = initializeApp(firebaseConfig); 
export const db = getFirestore(app); 
export const auth = getAuth(app);