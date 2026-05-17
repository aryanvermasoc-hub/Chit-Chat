// --- FIREBASE BACKGROUND NOTIFICATIONS ---
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAc1esUcE7tXVRIXvknsUZCrRJR_PNhMzE",
  projectId: "chat-373ed",
  messagingSenderId: "457068201028",
  appId: "1:457068201028:web:cf014c885371cf5c13e811"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Background message received: ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
// -----------------------------------------

const CACHE_NAME = "chitchat-v1";
// ... the rest of your sw.js code ...
const CACHE_NAME = "chitchat-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./crypto.js",
  "./firebase.js"
];

// Install event: Caches basic UI files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate event: Cleans up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch event: Network-first strategy to ensure Firebase works perfectly
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
