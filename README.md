# 💬 Chit-Chat

![Web App](https://img.shields.io/badge/Platform-Web_&_PWA-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Backend-FFCA28?logo=firebase&logoColor=black)

Chit-Chat is a fast, responsive, and real-time messaging Progressive Web App (PWA). It provides a seamless communication experience with features ranging from live status tracking to group conversations, built-in multiplayer games, and a custom media feed, all wrapped in a clean, modern UI.

## ✨ Key Features

* **Real-Time Messaging:** Instant message delivery and syncing across all active devices.
* **In-App Games:** Take a break from chatting and play interactive games directly within the app, featuring both vs. Computer and vs. Friend multiplayer modes.
* **Group Chat:** Create and participate in dynamic group conversations.
* **Secure Authentication:** Robust login system utilizing 6-digit verification codes powered by EmailJS.
* **Live Status Tracking:** See who is currently online or offline in real-time.
* **Custom Media Feed:** A dedicated media feed integrated directly into the app, specifically optimized to display and prioritize Facebook videos.
* **Progressive Web App (PWA):** Fully installable on desktop and mobile devices with Service Worker support for enhanced performance and offline capabilities.
* **Modern UI:** A sleek, centered logo design and intuitive user interface built for mobile and desktop responsiveness.

## 📁 Project Structure

```text
Chit-Chat/
├── api/                        # API routes and serverless functions (e.g., EmailJS OTP logic)
├── crypto.js                   # Custom cryptographic functions for secure data handling
├── firebase.js                 # Firebase initialization, database, and auth configuration
├── main.js                     # Core frontend application logic and UI state management
├── style.css                   # Global styling, layout structuring, and animations
├── index.html                  # Main application entry point and DOM structure
├── sw.js                       # Primary Service Worker for PWA caching and offline support
├── firebase-messaging-sw.js    # Dedicated Service Worker for Firebase push notifications
├── manifest.json               # PWA metadata, theme colors, and display configuration
├── package.json                # Project metadata, dependencies, and execution scripts
└── icon-192.png / 512.png      # Scalable application icons for device installation
📱 PWA Installation
Because Chit-Chat includes a manifest.json and registered Service Workers, you can install it directly to your device's home screen from any modern browser! Just look for the "Install App" icon in your browser's URL bar or options menu.

Designed & Built by Aryan Verma
