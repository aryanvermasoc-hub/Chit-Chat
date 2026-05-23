// Firebase scripts ko import karna
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

// Aapki Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAc1esUcE7tXVRIXvknsUZCrRJR_PNhMzE", 
  authDomain: "chat-373ed.firebaseapp.com",
  databaseURL: "https://chat-373ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-373ed", 
  storageBucket: "chat-373ed.firebasestorage.app",
  messagingSenderId: "457068201028", 
  appId: "1:457068201028:web:cf014c885371cf5c13e811"
};

// Firebase initialize karna
firebase.initializeApp(firebaseConfig);

// Messaging service start karna
const messaging = firebase.messaging();

// Background mein notifications receive aur show karne ka code
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png' // Agar aapke paas koi logo hai toh uska path yahan daalein, warna isey aise hi rehne dein
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});