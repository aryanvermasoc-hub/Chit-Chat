import { db, auth, messaging } from './firebase.js';
import { CryptoE2EE } from './crypto.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";
import { collection, addDoc, onSnapshot, doc, setDoc, query, orderBy, getDoc, getDocs, deleteDoc, updateDoc, arrayUnion, arrayRemove, writeBatch, limit, where } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
// Safe History API to prevent crashes during local mobile testing
const originalPushState = history.pushState;
history.pushState = function(state, title, url) {
    try { 
        originalPushState.apply(this, arguments); 
    } catch (e) { 
        console.warn("history.pushState blocked by local testing, ignoring error."); 
    }
};
// =========================================================
// URL CLEANUP LOGIC (Removes ?updated=... after reload)
// =========================================================
if (window.location.search.includes('updated=')) {
    const cleanUrl = window.location.href.split('?')[0];
    window.history.replaceState(null, '', cleanUrl);
}
const CLOUD_NAME = "ddkov7oka"; const UPLOAD_PRESET = "chitchat_preset"; 

let currentChatId = null; let currentChatStatus = null; let targetUserUid = null;
let messagesUnsubscribe = null; let chatMetaUnsubscribe = null; let chatDocUnsubscribe = null; 
let typingTimeout = null; let isSignupMode = false; let replyingToMsg = null; let isCurrentChatGroup = false; 
let allUsers = []; let allGroups = []; let myUserData = null; let myProfileUnsubscribe = null;
let currentGameId = null; let gameUnsubscribe = null; let isPlayingActionGame = false;
let singlePlayerMode = false; let currentAnimationId = null; let currentSpDifficulty = 'medium'; 
let activeMsgId = null; let activeMsgText = ""; let activeMsgSender = ""; let activeMsgContext = 'chat'; 
let pDoodleUnsubscribe = null; window.msgTimeouts = []; let generatedOTP = null; let pendingSignupData = null;
let activeSharedKey = null; // Holds the dynamically generated E2EE key for 1v1 chats

window.changeSpDifficulty = (val) => { currentSpDifficulty = val; };

let localStream = null; let remoteStream = null; let peerConnection = null;
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

const authScreen = document.getElementById("authScreen"); const appScreen = document.getElementById("appScreen");
const tabLogin = document.getElementById("tabLogin"); const tabSignup = document.getElementById("tabSignup");
const nameGroup = document.getElementById("nameGroup"); const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username"); const passwordInput = document.getElementById("password");
const authActionBtn = document.getElementById("authActionBtn"); const sidebar = document.getElementById("sidebar");
const usersList = document.getElementById("usersList"); const searchInput = document.getElementById("searchInput");
const activeChatState = document.getElementById("activeChatState"); const emptyChatState = document.getElementById("emptyChatState");
const chatBox = document.getElementById("chatBox"); const msgInput = document.getElementById("msg"); const sendBtn = document.getElementById("sendBtn");
const backToUsersBtn = document.getElementById("backToUsersBtn"); const chatToggleBtn = document.getElementById("chatToggleBtn"); const homeGamesBtn = document.getElementById("homeGamesBtn");
const newsFeedContainer = document.getElementById("newsFeedContainer"); const chatListContainer = document.getElementById("chatListContainer");
const gamesNavContainer = document.getElementById("gamesNavContainer"); const openUsersListBtn = document.getElementById("openUsersListBtn");
const chatSettingsBtn = document.getElementById("chatSettingsBtn"); const chatSettingsModal = document.getElementById("chatSettingsModal");
const modalMsgTimerSelect = document.getElementById("modalMsgTimerSelect"); const changeWallpaperBtn = document.getElementById("changeWallpaperBtn");
const wallpaperInput = document.getElementById("wallpaperInput"); const clearChatMeBtn = document.getElementById("clearChatMeBtn");
const removeWallpaperBtn = document.getElementById("removeWallpaperBtn"); const launchGameMenuBtn = document.getElementById("launchGameMenuBtn");
const chatDoodleBtn = document.getElementById("chatDoodleBtn");
const activeGameArea = document.getElementById("activeGameArea");
const gameUIContainer = document.getElementById("gameUIContainer");
const gameSelectionModal = document.getElementById("gameSelectionModal");
const closeGameSelectBtn = document.getElementById("closeGameSelectBtn");
const closeGameBtn = document.getElementById("closeGameBtn");
const ghostModeBtn = document.getElementById("ghostModeBtn"); window.isGhostModeActive = false;
if (ghostModeBtn) {
    ghostModeBtn.addEventListener("click", async () => {
        if (!currentChatId || isCurrentChatGroup) { showToast("Not available", "Ghost mode is for 1v1 chats only."); return; }
        try { await updateDoc(doc(db, "chats", currentChatId), { ghostModeActive: !window.isGhostModeActive }); } catch(e) { console.error(e); }
    });
}

function switchSidebarView(view) {
    newsFeedContainer.style.display = "none"; chatListContainer.style.display = "none"; gamesNavContainer.style.display = "none";
    if (view === 'chats') { chatListContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-message"></i> Chats'; chatToggleBtn.style.color = "white"; homeGamesBtn.style.color = "var(--text-muted)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; } 
    else if (view === 'games') { gamesNavContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed'; chatToggleBtn.style.color = "white"; homeGamesBtn.style.color = "var(--primary)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; } 
    else if (view === 'feed') { newsFeedContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed (Active)'; chatToggleBtn.style.color = "var(--accent)"; homeGamesBtn.style.color = "var(--text-muted)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; }
}
// Force strict mobile browsers (iOS) to register game card taps
document.querySelectorAll('.game-card').forEach(card => card.style.cursor = 'pointer');
bindPointerTap(homeGamesBtn, () => { switchSidebarView('games'); });
if(openUsersListBtn) bindPointerTap(openUsersListBtn, () => { switchSidebarView('chats'); openUsersListBtn.style.color = "var(--primary)"; });

// ADDED: Toggle listener for the Feed / Chats button
bindPointerTap(chatToggleBtn, () => {
    if (newsFeedContainer.style.display === "flex") {
        switchSidebarView('chats');
    } else {
        switchSidebarView('feed');
    }
});

const formatMentions = (text) => {
    if (!text) return text;
    const myUsername = myUserData ? myUserData.username.toLowerCase() : "";
    return text.replace(/@([a-zA-Z0-9_]+)/g, (match, username) => {
        const isMe = username.toLowerCase() === myUsername;
        const style = isMe 
            ? "color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.1); padding: 0 4px; border-radius: 4px;" 
            : "color: var(--primary); font-weight: bold;";
        return `<span style="${style}">${match}</span>`;
    });
};

const canSeePrivacy = (targetUser, privacyType) => {
    const setting = targetUser[privacyType] || 'everyone';
    if (setting === 'everyone' || targetUser.id === auth.currentUser.uid) return true;
    if (setting === 'none') return false;
    if (setting === 'friends') return !!(myUserData?.chatMeta?.[targetUser.id]);
    return true;
};

const generateAvatar = (userObj, fallbackName) => { 
    const name = (userObj && (userObj.fullName || userObj.username)) || fallbackName || "User";
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&rounded=true&bold=true`;
    if (userObj && userObj.avatarUrl) { if (canSeePrivacy(userObj, 'privacyPfp')) return userObj.avatarUrl; }
    return defaultAvatar;
};
function timeAgo(ms) { if (!ms) return ""; const seconds = Math.floor((Date.now() - ms) / 1000); if (seconds < 60) return "Just now"; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} min ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} hr ago`; return `${Math.floor(hours / 24)} days ago`; }

window.showToast = function(title, message, avatarUrl) {
  const container = document.getElementById("toastContainer"); if(!container) return;
  const toast = document.createElement("div"); toast.className = "toast";
  // Profile pic sirf tab dikhao jab kisi user ka avatarUrl explicitly pass ho
  const leftHtml = avatarUrl
    ? `<img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
    : `<div class="toast-sys-icon"><i class="fa-solid fa-bell"></i></div>`;
  toast.innerHTML = `${leftHtml}<div class="toast-content" style="display: flex; flex-direction: column; overflow: hidden;"><span style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${title}</span><span style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${message}</span></div>`;
  container.appendChild(toast); setTimeout(() => { toast.style.animation = "fadeOutToast 0.5s ease forwards"; setTimeout(() => { if(toast.parentElement) toast.remove(); }, 500); }, 4000);
};

function bindPointerTap(element, handler) {
  if (!element || typeof handler !== 'function') return;
  element.style.cursor = 'pointer'; // Forces iOS to recognize the element as clickable
  element.addEventListener('click', handler);
}
const emailGroup = document.getElementById("emailGroup"); const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");
const toggleAuthMode = (signup) => { 
  isSignupMode = signup; 
  if (signup) { tabSignup.classList.add("active"); tabLogin.classList.remove("active"); nameGroup.style.display = "flex"; if(emailGroup) emailGroup.style.display = "flex"; if(confirmPasswordGroup) confirmPasswordGroup.style.display = "flex"; authActionBtn.innerText = "Create Account"; } 
  else { tabLogin.classList.add("active"); tabSignup.classList.remove("active"); nameGroup.style.display = "none"; if(emailGroup) emailGroup.style.display = "none"; if(confirmPasswordGroup) confirmPasswordGroup.style.display = "none"; authActionBtn.innerText = "Enter Chit-Chat"; } 
};
tabLogin.addEventListener("click", () => toggleAuthMode(false)); tabSignup.addEventListener("click", () => toggleAuthMode(true));

authActionBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim().toLowerCase(); const password = passwordInput.value.trim(); const fullName = fullNameInput.value.trim();
  const realEmail = document.getElementById("emailInput") ? document.getElementById("emailInput").value.trim() : "";
  const confirmPassword = document.getElementById("confirmPassword") ? document.getElementById("confirmPassword").value.trim() : "";
  if (!username || !password || (isSignupMode && (!fullName || !realEmail || !confirmPassword))) { alert("Please fill in all required fields."); return; }
  if (isSignupMode && password !== confirmPassword) { alert("Passwords do not match!"); return; }
  if (username.includes(" ")) { alert("Username cannot contain spaces."); return; }

  authActionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
  try { 
      if (isSignupMode) { 
          const usernameQuery = query(collection(db, "users"), where("username", "==", username), limit(1));
          const usernameSnapshot = await getDocs(usernameQuery);
          if (!usernameSnapshot.empty) { alert("This username is already taken. Please choose a different one."); authActionBtn.innerText = "Create Account"; return; }
          generatedOTP = Math.floor(100000 + Math.random() * 900000).toString(); 
          pendingSignupData = { realEmail, password, username, fullName };
          const response = await fetch('/api/sendOtp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        to_name: fullName,
        to_email: realEmail,
        otp_code: generatedOTP
    })
});

if (!response.ok) {
    throw new Error("Failed to send OTP email.");
}
          document.getElementById("otpModal").style.display = "flex"; 
          authActionBtn.innerText = "Create Account"; 
      } else {
          let primaryEmail = username;
          let fallbackEmail = null;
          if (!username.includes('@')) {
              try {
                  const q = query(collection(db, "users"), where("username", "==", username), limit(1));
                  const querySnapshot = await getDocs(q);
                  if (!querySnapshot.empty) {
                      const userData = querySnapshot.docs[0].data();
                      primaryEmail = userData.realEmail || `${username}@chitchat.app`;
                      fallbackEmail = userData.realEmail ? `${username}@chitchat.app` : null; 
                  } else { primaryEmail = `${username}@chitchat.app`; }
              } catch (dbError) { primaryEmail = `${username}@chitchat.app`; }
          }
          try { await signInWithEmailAndPassword(auth, primaryEmail, password); } 
          catch (err) {
              if (fallbackEmail && (err.code === 'auth/invalid-login-credentials' || err.code === 'auth/invalid-credential')) { await signInWithEmailAndPassword(auth, fallbackEmail, password); } 
              else { throw err; }
          }
      }
  } catch (error) { alert(error.message.replace("Firebase: ", "") || "Failed to process request."); authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat"; }
});

document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
    const enteredOtp = document.getElementById("otpInput").value.trim(); const verifyBtn = document.getElementById("verifyOtpBtn");
    if (enteredOtp !== generatedOTP) { alert("Invalid OTP!"); return; }
    verifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...'; verifyBtn.disabled = true;
    try {
        const accountEmail = pendingSignupData.realEmail;
        const cred = await createUserWithEmailAndPassword(auth, accountEmail, pendingSignupData.password);
        
        // --- NEW: Web Crypto Keys generated exactly at signup ---
        const publicKey = await CryptoE2EE.generateKeys();
        
        await setDoc(doc(db, "users", cred.user.uid), { username: pendingSignupData.username, fullName: pendingSignupData.fullName, realEmail: pendingSignupData.realEmail, publicKey: publicKey, createdAt: Date.now(), isOnline: false, lastSeen: Date.now() });
        document.getElementById("otpModal").style.display = "none"; generatedOTP = null; pendingSignupData = null; document.getElementById("otpInput").value = "";
        verifyBtn.innerText = "Verify & Create Account"; verifyBtn.disabled = false; alert("Account verified! You can log in.");
        await signOut(auth); document.getElementById("tabLogin").click(); 
    } catch (error) { alert(error.message); verifyBtn.innerText = "Verify & Create Account"; verifyBtn.disabled = false; }
});

document.getElementById("settingsLogoutBtn").addEventListener("click", async () => { 
    if (confirm("Disconnect from Chit-Chat?")) { 
        try { await updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: Date.now() }); } catch (e) {} 
        if(myProfileUnsubscribe) myProfileUnsubscribe(); 
        document.getElementById("appSettingsModal").style.display = "none"; 
        signOut(auth); 
    } 
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    authScreen.style.display = "none"; appScreen.style.display = "flex"; history.pushState({ page: "home" }, ""); 
    await updateDoc(doc(db, "users", user.uid), { isOnline: true }); showToast("Welcome Back!", "You are securely connected.");
    window.addEventListener("beforeunload", () => updateDoc(doc(db, "users", user.uid), { isOnline: false, lastSeen: Date.now() }));
    
  // --- NOTIFICATION POP-UP CODE ---
    if (typeof Notification !== 'undefined' && 'serviceWorker' in navigator) {
        Notification.requestPermission().then(async (permission) => {
            if (permission === 'granted') {
                try {
                   const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js');
                    await navigator.serviceWorker.ready;
                    
                    // YAHAN PAR MAINE AAPKI CORRECTED KEY DAAL DI HAI 👇
                    const token = await getToken(messaging, { 
                        vapidKey: 'BBJgewscsRgCdrhz8e5MOgL1H_0S03ASN5m9w81HdhpUQdWQzzNdhQFp0XpxEHQn_tqkISTDETvtZHnmbYVfabI',
                        serviceWorkerRegistration: registration 
                    });
                    
                    if (token) await updateDoc(doc(db, "users", user.uid), { fcmToken: token });
                } catch(tokenErr) { console.log("FCM token error:", tokenErr); }
            }
        }).catch(err => console.log("Notification error:", err));
    }
    // --------------------------------

    startMyProfileListener(user.uid); loadSidebarData(); loadNewsFeed(); 
  } else {
    authScreen.style.display = "flex"; appScreen.style.display = "none"; emptyChatState.style.display = "flex"; activeChatState.style.display = "none";
    usernameInput.value = ""; passwordInput.value = ""; authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat"; myUserData = null;
  }
});

async function loadNewsFeed() {
  const container = document.getElementById("newsFeedContainer"); container.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading News...</div>';
  try {
    const res = await fetch(`https://dev.to/api/articles?per_page=15&page=${Math.floor(Math.random() * 5) + 1}&tag=programming`); const articles = await res.json(); container.innerHTML = '';
    articles.forEach(article => { container.innerHTML += `<div class="news-feed-card"><h4>${article.title}</h4><p>${article.description || 'Tap to read...'}</p><a href="${article.url}" target="_blank" rel="noopener noreferrer">Read Article</a></div>`; });
  } catch(e) { container.innerHTML = '<div style="text-align:center; color: #ff4757;">Failed to load news.</div>'; }
}

function startMyProfileListener(uid) {
  if(myProfileUnsubscribe) myProfileUnsubscribe();
  
  myProfileUnsubscribe = onSnapshot(doc(db, "users", uid), async (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      if (myUserData && data.chatMeta) {
        for (let otherUid in data.chatMeta) {
          let newMeta = data.chatMeta[otherUid];
          let oldMeta = myUserData.chatMeta ? myUserData.chatMeta[otherUid] : null;

          if (newMeta.unread && (!oldMeta || oldMeta.time !== newMeta.time)) {
            try {
                const sidebarEl = document.getElementById("sidebar");
                const activeChatEl = document.getElementById("activeChatState");
                const gameAreaEl = document.getElementById("activeGameArea");
                const reelsAreaEl = document.getElementById("reelsArea");

                const isSidebarCovering = window.innerWidth <= 992 && sidebarEl && !sidebarEl.classList.contains("hidden");
                const isGameCovering = gameAreaEl && gameAreaEl.style.display === "flex";
                const isReelsCovering = reelsAreaEl && reelsAreaEl.style.display === "flex";
                
                const isChatVisible = activeChatEl && activeChatEl.style.display === "flex" && !isSidebarCovering && !isGameCovering && !isReelsCovering;

                if (currentChatId && targetUserUid === otherUid && isChatVisible) {
                  // You are looking at the chat -> Just mark as read
                  await updateDoc(doc(db, "users", uid), { [`chatMeta.${otherUid}.unread`]: false });
                } else {
                  // You are NOT looking at the chat -> SHOW NOTIFICATIONS
                  const sender = allUsers.find(u => u.id === otherUid);
                  const sName = sender ? (sender.fullName || sender.username) : "Someone";
                  const sAvatar = generateAvatar(sender, sName);
                  let preview = newMeta.text;

                  // 1. Decrypt the message so it doesn't just say "Secure Message"
                  if (preview === "🎮 GAME CHALLENGE" || preview === "🎨 DOODLE REQUEST") {
                      preview = `${sName} sent you a request.`;
                  } else if (preview.startsWith("E2EE:")) {
                      try {
                          const tempKey = await CryptoE2EE.getSharedKey(sender.publicKey);
                          preview = await CryptoE2EE.decrypt(preview, tempKey); 
                      } catch (cryptoErr) {
                          preview = "🔒 Secure Message";
                      }
                  }
                  
                  // 2. Show the in-app HTML Toast
                  showToast(`New Message from ${sName}`, preview, sAvatar);
                  
                  // 3. FORCE THE NATIVE ANDROID NOTIFICATION
                  if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
                      navigator.serviceWorker.ready.then((registration) => {
                          registration.showNotification(`New message from ${sName}`, {
                              body: preview,
                              icon: sAvatar || './icon-192.png',
                              badge: './icon-192.png',
                              vibrate: [200, 100, 200] // Makes the phone buzz
                          });
                      });
                  }
                }
            } catch(err) {
                console.error("Notification Error Prevented:", err);
            }
          }
        }
      }
      
      myUserData = data;
      const displayName = data.fullName || data.username;
      document.getElementById("myName").innerText = displayName;
      document.getElementById("myUsername").innerText = `@${data.username}`;
      document.getElementById("myAvatar").src = generateAvatar(data, displayName);
      if(allUsers.length > 0) renderSidebar();
    }
  });
}
function loadSidebarData() {
  onSnapshot(collection(db, "users"), (snapshot) => { 
      allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
      renderSidebar(); 
      if (targetUserUid && !isCurrentChatGroup) {
          const tUser = allUsers.find(u => u.id === targetUserUid);
          if (tUser) document.getElementById("chatTargetAvatar").src = generateAvatar(tUser, tUser.fullName || tUser.username);
      }
      
      // NEW: Instantly update all visible chat bubbles on the screen
      document.querySelectorAll('.msg-avatar[data-uid]').forEach(img => {
          const uid = img.getAttribute('data-uid');
          const uUser = allUsers.find(x => x.id === uid);
          if (uUser) img.src = generateAvatar(uUser, uUser.fullName || uUser.username);
      });
  });
  onSnapshot(collection(db, "groups"), (snapshot) => { allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderSidebar(); });
}

document.getElementById("showUsersTab").addEventListener("click", () => { document.getElementById("showUsersTab").classList.add("active"); document.getElementById("showGroupsTab").classList.remove("active"); document.getElementById("usersList").style.display = "block"; document.getElementById("groupsList").style.display = "none"; });
document.getElementById("showGroupsTab").addEventListener("click", () => { document.getElementById("showGroupsTab").classList.add("active"); document.getElementById("showUsersTab").classList.remove("active"); document.getElementById("groupsList").style.display = "block"; document.getElementById("usersList").style.display = "none"; });

async function renderSidebar() {
  const usersListEl = document.getElementById("usersList"); const groupsListEl = document.getElementById("groupsList");

  // --- BUILD GROUPS into a fragment first (no DOM touch yet) ---
  const groupFrag = document.createDocumentFragment();
  let myGroups = allGroups.filter(g => g.members.includes(auth.currentUser.uid));
  if (myGroups.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;";
    empty.innerHTML = '<i class="fa-solid fa-users" style="font-size: 24px; margin-bottom: 10px; opacity: 0.5;"></i><br>You are not in any groups yet.';
    groupFrag.appendChild(empty);
  } else {
    myGroups.forEach(group => {
      const groupCard = document.createElement("div"); groupCard.className = "user-item";
      groupCard.innerHTML = `<div class="avatar-wrapper"><div class="avatar" style="background:var(--primary); display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; font-size:18px;">${group.name.charAt(0)}</div></div><div class="user-meta"><span class="name">${group.name}</span><span class="handle">${group.members.length} members</span></div>`;
      bindPointerTap(groupCard, () => openGroupChat(group.id, group.name, group.members.length));
      groupFrag.appendChild(groupCard);
    });
  }

  // --- BUILD USERS into a fragment — all awaits happen BEFORE touching the live DOM ---
  let sortedUsers = [...allUsers].filter(u => u.id !== auth.currentUser.uid);
  sortedUsers.sort((a, b) => { let timeA = myUserData?.chatMeta?.[a.id]?.time || 0; let timeB = myUserData?.chatMeta?.[b.id]?.time || 0; return timeB - timeA; });

  const userFrag = document.createDocumentFragment();
  if (sortedUsers.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;";
    empty.innerText = "No users found.";
    userFrag.appendChild(empty);
  } else {
    for (const user of sortedUsers) {
      const displayName = user.fullName || user.username;
      const avatarUrl = generateAvatar(user, displayName);
      const isOnline = (user.isOnline && canSeePrivacy(user, 'privacyStatus')) ? "online" : "";
      const meta = myUserData?.chatMeta?.[user.id]; const unreadStyle = meta?.unread ? "font-weight:700; color:var(--primary);" : "";
      let previewText = meta?.text ? meta.text : `@${user.username}`;
     // Decrypt Sidebar items gracefully
      if (previewText.startsWith("E2EE:")) {
        try {
            const tempKey = await CryptoE2EE.getSharedKey(user.publicKey);
            previewText = await CryptoE2EE.decrypt(previewText, tempKey);
        } catch (cryptoErr) {
            previewText = "🔒 Encrypted Message";
        }
      }
      const userCard = document.createElement("div"); userCard.className = "user-item";
      userCard.innerHTML = `<div class="avatar-wrapper"><img src="${avatarUrl}" class="avatar"><div class="status-dot ${isOnline}"></div></div><div class="user-meta"><span class="name" style="${unreadStyle}">${displayName}</span><span class="handle" style="${unreadStyle}">${previewText}</span></div>${meta?.unread ? '<div style="width:10px; height:10px; background:var(--primary); border-radius:50%; flex-shrink:0;"></div>' : ''}`;
      bindPointerTap(userCard, () => { if(meta?.unread) updateDoc(doc(db, "users", auth.currentUser.uid), { [`chatMeta.${user.id}.unread`]: false }); openChat(user.id, displayName, avatarUrl, user.isOnline, user.lastSeen, user.publicKey); });
      userFrag.appendChild(userCard);
    }
  }

  // --- ATOMIC DOM SWAP — only now do we clear and repopulate the live DOM ---
  if(groupsListEl) { groupsListEl.innerHTML = ""; groupsListEl.appendChild(groupFrag); }
  usersListEl.innerHTML = ""; usersListEl.appendChild(userFrag);
}

const createGroupBtn = document.getElementById("createGroupBtn");
if(createGroupBtn) {
  createGroupBtn.addEventListener("click", () => {
    const groupName = prompt("Enter a name for the new Group:"); if (!groupName) return;
    let promptText = "Select members by typing numbers:\n\n"; const selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid);
    selectableUsers.forEach((u, index) => { promptText += `${index + 1}. ${u.fullName || u.username}\n`; });
    const selections = prompt(promptText); if (!selections) return;
    let members = [auth.currentUser.uid]; selections.split(',').forEach(numText => { const idx = parseInt(numText.trim()) - 1; if (selectableUsers[idx]) members.push(selectableUsers[idx].id); });
    if (members.length > 1) { addDoc(collection(db, "groups"), { name: groupName, members: members, createdAt: Date.now(), createdBy: auth.currentUser.uid }); showToast("Group Created", `${groupName} was created successfully.`); } else { alert("At least one other person required."); }
  });
}

const profileModal = document.getElementById("profileModal"); const closeProfileBtn = document.getElementById("closeProfileBtn"); const profileAvatar = document.getElementById("profileAvatar"); const profileName = document.getElementById("profileName"); const profileHandle = document.getElementById("profileHandle"); const profileBioDisplay = document.getElementById("profileBioDisplay"); const profileBioEdit = document.getElementById("profileBioEdit"); const profileJoinDate = document.getElementById("profileJoinDate"); const editProfileBtn = document.getElementById("editProfileBtn"); const saveProfileBtn = document.getElementById("saveProfileBtn"); const profileAvatarInput = document.getElementById("profileAvatarInput"); const editAvatarBtn = document.getElementById("editAvatarBtn");
window.openProfile = async (uid) => { 
    profileModal.style.display = "flex"; editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "none"; editAvatarBtn.style.display = "none"; profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block"; profileBioDisplay.innerText = "Loading..."; 
    if (auth.currentUser && uid === auth.currentUser.uid) { editProfileBtn.style.display = "block"; editAvatarBtn.style.display = "block"; }
    try { const docSnap = await getDoc(doc(db, "users", uid)); if (docSnap.exists()) { const data = docSnap.data(); const dName = data.fullName || data.username; profileName.innerText = dName; profileHandle.innerText = `@${data.username}`; profileAvatar.src = generateAvatar(data, dName); const bioText = data.bio || "Hey there! I am using Chit-Chat."; profileBioDisplay.innerText = bioText; profileBioEdit.value = bioText; profileJoinDate.innerText = `Joined: ${new Date(data.createdAt || Date.now()).toLocaleDateString()}`; } } catch (e) { console.error(e); } 
};
closeProfileBtn.addEventListener("click", () => profileModal.style.display = "none"); profileModal.addEventListener("click", (e) => { if(e.target === profileModal) profileModal.style.display = "none"; });
editProfileBtn.addEventListener("click", () => { profileBioDisplay.style.display = "none"; profileBioEdit.style.display = "block"; editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "block"; profileBioEdit.focus(); });
saveProfileBtn.addEventListener("click", async () => { const newBio = profileBioEdit.value.trim(); saveProfileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; try { await updateDoc(doc(db, "users", auth.currentUser.uid), { bio: newBio }); profileBioDisplay.innerText = newBio || "Hey there! I am using Chit-Chat."; profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block"; saveProfileBtn.style.display = "none"; editProfileBtn.style.display = "block"; showToast("Profile Updated", "Bio saved."); } catch(e) {} finally { saveProfileBtn.innerHTML = 'Save Changes'; } });
editAvatarBtn.addEventListener("click", () => profileAvatarInput.click()); profileAvatarInput.addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file) return; editAvatarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; editAvatarBtn.disabled = true; try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url }); profileAvatar.src = data.secure_url; document.getElementById("myAvatar").src = data.secure_url; showToast("Avatar Updated", "New profile picture set!"); } catch(err) {} finally { editAvatarBtn.innerHTML = '<i class="fa-solid fa-camera"></i>'; editAvatarBtn.disabled = false; profileAvatarInput.value = ""; } });
document.querySelector(".current-user").addEventListener("click", () => { if(auth.currentUser) openProfile(auth.currentUser.uid); }); document.querySelector(".chat-target-info").addEventListener("click", () => { if(targetUserUid && !isCurrentChatGroup) openProfile(targetUserUid); });
if (backToUsersBtn) { 
    backToUsersBtn.addEventListener("click", () => { 
        if (window.innerWidth <= 992) { 
            sidebar.style.display = "flex"; activeChatState.style.display = "none"; emptyChatState.style.display = "none";
             currentChatId = null; targetUserUid = null; isCurrentChatGroup = false; activeSharedKey = null;
            if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
            if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
            if (chatMetaUnsubscribe) { chatMetaUnsubscribe(); chatMetaUnsubscribe = null; }
        } 
    }); 
}

function listenToChatStatus(targetName) {
    if (chatDocUnsubscribe) chatDocUnsubscribe();
    const overlay = document.getElementById("chatStateOverlay"); const inputWrapper = document.querySelector("#activeChatState .chat-input-wrapper");
    if (isCurrentChatGroup) { currentChatStatus = 'accepted'; if(overlay) overlay.style.display = "none"; if(inputWrapper) inputWrapper.style.display = "flex"; return; }
    
    chatDocUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (snap) => {
        if (snap.exists()) {
            const data = snap.data(); currentChatStatus = data.status;
            if (data.messageTimer !== undefined && modalMsgTimerSelect && modalMsgTimerSelect.value != data.messageTimer) modalMsgTimerSelect.value = data.messageTimer; 
            if (data.doodleActive) initPrivateDoodle(); else { if (document.getElementById("privateDoodleArea")) document.getElementById("privateDoodleArea").style.display = "none"; if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; } }
           if (data.wallpaperUrl) { 
                document.getElementById("chatWallpaper").style.backgroundImage = `linear-gradient(rgba(10,10,15,0.8), rgba(10,10,15,0.8)), url('${data.wallpaperUrl}')`; 
                localStorage.setItem(`wp_${currentChatId}`, data.wallpaperUrl); // Cache it
            } else { 
                document.getElementById("chatWallpaper").style.backgroundImage = "none"; 
                localStorage.removeItem(`wp_${currentChatId}`); // Clear cache
            }
            const previousGhostState = window.isGhostModeActive; window.isGhostModeActive = !!data.ghostModeActive;
            if (window.isGhostModeActive) {
                if (ghostModeBtn) ghostModeBtn.classList.add("active"); if (inputWrapper) inputWrapper.classList.add("ghost-input-active");
                if (!previousGhostState && currentChatStatus === 'accepted') showToast("Ghost Mode 👻", "Active! Messages vanish in 10s.");
            } else {
                if (ghostModeBtn) ghostModeBtn.classList.remove("active"); if (inputWrapper) inputWrapper.classList.remove("ghost-input-active");
                if (previousGhostState && currentChatStatus === 'accepted') showToast("Ghost Mode Off", "Back to normal chat mode.");
            }

            if (data.status === 'pending') {
                document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none";
                if(overlay) overlay.style.display = "flex"; if(inputWrapper) inputWrapper.style.display = "none";
                if (data.initiator === auth.currentUser.uid) { overlay.innerHTML = `<p style="font-size: 14px; margin: 0; color: var(--text-muted);"><i class="fa-solid fa-clock"></i> Request sent to <b>${targetName}</b>. Waiting...</p>`; } 
                else { overlay.innerHTML = `<p style="font-size: 14px; margin-bottom: 15px;"><strong style="color:var(--primary);">${targetName}</strong> wants to connect.</p><div style="display:flex; gap: 15px; justify-content: center;"><button onclick="acceptChatRequest()" class="primary-btn glow-btn" style="width:auto; padding: 8px 25px; background:#10b981;">Accept</button><button onclick="declineChatRequest()" class="primary-btn" style="width:auto; padding: 8px 25px; background:rgba(255,255,255,0.1); color:var(--text-muted);">Decline</button></div>`; }
            } else if (data.status === 'accepted') { 
                document.getElementById("chatDoodleBtn").style.display = "block"; if (ghostModeBtn) ghostModeBtn.style.display = "block"; document.getElementById("launchGameMenuBtn").style.display = "block"; document.getElementById("chatSettingsBtn").style.display = "block";
                if(overlay) overlay.style.display = "none"; if(inputWrapper) inputWrapper.style.display = "flex"; 
            }
        } else {
            currentChatStatus = 'none'; document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none";
            if(overlay) overlay.style.display = "flex"; if(inputWrapper) inputWrapper.style.display = "none";
            overlay.innerHTML = `<p style="font-size: 14px; margin-bottom: 15px;">You are not connected with <b>${targetName}</b>.</p><button onclick="sendChatRequest()" class="primary-btn glow-btn" style="width:auto; padding: 8px 25px;"><i class="fa-solid fa-user-plus"></i> Send Request</button>`;
        }
    });
}

window.openChat = async (targetUid, targetName, targetAvatar, isTargetOnline, targetLastSeen, targetPublicKey) => {
  isCurrentChatGroup = false; currentChatId = auth.currentUser.uid < targetUid ? `${auth.currentUser.uid}_${targetUid}` : `${targetUid}_${auth.currentUser.uid}`; targetUserUid = targetUid;
  document.getElementById("chatSettingsBtn").style.display = "none"; document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("launchGameMenuBtn").style.display = "none"; 
  document.getElementById("chatBox").innerHTML = ""; if(replyingToMsg) document.getElementById("cancelReplyBtn").click(); if (document.getElementById("privateDoodleArea")) document.getElementById("privateDoodleArea").style.display = "none";
  const overlay = document.getElementById("chatStateOverlay"); if(overlay) { overlay.style.display = "none"; overlay.innerHTML = ""; }
  // Instantly apply cached wallpaper if it exists to prevent delay
  const cachedWallpaper = localStorage.getItem(`wp_${currentChatId}`);
  if (cachedWallpaper) {
      document.getElementById("chatWallpaper").style.backgroundImage = `linear-gradient(rgba(10,10,15,0.8), rgba(10,10,15,0.8)), url('${cachedWallpaper}')`;
  } else {
      document.getElementById("chatWallpaper").style.backgroundImage = "none";
  }
  document.getElementById("chatTargetName").innerText = targetName; 
  document.getElementById("chatTargetAvatar").src = targetAvatar; 

  emptyChatState.style.display = "none"; 
  activeChatState.style.display = "flex"; 
  if(window.innerWidth <= 992) { sidebar.style.display = "none"; history.pushState({ page: "chat" }, ""); }

  // 1. FIRE THESE INSTANTLY so the wallpaper and typing status load immediately without waiting
  listenToTyping(); 
  listenToChatStatus(targetName); 

  // 2. NOW safely wait for Crypto keys to load for the messages
  try {
      activeSharedKey = await CryptoE2EE.getSharedKey(targetPublicKey);
  } catch (error) {
      console.error("Encryption blocked:", error);
      showToast("Security Warning", "E2EE requires a secure HTTPS connection.");
      activeSharedKey = null;
  }

  const targetUser = allUsers.find(u => u.id === targetUid);
  const targetStatus = document.getElementById("chatTargetStatus");
  if (targetUser && canSeePrivacy(targetUser, 'privacyStatus')) {
      if (isTargetOnline) { targetStatus.classList.add('online'); targetStatus.innerText = "Online"; } 
      else { targetStatus.classList.remove('online'); targetStatus.innerText = `Last seen: ${timeAgo(targetLastSeen)}`; }
  } else { targetStatus.classList.remove('online'); targetStatus.innerText = "Offline"; }
  
  loadMessages(); 
}

window.openGroupChat = (groupId, groupName, memberCount) => {
  isCurrentChatGroup = true; currentChatId = groupId; targetUserUid = null; activeSharedKey = null; // No E2EE for groups in this version
  document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none"; document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; 
  document.getElementById("chatBox").innerHTML = "";document.getElementById("chatWallpaper").style.backgroundImage = "none"; if(replyingToMsg) document.getElementById("cancelReplyBtn").click(); if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
  const overlay = document.getElementById("chatStateOverlay"); if(overlay) { overlay.style.display = "none"; overlay.innerHTML = ""; }
  const groupData = allGroups.find(g => g.id === groupId); const avatarToUse = groupData && groupData.avatarUrl ? groupData.avatarUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=8b5cf6&color=fff`;
  document.getElementById("chatTargetName").innerText = groupName; document.getElementById("chatTargetAvatar").src = avatarToUse; document.getElementById("chatTargetStatus").innerText = `${memberCount} members`;
  emptyChatState.style.display = "none"; activeChatState.style.display = "flex"; if(window.innerWidth <= 992) { sidebar.style.display = "none"; history.pushState({ page: "chat" }, ""); }
  loadMessages(); listenToChatStatus(groupName); 
}

function loadMessages() {
  if (messagesUnsubscribe) messagesUnsubscribe(); 
  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("time", "asc"));
  messagesUnsubscribe = onSnapshot(q, async (snapshot) => {
    chatBox.innerHTML = ""; let lastMyMsg = null; if(window.msgTimeouts) window.msgTimeouts.forEach(clearTimeout); window.msgTimeouts = []; const fragment = document.createDocumentFragment(); let lastMyMsgId = null;
    snapshot.forEach(d => { if(d.data().sender === auth.currentUser.uid) lastMyMsgId = d.id; });
    
    // We must handle decryption asynchronously line by line
    const docsArray = snapshot.docs;
    for(let i=0; i<docsArray.length; i++) {
      const docSnap = docsArray[i];
      const msg = docSnap.data(); const msgId = docSnap.id; const isMe = msg.sender === auth.currentUser.uid;
      if (isMe) lastMyMsg = msg; if (msg.isExpired) continue;
      const pDoodleArea = document.getElementById("privateDoodleArea"); const isDoodleOpen = pDoodleArea && pDoodleArea.style.display === "flex";
      const activeGameArea = document.getElementById("activeGameArea"); const isGameOpen = activeGameArea && activeGameArea.style.display === "flex";
const isSidebarCoveringChat = window.innerWidth <= 992 && sidebar.style.display !== "none";
        const isChatCurrentlyVisible = activeChatState.style.display === "flex" && document.visibilityState === 'visible' && !isSidebarCoveringChat;

      if (!isMe && !msg.seenAt && !isDoodleOpen && !isGameOpen && isChatCurrentlyVisible) { const updateData = { seenAt: Date.now() }; if (msg.timerDuration) { updateData.expiresAt = Date.now() + msg.timerDuration; } updateDoc(doc(db, "chats", currentChatId, "messages", msgId), updateData).catch(e=>{}); }
      if (msg.expiresAt) {
          const timeLeft = msg.expiresAt - Date.now();
          const wipeMessage = async () => {
              if (msg.imagePublicId) { try { await updateDoc(doc(db, "chats", currentChatId, "messages", msgId), { text: "🚫 Image Expired", imageUrl: null, isExpired: true }); } catch(e) {} } 
              else { try { await deleteDoc(doc(db, "chats", currentChatId, "messages", msgId)); } catch(e) { await updateDoc(doc(db, "chats", currentChatId, "messages", msgId), { text: "", expiresAt: null, isExpired: true }); } }
              if (!isCurrentChatGroup) { try { const expiredMeta = { time: Date.now(), text: "🚫 Message Expired", unread: false }; await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: expiredMeta } }, { merge: true }); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: expiredMeta } }, { merge: true }); } catch(err) {} }
          };
          if (timeLeft <= 0) { wipeMessage(); continue; } else { const timerId = setTimeout(() => { wipeMessage(); }, timeLeft); window.msgTimeouts.push(timerId); }
      }
      if (msg.deletedFor && msg.deletedFor.includes(auth.currentUser.uid)) continue;

      const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const div = document.createElement("div"); div.className = `message-wrapper ${isMe ? 'sent' : 'received'}`; let contentHtml = "";

      if (msg.isDoodleRequest) {
          if (isMe) { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎨 Doodle Request Sent</h4><p>Waiting for opponent to accept...</p></div>`; }
          else { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎨 Shared Whiteboard</h4><p>Wants to draw with you!</p><div class="challenge-actions"><button class="btn-accept" onclick="acceptDoodle()">Accept</button></div></div>`; }
      } else if (msg.isGameChallenge) {
         const gameNames = { "ludo": "Ludo Arena", "tictactoe": "Tic Tac Toe", "rps": "Rock Paper Scissors", "jetfighter": "Jet Fighter", "carracing": "Car Racing", "cybertanks": "Cyber Tanks (1v1)" };
          if (isMe) { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎮 Challenge Sent</h4><p>Waiting for opponent to accept ${gameNames[msg.gameType] || 'a Game'}...</p></div>`; } 
          else { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎮 Game Request</h4><p>Wants to play <b>${gameNames[msg.gameType] || 'a Game'}</b></p><div class="challenge-actions"><button class="btn-accept" onclick="acceptGameChallenge('${msg.gameId}', '${msg.gameType}')">Accept</button></div></div>`; }
      } else if (msg.isDeleted) { contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`; } 
      else {
        // E2EE Decryption
        let decryptedText = msg.text;
        if (msg.text && msg.text.startsWith("E2EE:")) decryptedText = await CryptoE2EE.decrypt(msg.text, activeSharedKey);
        if (!decryptedText && !msg.imageUrl) continue;
        
        let decReplyText = msg.replyToText;
        if (msg.replyToText && msg.replyToText.startsWith("E2EE:")) decReplyText = await CryptoE2EE.decrypt(msg.replyToText, activeSharedKey);
        
        let replyHtml = msg.replyToText ? `<div class="replied-msg-box" onclick="event.stopPropagation();"><b>${msg.replyToName}</b><div class="preview-text">${decReplyText}</div></div>` : "";
        let imgHtml = msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width:100%; border-radius:12px; margin-bottom:8px; cursor:pointer;" onclick="event.stopPropagation(); window.open('${msg.imageUrl}')" />` : "";
        let groupSenderHtml = (isCurrentChatGroup && !isMe) ? `<div style="font-size:11px; color:var(--primary); font-weight:600; margin-bottom:4px;">${msg.senderName}</div>` : "";
        const encodedText = encodeURIComponent(decryptedText || (msg.imageUrl ? 'Image' : '')); const encodedName = encodeURIComponent(isMe ? 'You' : (msg.senderName || document.getElementById('chatTargetName').innerText));
        const ghostClass = msg.isGhost ? 'ghost-msg' : '';
        const formattedText = formatMentions(decryptedText);
        contentHtml = `<div class="msg-bubble ${ghostClass}" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')">${groupSenderHtml}${replyHtml}${imgHtml}<span style="word-wrap: break-word; white-space: pre-wrap; display: block; max-width: 100%;">${formattedText}</span> ${msg.isEdited ? '<span style="font-size:10px; opacity:0.5; display:block; margin-top:5px;">(edited)</span>' : ''}</div>`; 
      }
      
      let avatarSrc = document.getElementById('chatTargetAvatar').src;
if (!isMe) {
    const senderUser = allUsers.find(u => u.id === msg.sender);
    if (senderUser) avatarSrc = generateAvatar(senderUser, msg.senderName);
}
      let seenTickHtml = (isMe && msgId === lastMyMsgId && msg.seenAt) ? `<i class="fa-solid fa-check-double" style="color: #3b82f6; margin-left: 5px; font-size: 11px;"></i>` : '';
      div.innerHTML = `${!isMe ? `<img src="${avatarSrc}" class="msg-avatar" data-uid="${msg.sender}">` : ''}<div style="display:flex; flex-direction:column; max-width: 100%;">${contentHtml}<div class="msg-time">${timeStr}${seenTickHtml}</div></div>`;
      fragment.appendChild(div);
    }
    chatBox.appendChild(fragment); chatBox.scrollTop = chatBox.scrollHeight;
  });
}

window.openMessageModal = (msgId, encodedText, encodedName, isMe, context = 'chat') => { 
    activeMsgId = msgId; activeMsgText = decodeURIComponent(encodedText); activeMsgSender = decodeURIComponent(encodedName); activeMsgContext = context;
    const list = document.getElementById("msgOptionsList"); list.innerHTML = `<button class="primary-btn" style="background: var(--primary);" onclick="triggerReply()"><i class="fa-solid fa-reply"></i> Reply</button>`; 
    if (isMe) list.innerHTML += `<button class="primary-btn" style="background: #3b82f6;" onclick="triggerEdit()"><i class="fa-solid fa-pen"></i> Edit Message</button><button class="primary-btn" style="background: #ef4444;" onclick="triggerDeleteEveryone()"><i class="fa-solid fa-trash-can"></i> Delete for Everyone</button>`; 
    list.innerHTML += `<button class="primary-btn" style="background: #f59e0b;" onclick="triggerDeleteMe()"><i class="fa-solid fa-eraser"></i> Delete for Me</button>`; document.getElementById("msgOptionsModal").style.display = "flex"; 
};
window.closeMsgOptions = () => { document.getElementById("msgOptionsModal").style.display = "none"; };
window.triggerReply = () => { closeMsgOptions(); replyingToMsg = { id: activeMsgId, text: activeMsgText, name: activeMsgSender, context: activeMsgContext }; document.getElementById("replyPreviewName").innerText = `Replying to ${activeMsgSender}`; document.getElementById("replyPreviewText").innerText = activeMsgText; const previewContainer = document.getElementById("replyPreviewContainer"); previewContainer.style.display = "flex"; if (activeMsgContext === 'global') { document.getElementById("exploreLounge").insertBefore(previewContainer, document.querySelector("#exploreLounge .chat-input-wrapper")); globalMsgInput.focus(); } else { document.getElementById("activeChatState").insertBefore(previewContainer, document.querySelector("#activeChatState .chat-input-wrapper")); msgInput.focus(); } };
window.triggerEdit = async () => { closeMsgOptions(); const newText = prompt("Edit message:", activeMsgText); if (newText && newText.trim() !== "" && newText !== activeMsgText) { if (activeMsgContext === 'global') { await updateDoc(doc(db, "global_lounge", activeMsgId), { text: newText.trim(), isEdited: true }); } else { const eText = activeSharedKey ? await CryptoE2EE.encrypt(newText.trim(), activeSharedKey) : newText.trim(); await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { text: eText, isEdited: true }); } } };
window.triggerDeleteEveryone = async () => { closeMsgOptions(); if (confirm("Delete this message for everyone?")) { if (activeMsgContext === 'global') { await updateDoc(doc(db, "global_lounge", activeMsgId), { isDeleted: true, text: "" }); } else { await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { isDeleted: true, text: "" }); } } };
window.triggerDeleteMe = async () => { closeMsgOptions(); if (confirm("Delete this message for yourself?")) { if (activeMsgContext === 'global') { await updateDoc(doc(db, "global_lounge", activeMsgId), { deletedFor: arrayUnion(auth.currentUser.uid) }); } else { await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { deletedFor: arrayUnion(auth.currentUser.uid) }); } } };
document.getElementById("cancelReplyBtn").addEventListener("click", () => { replyingToMsg = null; const previewContainer = document.getElementById("replyPreviewContainer"); previewContainer.style.display = "none"; document.getElementById("activeChatState").insertBefore(previewContainer, document.querySelector("#activeChatState .chat-input-wrapper")); });
window.sendChatRequest = async () => { if (!currentChatId || !targetUserUid) return; try { await setDoc(doc(db, "chats", currentChatId), { status: 'pending', initiator: auth.currentUser.uid, createdAt: Date.now() }); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "👋 Connection Request", unread: true } } }, { merge: true }); showToast("Request Sent", "Waiting for approval."); } catch (error) { showToast("Error", "Failed to send request."); } };
window.acceptChatRequest = async () => { if (!currentChatId) return; try { await updateDoc(doc(db, "chats", currentChatId), { status: 'accepted' }); showToast("Connected", "You can now chat!"); } catch (error) { showToast("Error", "Failed to accept request."); } };
window.declineChatRequest = async () => { if (!currentChatId) return; try { await deleteDoc(doc(db, "chats", currentChatId)); showToast("Declined", "Request removed."); if (window.innerWidth <= 992) document.getElementById("backToUsersBtn").click(); } catch (error) { showToast("Error", "Failed to decline request."); } };
function listenToTyping() { 
    if (chatMetaUnsubscribe) chatMetaUnsubscribe(); 
    if (isCurrentChatGroup) return; 
    chatMetaUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (docSnap) => { 
        const targetUser = allUsers.find(u => u.id === targetUserUid);
        const statusEl = document.getElementById("chatTargetStatus");
        if (targetUser && canSeePrivacy(targetUser, 'privacyStatus')) {
            if (docSnap.exists() && docSnap.data()[`typing_${targetUserUid}`]) { statusEl.innerText = "typing..."; } else { if (targetUser.isOnline) { statusEl.innerText = "Online"; } else { statusEl.innerText = `Last seen: ${timeAgo(targetUser.lastSeen)}`; } } 
        } else { statusEl.innerText = "Offline"; }
    }); 
}
msgInput.addEventListener("input", async () => { if(!currentChatId || isCurrentChatGroup) return; await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: true }, { merge: true }); clearTimeout(typingTimeout); typingTimeout = setTimeout(async () => { await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true }); }, 1500); });

async function sendMessage() {
  const text = msgInput.value.trim(); if (!text) return;
  const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000;
  msgInput.value = ""; msgInput.focus(); if (!isCurrentChatGroup && currentChatStatus !== 'accepted') return;
  
  // Encrypt outbound payload via Web Crypto
  let encryptedText = text;
  if (!isCurrentChatGroup && activeSharedKey) encryptedText = await CryptoE2EE.encrypt(text, activeSharedKey);
  
  if (!isCurrentChatGroup) { await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true }); try { await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { time: Date.now(), text: `You: ${text}`, unread: false } } }, { merge: true }); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: encryptedText, unread: true } } }, { merge: true }); } catch(err) {} }
  const payload = { text: encryptedText, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false, isGameChallenge: false };
  if (window.isGhostModeActive) { payload.timerDuration = 10000; payload.isGhost = true; } else if (timerValue > 0) { payload.timerDuration = timerValue; }
  
  if (replyingToMsg && replyingToMsg.context === 'chat') { 
      payload.replyToId = replyingToMsg.id; 
      payload.replyToText = activeSharedKey ? await CryptoE2EE.encrypt(replyingToMsg.text, activeSharedKey) : replyingToMsg.text; 
      payload.replyToName = replyingToMsg.name; document.getElementById("cancelReplyBtn").click(); 
  }
  try { await addDoc(collection(db, "chats", currentChatId, "messages"), payload); } catch (e) { showToast("Error", "Message failed to send."); }
}
sendBtn.addEventListener("click", sendMessage); msgInput.addEventListener("keypress", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } });
searchInput.addEventListener("input", (e) => { 
    const term = e.target.value.toLowerCase(); let hasVisible = false;
    document.querySelectorAll(".user-item").forEach(item => { const match = item.innerText.toLowerCase().includes(term); item.style.display = match ? "flex" : "none"; if (match) hasVisible = true; }); 
    let noResultsMsg = document.getElementById("noResultsSearch");
    if (!hasVisible && term !== "") { if (!noResultsMsg) { noResultsMsg = document.createElement("div"); noResultsMsg.id = "noResultsSearch"; noResultsMsg.style.cssText = "padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;"; noResultsMsg.innerText = "No connections match your search."; document.getElementById("usersList").appendChild(noResultsMsg); } noResultsMsg.style.display = "block"; } else if (noResultsMsg) { noResultsMsg.style.display = "none"; }
});
const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none"; document.body.appendChild(fileInput);
document.querySelector('.fa-paperclip').parentElement.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file || !currentChatId) return; const originalHtml = sendBtn.innerHTML; sendBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; sendBtn.disabled = true; try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000; const optimizedUrl = data.secure_url.replace('/upload/', '/upload/q_auto,f_auto,w_600/'); const payload = { text: "", imageUrl: optimizedUrl, imagePublicId: data.public_id, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false }; if (timerValue > 0) payload.timerDuration = timerValue; await addDoc(collection(db, "chats", currentChatId, "messages"), payload); } catch (err) { alert("Upload failed: " + err.message); } finally { sendBtn.innerHTML = originalHtml; sendBtn.disabled = false; fileInput.value = ""; } });
document.querySelector(".chat-header").addEventListener("click", (e) => {
    if (e.target.closest('.mobile-back-btn') || e.target.closest('#launchGameMenuBtn') || e.target.closest('#chatSettingsBtn') || e.target.closest('#chatDoodleBtn') || e.target.closest('#ghostModeBtn')) return;
    if (isCurrentChatGroup && currentChatId) {
        const group = allGroups.find(g => g.id === currentChatId); if(group) {
            document.getElementById("groupSettingsName").innerText = group.name; document.getElementById("groupMemberCount").innerText = group.members.length; document.getElementById("groupSettingsAvatar").src = group.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=8b5cf6&color=fff`;
            const membersListDiv = document.getElementById("groupMembersList"); membersListDiv.innerHTML = "<h4 style='font-size:12px; color:var(--text-muted); margin-bottom:8px;'>Group Members:</h4>"; const isAdmin = group.createdBy === auth.currentUser.uid;
            group.members.forEach(memberId => { 
                const userObj = allUsers.find(u => u.id === memberId); const name = userObj ? (userObj.fullName || userObj.username) : "Unknown User"; const isMe = memberId === auth.currentUser.uid ? " (You)" : ""; const adminBadge = memberId === group.createdBy ? " <i class='fa-solid fa-crown' style='color:#f59e0b; font-size:10px; margin-left:4px;' title='Admin'></i>" : "";
                let removeBtn = ""; if (isAdmin && memberId !== auth.currentUser.uid) { removeBtn = `<button onclick="triggerRemoveMember('${group.id}', '${memberId}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:12px; float:right; padding: 2px 5px;"><i class="fa-solid fa-user-minus"></i> Remove</button>`; }
                membersListDiv.innerHTML += `<div style="font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; width: 100%;"><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; padding-right: 10px;">${name}${isMe}${adminBadge}</div><div style="flex-shrink: 0;">${removeBtn}</div></div>`;   
            });
            const deleteBtn = document.getElementById("deleteGroupBtn"); const addMemberBtn = document.getElementById("addGroupMemberBtn"); const pendingReqDiv = document.getElementById("groupPendingRequests");
            if (addMemberBtn) { addMemberBtn.style.display = "flex"; addMemberBtn.innerHTML = isAdmin ? '<i class="fa-solid fa-user-plus"></i> Add New Member' : '<i class="fa-solid fa-user-plus"></i> Request to Add'; }
            if (isAdmin) { 
                deleteBtn.style.display = "flex"; 
                if (group.pendingMembers && group.pendingMembers.length > 0) {
                    pendingReqDiv.style.display = "block"; pendingReqDiv.innerHTML = "<h4 style='font-size:12px; color:var(--primary); margin-bottom:8px;'>Pending Approvals:</h4>";
                    group.pendingMembers.forEach(pendingId => {
                        const pUser = allUsers.find(u => u.id === pendingId); const pName = pUser ? (pUser.fullName || pUser.username) : "Unknown User";
                        pendingReqDiv.innerHTML += `<div style="font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;"><span>${pName}</span><div><button onclick="approveMember('${group.id}', '${pendingId}')" style="background:#10b981; border:none; color:white; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; margin-right:5px;">Approve</button><button onclick="rejectMember('${group.id}', '${pendingId}')" style="background:#ef4444; border:none; color:white; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Reject</button></div></div>`;
                    });
                } else { pendingReqDiv.style.display = "none"; }
                deleteBtn.onclick = async () => { if (confirm(`Are you sure you want to delete ${group.name}?`)) { deleteBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Deleting..."; const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages"))); const batch = writeBatch(db); msgsSnap.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); await deleteDoc(doc(db, "groups", currentChatId)); document.getElementById("groupSettingsModal").style.display = "none"; document.getElementById("backToUsersBtn").click(); showToast("Group Deleted", "Group permanently wiped."); } }; 
            } else { deleteBtn.style.display = "none"; if (pendingReqDiv) pendingReqDiv.style.display = "none"; }
            document.getElementById("groupSettingsModal").style.display = "flex";
        }
    }
});
window.triggerAddGroupMember = async () => { const group = allGroups.find(g => g.id === currentChatId); if(!group) return; const isAdmin = group.createdBy === auth.currentUser.uid; const pendingArr = group.pendingMembers || []; let promptText = "Type the number of the user to add:\n\n"; const selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid && !group.members.includes(u.id) && !pendingArr.includes(u.id)); if(selectableUsers.length === 0) { alert("All users are already in the group or pending approval!"); return; } selectableUsers.forEach((u, index) => { promptText += `${index + 1}. ${u.fullName || u.username}\n`; }); const selection = prompt(promptText); if(selection) { const idx = parseInt(selection.trim()) - 1; if(selectableUsers[idx]) { const targetUid = selectableUsers[idx].id; if (isAdmin) { await updateDoc(doc(db, "groups", currentChatId), { members: arrayUnion(targetUid) }); showToast("Member Added", `${selectableUsers[idx].fullName || selectableUsers[idx].username} was added.`); } else { await updateDoc(doc(db, "groups", currentChatId), { pendingMembers: arrayUnion(targetUid) }); showToast("Request Sent", "Admin must approve this request."); } document.getElementById("groupSettingsModal").style.display = "none"; } } };
window.triggerRemoveMember = async (groupId, memberId) => { if(confirm("Kick this user from the group?")) { try { await updateDoc(doc(db, "groups", groupId), { members: arrayRemove(memberId) }); showToast("Member Removed", "User was kicked from the group."); document.getElementById("groupSettingsModal").style.display = "none"; } catch(e) { alert("Failed to remove member. Are you sure you are the Admin?"); } } };
window.triggerGroupAvatarUpload = () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = async (e) => { const file = e.target.files[0]; if(!file) return; try { showToast("Uploading...", "Updating group icon"); const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "groups", currentChatId), { avatarUrl: data.secure_url }); document.getElementById("groupSettingsAvatar").src = data.secure_url; document.getElementById("chatTargetAvatar").src = data.secure_url; showToast("Success", "Group icon updated!"); } catch(err) { alert("Failed to update group image."); } }; input.click(); };

bindPointerTap(launchGameMenuBtn, () => { gameSelectionModal.style.display = "flex"; });
bindPointerTap(closeGameSelectBtn, () => { gameSelectionModal.style.display = "none"; });
document.querySelectorAll(".game-select-btn").forEach(btn => {
    bindPointerTap(btn, async () => {
        const gameType = btn.getAttribute("data-game"); gameSelectionModal.style.display = "none"; const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000;
        if (gameType === 'doodle') {
            if (isCurrentChatGroup) { alert("Doodle is for 1v1 only!"); return; }
            await updateDoc(doc(db, "chats", currentChatId), { doodleReq: auth.currentUser.uid });
            const payload = { sender: auth.currentUser.uid, time: Date.now(), isDoodleRequest: true, isDeleted: false }; if (timerValue > 0) payload.timerDuration = timerValue; 
            await addDoc(collection(db, "chats", currentChatId, "messages"), payload); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎨 DOODLE REQUEST", unread: true } } }, { merge: true });
            showToast("Request Sent", "Doodle request sent to friend."); return;
        }
        const gameId = `game_${Date.now()}_${auth.currentUser.uid}`;
        let initialData = { type: gameType, status: "waiting", player1: auth.currentUser.uid, player2: targetUserUid, createdAt: Date.now(), turn: auth.currentUser.uid, winner: null, p1Score: null, p2Score: null, board: ["","","","","","","","",""], p1Choice: null, p2Choice: null };
        if(gameType === 'ludo') { initialData.ludoTokens = { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }; initialData.diceValue = null; }
        await setDoc(doc(db, "games", gameId), initialData);
        const gPayload = { sender: auth.currentUser.uid, time: Date.now(), isGameChallenge: true, gameType: gameType, gameId: gameId, isDeleted: false }; if (timerValue > 0) gPayload.timerDuration = timerValue;
        await addDoc(collection(db, "chats", currentChatId, "messages"), gPayload); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎮 GAME CHALLENGE", unread: true } } }, { merge: true }); joinGameRoom(gameId, gameType);
    });
});
window.acceptGameChallenge = async (gameId, gameType) => { await updateDoc(doc(db, "games", gameId), { status: "playing" }); joinGameRoom(gameId, gameType); };
closeGameBtn.addEventListener("click", () => { if(currentAnimationId) cancelAnimationFrame(currentAnimationId); if (singlePlayerMode) { singlePlayerMode = false; spTttActive = false; if (window.innerWidth <= 992) sidebar.style.display = "flex"; } else { if(gameUnsubscribe) gameUnsubscribe(); if(currentGameId) { updateDoc(doc(db, "games", currentGameId), { status: "abandoned" }); } } activeGameArea.style.display = "none"; currentGameId = null; isPlayingActionGame = false; if (currentChatId) { loadMessages(); } });
function joinGameRoom(gameId, gameType) {
    currentGameId = gameId; isPlayingActionGame = false; singlePlayerMode = false; activeGameArea.style.display = "flex";
    let gTitle = "Game"; if (gameType === 'tictactoe') gTitle = "Tic Tac Toe"; if (gameType === 'rps') gTitle = "Rock Paper Scissors"; if (gameType === 'jetfighter') gTitle = "Jet Fighter"; if (gameType === 'carracing') gTitle = "Car Racing"; if (gameType === 'ludo') gTitle = "Ludo Arena"; document.getElementById("activeGameTitle").innerText = gTitle;
    if(gameUnsubscribe) gameUnsubscribe();
    gameUnsubscribe = onSnapshot(doc(db, "games", gameId), (docSnap) => {
        if(!docSnap.exists()) return; const data = docSnap.data();
        if(data.status === "abandoned") { gameUIContainer.innerHTML = `<h3 style="color:var(--accent);">Opponent left the game.</h3>`; isPlayingActionGame = false; return; }
        if(data.status === "waiting") { gameUIContainer.innerHTML = `<h3>Waiting for opponent... <i class="fa-solid fa-spinner fa-spin"></i></h3>`; isPlayingActionGame = false; return; }
        if (data.type === 'tictactoe') renderTicTacToe(data, gameId); if (data.type === 'rps') renderRPS(data, gameId); if (data.type === 'jetfighter') renderActionGame(data, gameId, 'jetfighter'); if (data.type === 'carracing') renderActionGame(data, gameId, 'carracing'); if (data.type === 'ludo') renderLudo(data, gameId);
        if (gameType === 'cybertanks') gTitle = "Cyber Tanks (1v1)";
        if (data.type === 'cybertanks') renderActionGame(data, gameId, 'cybertanks');
    });
}
const ludoPath = [ {x:30,y:130}, {x:50,y:130}, {x:70,y:130}, {x:90,y:130}, {x:110,y:130}, {x:130,y:110}, {x:130,y:90}, {x:130,y:70}, {x:130,y:50}, {x:130,y:30}, {x:130,y:10}, {x:150,y:10}, {x:170,y:10}, {x:170,y:30}, {x:170,y:50}, {x:170,y:70}, {x:170,y:90}, {x:170,y:110}, {x:190,y:130}, {x:210,y:130}, {x:230,y:130}, {x:250,y:130}, {x:270,y:130}, {x:290,y:130}, {x:290,y:150}, {x:290,y:170}, {x:270,y:170}, {x:250,y:170}, {x:230,y:170}, {x:210,y:170}, {x:190,y:170}, {x:170,y:190}, {x:170,y:210}, {x:170,y:230}, {x:170,y:250}, {x:170,y:270}, {x:170,y:290}, {x:150,y:290}, {x:130,y:290}, {x:130,y:270}, {x:130,y:250}, {x:130,y:230}, {x:130,y:210}, {x:130,y:190}, {x:110,y:170}, {x:90,y:170}, {x:70,y:170}, {x:50,y:170}, {x:30,y:170}, {x:10,y:170}, {x:10,y:150}, {x:10,y:130}, {x:30,y:150}, {x:50,y:150}, {x:70,y:150}, {x:90,y:150}, {x:110,y:150}, {x:270,y:150}, {x:250,y:150}, {x:230,y:150}, {x:210,y:150}, {x:190,y:150} ]; const ludoBases = { p1: [{x:40,y:40}, {x:80,y:40}, {x:40,y:80}, {x:80,y:80}], p2: [{x:220,y:220}, {x:260,y:220}, {x:220,y:260}, {x:260,y:260}] };
function renderLudo(data, gameId) {
    const isPlayer1 = data.player1 === auth.currentUser.uid; const isMyTurn = data.turn === auth.currentUser.uid; const myRole = isPlayer1 ? 'p1' : 'p2'; const diceIcons = ['🎲', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']; let currentDice = data.diceValue ? diceIcons[data.diceValue] : '🎲';
    let statusText = data.winner ? (data.winner === auth.currentUser.uid ? "🎉 You Won!" : "😞 You Lost!") : (isMyTurn ? "Your Turn" : "Opponent's Turn"); let colorTheme = isMyTurn && !data.winner ? (isPlayer1 ? '#ef4444' : '#3b82f6') : 'white';
    let p1User = allUsers.find(u => u.id === data.player1) || { fullName: 'Player 1' }; let p2User = allUsers.find(u => u.id === data.player2) || { fullName: 'Player 2' }; if (data.player1 === auth.currentUser.uid) p1User.fullName = "You"; if (data.player2 === auth.currentUser.uid) p2User.fullName = "You";
    let html = `<div class="ludo-header-info"><div class="ludo-player-badge red-badge ${data.turn === data.player1 && !data.winner ? 'active' : ''}">${p1User.fullName || p1User.username}</div><div class="ludo-vs">VS</div><div class="ludo-player-badge blue-badge ${data.turn === data.player2 && !data.winner ? 'active' : ''}">${p2User.fullName || p2User.username}</div></div><div class="game-turn-indicator" style="color: ${colorTheme}; font-weight:bold; margin-top: 10px;">${statusText}</div><div class="ludo-container"><div class="ludo-board-wrapper" id="ludoBoard"></div><div class="ludo-controls"><button id="ludoDiceBtn" class="dice-btn ${data.diceValue ? '' : 'pulse'}" ${!isMyTurn || data.winner ? 'disabled' : ''} onclick="rollLudoDice('${gameId}', '${myRole}')">${currentDice}</button></div>${data.winner ? `<button class="primary-btn glow-btn" style="max-width:200px;" onclick="resetLudo('${gameId}')">Play Again</button>` : ''}</div>`;
    gameUIContainer.innerHTML = html; const board = document.getElementById("ludoBoard"); board.innerHTML += `<div class="ludo-base red-base"><div class="base-inner"></div></div><div class="ludo-base blue-base"><div class="base-inner"></div></div>`;
    ludoPath.forEach((pos, i) => { let extraClass = ''; if (i >= 52 && i <= 56) extraClass = 'path-red'; if (i >= 57 && i <= 61) extraClass = 'path-blue'; const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; if (safeZones.includes(i)) extraClass += ' safe-zone'; if (i === 0) extraClass += ' start-red'; if (i === 26) extraClass += ' start-blue'; board.innerHTML += `<div class="ludo-cell ${extraClass}" style="left:${pos.x - 10}px; top:${pos.y - 10}px;">${safeZones.includes(i) ? '<i class="fa-solid fa-star" style="font-size:8px; opacity:0.5; color:white;"></i>' : ''}</div>`; });
    ['p1', 'p2'].forEach(player => { data.ludoTokens[player].forEach((pos, index) => { let coords = pos === -1 ? ludoBases[player][index] : ludoPath[pos]; if ((player === 'p1' && pos === 57) || (player === 'p2' && pos === 62)) return; let token = document.createElement("div"); token.className = `ludo-token token-${player === 'p1' ? 'red' : 'blue'}`; if (isMyTurn && player === myRole && data.diceValue) { token.classList.add('token-playable'); } token.style.left = `${coords.x}px`; token.style.top = `${coords.y}px`; if (isMyTurn && player === myRole && data.diceValue) { token.onclick = () => moveLudoToken(gameId, data, index, myRole); } board.appendChild(token); }); });
}
window.rollLudoDice = async (gameId, myRole) => { const diceBtn = document.getElementById("ludoDiceBtn"); diceBtn.classList.add("dice-rolling"); diceBtn.classList.remove("pulse"); diceBtn.disabled = true; setTimeout(async () => { const roll = Math.floor(Math.random() * 6) + 1; await updateDoc(doc(db, "games", gameId), { diceValue: roll }); const docSnap = await getDoc(doc(db, "games", gameId)); const data = docSnap.data(); let canMove = false; data.ludoTokens[myRole].forEach(pos => { if (pos === -1 && roll === 6) canMove = true; if (pos !== -1) { if (myRole === 'p1' && pos + roll <= 57) canMove = true; if (myRole === 'p2') { let absoluteProgress = pos >= 26 ? (pos - 26) : (pos + 26); if (absoluteProgress + roll <= 57) canMove = true; } } }); if (!canMove) { showToast("No Moves!", "Skipping turn..."); const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; await updateDoc(doc(db, "games", gameId), { turn: nextTurn, diceValue: null }); } }, 500); };
window.moveLudoToken = async (gameId, data, tokenIndex, role) => { let tokens = { ...data.ludoTokens }; let roll = data.diceValue; let currPos = tokens[role][tokenIndex]; let newPos = currPos; if (currPos === -1) { if (roll !== 6) return; newPos = role === 'p1' ? 0 : 26; } else { if (role === 'p1') { newPos = currPos + roll; if (newPos > 51 && currPos <= 51) newPos = 51 + (newPos - 51); if (newPos > 57) return; } else { newPos = currPos + roll; if (currPos <= 24 && newPos >= 25) { newPos = 56 + (newPos - 24); } else if (newPos > 51 && currPos > 24 && currPos <= 51) { newPos = newPos - 52; } if (newPos > 62) return; } } tokens[role][tokenIndex] = newPos; const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; let hasKilled = false; let oppRole = role === 'p1' ? 'p2' : 'p1'; if (!safeZones.includes(newPos) && newPos <= 51) { tokens[oppRole].forEach((oppPos, idx) => { if (oppPos === newPos) { tokens[oppRole][idx] = -1; hasKilled = true; } }); } let hasWon = false; if (role === 'p1' && tokens.p1.every(p => p === 57)) hasWon = true; if (role === 'p2' && tokens.p2.every(p => p === 62)) hasWon = true; let nextTurn = data.turn; let nextDice = null; if (roll !== 6 && !hasKilled && !hasWon) { nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; } await updateDoc(doc(db, "games", gameId), { ludoTokens: tokens, turn: nextTurn, diceValue: nextDice, winner: hasWon ? auth.currentUser.uid : null }); };
window.resetLudo = async (gameId) => { const docSnap = await getDoc(doc(db, "games", gameId)); await updateDoc(doc(db, "games", gameId), { ludoTokens: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }, winner: null, turn: docSnap.data().player1, diceValue: null }); };
window.startSinglePlayer = (gameType) => { singlePlayerMode = true; currentGameId = null; if (window.innerWidth <= 992) sidebar.style.display = "none"; activeGameArea.style.display = "flex"; if (gameType === 'tictactoe') { spTttReset(); } else if (gameType === 'rps') { renderSinglePlayerRPS(); } else if (gameType === 'jetfighter' || gameType === 'carracing' || gameType === 'flappybird') { renderSinglePlayerAction(gameType); } };
let spTttBoard = ["","","","","","","","",""]; let spTttActive = true;
window.renderSinglePlayerTTT = () => { document.getElementById("activeGameTitle").innerText = "Tic Tac Toe (Solo)"; let html = `<div class="game-turn-indicator" style="margin-bottom:10px;">You vs Computer</div><select id="spDifficulty" class="difficulty-select" onchange="changeSpDifficulty(this.value)"><option value="easy" ${currentSpDifficulty==='easy'?'selected':''}>Difficulty: Easy</option><option value="medium" ${currentSpDifficulty==='medium'?'selected':''}>Difficulty: Medium</option><option value="hard" ${currentSpDifficulty==='hard'?'selected':''}>Difficulty: Hard</option></select><div class="ttt-board">`; spTttBoard.forEach((cell, i) => { const cellClass = cell === 'X' ? 'x' : (cell === 'O' ? 'o' : ''); html += `<div class="ttt-cell ${cellClass}" onclick="spTttMove(${i})">${cell}</div>`; }); html += `</div>`; if(!spTttActive) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="spTttReset()">Play Again</button>`; gameUIContainer.innerHTML = html; };
function getBotMoveTTT(board, difficulty) { let empty = board.map((c, i) => c === "" ? i : null).filter(c => c !== null); if (empty.length === 0) return -1; if (difficulty === 'easy') return empty[Math.floor(Math.random() * empty.length)]; const checkWin = (player) => { const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for(let line of lines) { const [a,b,c] = line; if(board[a]===player && board[b]===player && board[c]==="") return c; if(board[a]===player && board[c]===player && board[b]==="") return b; if(board[b]===player && board[c]===player && board[a]==="") return a; } return null; }; let winMove = checkWin("O"); let blockMove = checkWin("X"); if (difficulty === 'hard') { if (winMove !== null) return winMove; if (blockMove !== null) return blockMove; if (board[4] === "") return 4; const corners = [0, 2, 6, 8].filter(c => board[c] === ""); if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)]; return empty[Math.floor(Math.random() * empty.length)]; } if (Math.random() > 0.4) { if (winMove !== null) return winMove; if (blockMove !== null) return blockMove; } return empty[Math.floor(Math.random() * empty.length)]; }
window.spTttMove = (i) => { if(!spTttActive || spTttBoard[i] !== "") return; spTttBoard[i] = "X"; if(checkTttWin(spTttBoard, "X")) { spTttEnd("🎉 You Won!"); return; } if(!spTttBoard.includes("")) { spTttEnd("It's a Draw!"); return; } let botMove = getBotMoveTTT(spTttBoard, currentSpDifficulty); if(botMove !== -1) { spTttBoard[botMove] = "O"; if(checkTttWin(spTttBoard, "O")) { spTttEnd("😞 Computer Won!"); return; } if(!spTttBoard.includes("")) { spTttEnd("It's a Draw!"); return; } } renderSinglePlayerTTT(); };
function checkTttWin(board, player) { const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; return lines.some(line => line.every(idx => board[idx] === player)); }
function spTttEnd(msg) { spTttActive = false; renderSinglePlayerTTT(); document.querySelector('.game-turn-indicator').innerText = msg; }
window.spTttReset = () => { spTttBoard = ["","","","","","","","",""]; spTttActive = true; renderSinglePlayerTTT(); };
let spRpsHistory = [];
window.renderSinglePlayerRPS = () => { document.getElementById("activeGameTitle").innerText = "RPS (Solo)"; let html = `<div class="game-turn-indicator" style="margin-bottom:10px;">Make your choice!</div><select id="spDifficulty" class="difficulty-select" onchange="changeSpDifficulty(this.value)"><option value="easy" ${currentSpDifficulty==='easy'?'selected':''}>Difficulty: Easy</option><option value="medium" ${currentSpDifficulty==='medium'?'selected':''}>Difficulty: Medium</option><option value="hard" ${currentSpDifficulty==='hard'?'selected':''}>Difficulty: Hard</option></select><div class="rps-controls"><button class="rps-btn" onclick="spRpsMove('rock')"><i class="fa-solid fa-hand-back-fist"></i></button><button class="rps-btn" onclick="spRpsMove('paper')"><i class="fa-solid fa-hand"></i></button><button class="rps-btn" onclick="spRpsMove('scissors')"><i class="fa-solid fa-hand-scissors"></i></button></div>`; gameUIContainer.innerHTML = html; };
window.spRpsMove = (choice) => { spRpsHistory.push(choice); const choices = ['rock', 'paper', 'scissors']; let botChoice; if (currentSpDifficulty === 'easy') { botChoice = Math.random() > 0.3 ? choices[Math.floor(Math.random() * 3)] : choice; } else if (currentSpDifficulty === 'medium' || spRpsHistory.length < 3) { botChoice = choices[Math.floor(Math.random() * 3)]; } else { if (Math.random() < 0.2) { botChoice = choices[Math.floor(Math.random() * 3)]; } else { let counts = { rock: 0, paper: 0, scissors: 0 }; spRpsHistory.slice(-5).forEach(m => counts[m]++); let maxMove = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b); if (maxMove === 'rock') botChoice = 'paper'; else if (maxMove === 'paper') botChoice = 'scissors'; else botChoice = 'rock'; } } let result = "It's a Tie!"; if ((choice === 'rock' && botChoice === 'scissors') || (choice === 'paper' && botChoice === 'rock') || (choice === 'scissors' && botChoice === 'paper')) { result = "🎉 You Won!"; } else if (choice !== botChoice) { result = "😞 Computer Won!"; } const icons = { rock: "fa-hand-back-fist", paper: "fa-hand", scissors: "fa-hand-scissors" }; let html = `<div class="game-turn-indicator">${result}</div><div class="rps-arena"><div class="rps-player"><span>You</span><div class="rps-choice-display"><i class="fa-solid ${icons[choice]}"></i></div></div><div class="vs-badge">VS</div><div class="rps-player"><span>Computer</span><div class="rps-choice-display"><i class="fa-solid ${icons[botChoice]}" style="color: #10b981;"></i></div></div></div><button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="renderSinglePlayerRPS()">Play Again</button>`; gameUIContainer.innerHTML = html; };
let spGameType = ''; let spHighScore = 0;
window.renderSinglePlayerAction = async (gameType) => { spGameType = gameType; let title = "Jet Fighter (Solo)"; if(gameType === 'carracing') title = "Car Racing (Solo)"; if(gameType === 'flappybird') title = "Flappy Bird (Solo)"; document.getElementById("activeGameTitle").innerText = title; gameUIContainer.innerHTML = `<h3>Loading High Score... <i class="fa-solid fa-spinner fa-spin"></i></h3>`; try { const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid)); const data = userDoc.data(); spHighScore = (data && data.highScores && data.highScores[gameType]) ? data.highScores[gameType] : 0; } catch(e) { spHighScore = 0; } showSpActionMenu(); };
window.showSpActionMenu = () => { isPlayingActionGame = false; gameUIContainer.innerHTML = `<div class="game-turn-indicator" style="margin-bottom: 5px;">Beat your High Score!</div><div style="font-size: 16px; color: var(--accent); margin-bottom: 15px; font-weight:bold;">High Score: ${spHighScore}</div><div class="action-game-container"><div style="position: relative; width: 100%; max-width: 300px;"><canvas id="actionCanvas" width="300" height="400" class="action-canvas" style="margin: 0;"></canvas><div id="startOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.6); border-radius:12px; z-index:10;"><button class="primary-btn glow-btn" id="btnStartGame" style="width:auto; padding:15px 40px; font-size: 16px;">Play Now</button></div></div><div class="game-btn-row" id="gameControls" style="display:none;"><button class="game-control-btn" id="btnLeft">⬅️</button><button class="game-control-btn" id="btnRight">➡️</button></div></div>`; const canvas = document.getElementById('actionCanvas'); if (canvas) { const ctx = canvas.getContext('2d'); if (spGameType === 'carracing') { ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50); } else if (spGameType === 'flappybird') { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(150, 200, 15, 0, Math.PI * 2); ctx.fill(); } else { ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill(); } } document.getElementById('btnStartGame').addEventListener('click', () => { isPlayingActionGame = true; document.getElementById('startOverlay').style.display = 'none'; document.getElementById('gameControls').style.display = 'flex'; if (spGameType === 'carracing') startCarRacing(null, true); else if (spGameType === 'flappybird') startFlappyBird(null, true); else startJetFighter(null, true); }); };
window.handleSpActionGameOver = async (score) => { let isNewHighScore = false; if (score > spHighScore) { spHighScore = score; isNewHighScore = true; try { await setDoc(doc(db, "users", auth.currentUser.uid), { highScores: { [spGameType]: score } }, { merge: true }); } catch(e) {} } gameUIContainer.innerHTML = `<div class="game-turn-indicator" style="color:${isNewHighScore ? 'var(--primary)' : 'white'}">${isNewHighScore ? '🏆 NEW HIGH SCORE!' : 'GAME OVER'}</div><div style="font-size: 24px; text-align: center; margin: 20px 0;">Your Score: <b style="color:var(--primary)">${score}</b><br>High Score: <b style="color:var(--accent)">${spHighScore}</b></div><button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="showSpActionMenu()">Play Again</button>`; };
function renderActionGame(data, gameId, gameType) { 
    const isPlayer1 = data.player1 === auth.currentUser.uid; const myScore = isPlayer1 ? data.p1Score : data.p2Score; const oppScore = isPlayer1 ? data.p2Score : data.p1Score; 
    if (myScore !== undefined && myScore !== null && oppScore !== undefined && oppScore !== null) { isPlayingActionGame = false; let statusText = "It's a Tie!"; if (myScore > oppScore) statusText = "🎉 You Won!"; else if (myScore < oppScore) statusText = "😞 You Lost!"; gameUIContainer.innerHTML = `<div class="game-turn-indicator">${statusText}</div><div style="font-size: 24px; text-align: center; margin: 20px 0;">Your Score: <b style="color:var(--primary)">${myScore}</b><br>Opponent's Score: <b style="color:var(--accent)">${oppScore}</b></div><button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetActionGame('${gameId}')">Play Again</button>`; return; } 
    if (myScore !== undefined && myScore !== null) { isPlayingActionGame = false; gameUIContainer.innerHTML = `<div class="game-turn-indicator">Waiting for opponent to finish...</div><div style="font-size: 20px; text-align: center; margin: 20px 0;">Your Score: <b style="color:var(--primary)">${myScore}</b></div>`; return; } 
    if (isPlayingActionGame) return; 
    gameUIContainer.innerHTML = `<div class="game-turn-indicator" style="margin-bottom: 5px;">High Score Challenge!</div><div class="action-game-container"><div style="position: relative; width: 100%; max-width: 300px;"><canvas id="actionCanvas" width="300" height="400" class="action-canvas" style="margin: 0;"></canvas><div id="startOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.6); border-radius:12px; z-index:10; flex-direction:column; gap:10px;"><span style="color:white; font-size:14px;">Opponent is ready!</span><button class="primary-btn glow-btn" id="btnStartGame" style="width:auto; padding:15px 40px; font-size: 16px;">Play Now</button></div></div><div class="game-btn-row" id="gameControls" style="display:none;"><button class="game-control-btn" id="btnLeft">⬅️</button><button class="game-control-btn" id="btnRight">➡️</button></div></div>`; 
    const canvas = document.getElementById('actionCanvas'); 
    if (canvas) { const ctx = canvas.getContext('2d'); if (gameType === 'carracing') { ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50); } else if (gameType === 'cybertanks') { ctx.fillStyle = '#ef4444'; ctx.fillRect(140, 350, 20, 20); } else { ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill(); } } 
    document.getElementById('btnStartGame').addEventListener('click', () => { isPlayingActionGame = true; document.getElementById('startOverlay').style.display = 'none'; document.getElementById('gameControls').style.display = 'flex'; if (gameType === 'carracing') startCarRacing(gameId, isPlayer1); else if (gameType === 'cybertanks') startCyberTanks(gameId, isPlayer1); else startJetFighter(gameId, isPlayer1); }); 
}
window.resetActionGame = async (gameId) => { await updateDoc(doc(db, "games", gameId), { p1Score: null, p2Score: null }); };
function startFlappyBird(gameId, isPlayer1) {
    const canvas = document.getElementById('actionCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); document.getElementById('gameControls').style.display = 'none';
    let birdY = 200; let velocity = 0; const gravity = 0.5; const jumpStrength = -7; const birdRadius = 12; let pipes = []; let frameCount = 0; let score = 0; let isGameOver = false; let isCountingDown = true;
    const jump = (e) => { if(!isPlayingActionGame || isCountingDown) return; if(e && e.type === 'keydown' && e.key !== ' ' && e.key !== 'ArrowUp') return; if(e) e.preventDefault(); velocity = jumpStrength; };
    window.addEventListener('keydown', jump); canvas.addEventListener('mousedown', jump); canvas.addEventListener('touchstart', jump, {passive: false});
    function drawBird(x, y) { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(x, y, birdRadius, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(x + 5, y - 4, 4, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(x + 6, y - 4, 2, 0, Math.PI*2); ctx.fill(); }
    function gameLoop() { if(isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); velocity += gravity; birdY += velocity; if(frameCount % 100 === 0) { const gap = 120; const minPipeHeight = 50; const maxPipeHeight = canvas.height - gap - minPipeHeight; const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight); pipes.push({ x: canvas.width, topHeight: topHeight, passed: false }); } ctx.fillStyle = '#10b981'; for(let i=0; i<pipes.length; i++) { let p = pipes[i]; p.x -= 2.5; ctx.fillRect(p.x, 0, 40, p.topHeight); const bottomY = p.topHeight + 120; ctx.fillRect(p.x, bottomY, 40, canvas.height - bottomY); const birdX = 50; if (birdX + birdRadius > p.x && birdX - birdRadius < p.x + 40) { if (birdY - birdRadius < p.topHeight || birdY + birdRadius > bottomY) { gameOver(); } } if (p.x + 40 < birdX && !p.passed) { score++; p.passed = true; } } pipes = pipes.filter(p => p.x + 40 > 0); if(birdY + birdRadius > canvas.height || birdY - birdRadius < 0) { gameOver(); } drawBird(50, birdY); ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('Score: ' + score, 10, 30); frameCount++; currentAnimationId = requestAnimationFrame(gameLoop); }
    function gameOver() { isGameOver = true; isPlayingActionGame = false; window.removeEventListener('keydown', jump); canvas.removeEventListener('mousedown', jump); canvas.removeEventListener('touchstart', jump); if(currentAnimationId) cancelAnimationFrame(currentAnimationId); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('GAME OVER', 90, 180); ctx.fillText('Score: ' + score, 110, 220); setTimeout(() => { if (singlePlayerMode) { handleSpActionGameOver(score); } else { updateDoc(doc(db, "games", gameId), { [isPlayer1 ? 'p1Score' : 'p2Score']: score }); } }, 1500); }
    let countdown = 3; function drawCountdown() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawBird(50, 200); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 60px Inter'; ctx.textAlign = 'center'; ctx.fillText(countdown > 0 ? countdown : 'GO!', canvas.width/2, canvas.height/2 + 20); ctx.textAlign = 'left'; }
    drawCountdown(); const timerInterval = setInterval(() => { countdown--; if (countdown > 0) { drawCountdown(); } else if (countdown === 0) { drawCountdown(); } else { clearInterval(timerInterval); isCountingDown = false; gameLoop(); } }, 1000);
}
function startCarRacing(gameId, isPlayer1) {
    const canvas = document.getElementById('actionCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d');
    let carX = 135; let targetCarX = 135; const carWidth = 30; const carHeight = 50; let score = 0; let obstacles = []; let gameSpeed = 3; let isGameOver = false; let lineOffset = 0;
    const handleKeyDown = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft' && targetCarX > 35) targetCarX -= 100; if(e.key === 'ArrowRight' && targetCarX < 235) targetCarX += 100; }; window.addEventListener('keydown', handleKeyDown);
    function drawCar(x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, carWidth, carHeight); ctx.fillStyle = '#111'; ctx.fillRect(x - 5, y + 5, 5, 15); ctx.fillRect(x + carWidth, y + 5, 5, 15); ctx.fillRect(x - 5, y + 30, 5, 15); ctx.fillRect(x + carWidth, y + 30, 5, 15); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x + 5, y + 10, 20, 10); }
    function gameLoop() { if(isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if (carX < targetCarX) { carX += 15; if (carX > targetCarX) carX = targetCarX; } if (carX > targetCarX) { carX -= 15; if (carX < targetCarX) carX = targetCarX; } lineOffset += gameSpeed; if (lineOffset > 40) lineOffset -= 40; ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.setLineDash([20, 20]); ctx.beginPath(); ctx.moveTo(100, lineOffset - 40); ctx.lineTo(100, 400); ctx.stroke(); ctx.beginPath(); ctx.moveTo(200, lineOffset - 40); ctx.lineTo(200, 400); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; drawCar(carX, 330, '#8b5cf6'); let highestY = canvas.height; obstacles.forEach(o => { if (o.y < highestY) highestY = o.y; }); let safeVerticalGap = 130 + (gameSpeed * 10); if (highestY > safeVerticalGap || obstacles.length === 0) { let spawnCount = Math.random() > 0.5 ? 2 : 1; let lanes = [35, 135, 235]; lanes.sort(() => 0.5 - Math.random()); for(let i = 0; i < spawnCount; i++) { let staggerOffset = Math.random() * 30; obstacles.push({ x: lanes[i], y: -50 - staggerOffset, width: 30, height: 50 }); } } for(let i=0; i<obstacles.length; i++) { let obs = obstacles[i]; obs.y += gameSpeed; drawCar(obs.x, obs.y, '#ec4899'); let margin = 2; if (carX + margin < obs.x + obs.width && carX + carWidth - margin > obs.x && 330 + margin < obs.y + obs.height && 330 + carHeight - margin > obs.y) { gameOver(); } } obstacles = obstacles.filter(o => o.y < 450); score++; if(score % 500 === 0) gameSpeed += 0.5; ctx.fillStyle = 'white'; ctx.font = 'bold 16px Inter'; ctx.fillText('Score: ' + Math.floor(score/10), 10, 25); currentAnimationId = requestAnimationFrame(gameLoop); }
    function gameOver() { isGameOver = true; isPlayingActionGame = false; window.removeEventListener('keydown', handleKeyDown); if(currentAnimationId) cancelAnimationFrame(currentAnimationId); const finalScore = Math.floor(score/10); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('CRASHED!', 100, 180); ctx.fillText('Score: ' + finalScore, 100, 220); setTimeout(() => { if (singlePlayerMode) { handleSpActionGameOver(finalScore); } else { updateDoc(doc(db, "games", gameId), { [isPlayer1 ? 'p1Score' : 'p2Score']: finalScore }); } }, 1500); }
    const btnLeft = document.getElementById('btnLeft'); const btnRight = document.getElementById('btnRight'); btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); if(targetCarX > 35) targetCarX -= 100; }; btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); if(targetCarX < 235) targetCarX += 100; }; gameLoop();
}
function startJetFighter(gameId, isPlayer1) { const canvas = document.getElementById('actionCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); let jetX = 135; const jetSize = 30; let bullets = []; let enemies = []; let score = 0; let isGameOver = false; let isMovingLeft = false; let isMovingRight = false; const handleKeyDown = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft') isMovingLeft = true; if(e.key === 'ArrowRight') isMovingRight = true; if(e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); bullets.push({ x: jetX + jetSize/2 - 2, y: 350 }); } }; const handleKeyUp = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft') isMovingLeft = false; if(e.key === 'ArrowRight') isMovingRight = false; }; window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); function drawJet(x, y, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + jetSize/2, y); ctx.lineTo(x + jetSize, y + jetSize); ctx.lineTo(x, y + jetSize); ctx.fill(); } function gameLoop() { if(isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if(isMovingLeft && jetX > 0) jetX -= 5; if(isMovingRight && jetX < canvas.width - jetSize) jetX += 5; ctx.fillStyle = 'white'; for(let i=0; i<3; i++) { ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, 2); } drawJet(jetX, 350, '#10b981'); ctx.fillStyle = '#f59e0b'; for(let i=0; i<bullets.length; i++) { bullets[i].y -= 7; ctx.fillRect(bullets[i].x, bullets[i].y, 4, 10); } bullets = bullets.filter(b => b.y > 0); if(Math.random() < 0.03 + (score/10000)) { enemies.push({ x: Math.random() * (canvas.width - 20), y: -20, size: 20 }); } for(let i=0; i<enemies.length; i++) { let e = enemies[i]; e.y += 2.5; ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x, e.y, e.size, e.size); for(let j=0; j<bullets.length; j++) { let b = bullets[j]; if(b.x > e.x && b.x < e.x + e.size && b.y > e.y && b.y < e.y + e.size) { e.dead = true; b.dead = true; score += 10; } } if (jetX < e.x + e.size && jetX + jetSize > e.x && 350 < e.y + e.size && 350 + jetSize > e.y) { gameOver(); } } enemies = enemies.filter(e => !e.dead && e.y < 450); bullets = bullets.filter(b => !b.dead); ctx.fillStyle = 'white'; ctx.font = 'bold 16px Inter'; ctx.fillText('Score: ' + score, 10, 25); currentAnimationId = requestAnimationFrame(gameLoop); } function gameOver() { isGameOver = true; isPlayingActionGame = false; window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); if(currentAnimationId) cancelAnimationFrame(currentAnimationId); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('DESTROYED!', 90, 180); ctx.fillText('Score: ' + score, 105, 220); setTimeout(() => { if (singlePlayerMode) { handleSpActionGameOver(score); } else { updateDoc(doc(db, "games", gameId), { [isPlayer1 ? 'p1Score' : 'p2Score']: score }); } }, 1500); } const btnLeft = document.getElementById('btnLeft'); const btnRight = document.getElementById('btnRight'); btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); isMovingLeft = true; }; btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = (e) => { e.preventDefault(); isMovingLeft = false; }; btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); isMovingRight = true; }; btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = (e) => { e.preventDefault(); isMovingRight = false; }; if(!document.getElementById('btnShoot')) { const btnShoot = document.createElement('button'); btnShoot.id = 'btnShoot'; btnShoot.className = 'game-control-btn'; btnShoot.style.background = 'rgba(236, 72, 153, 0.2)'; btnShoot.style.borderColor = 'var(--accent)'; btnShoot.innerText = '🔥'; document.getElementById('gameControls').appendChild(btnShoot); btnShoot.onmousedown = btnShoot.ontouchstart = (e) => { e.preventDefault(); bullets.push({ x: jetX + jetSize/2 - 2, y: 350 }); }; } gameLoop(); }
function renderTicTacToe(data, gameId) { const isMyTurn = data.turn === auth.currentUser.uid; const mySymbol = data.player1 === auth.currentUser.uid ? "X" : "O"; let turnText = data.winner ? (data.winner === 'draw' ? "It's a Draw!" : (data.winner === auth.currentUser.uid ? "🎉 You Won!" : "😞 You Lost!")) : (isMyTurn ? "Your Turn" : "Opponent's Turn"); let html = `<div class="game-turn-indicator" style="color: ${isMyTurn && !data.winner ? 'var(--primary)' : 'white'}">${turnText}</div><div class="ttt-board">`; data.board.forEach((cell, index) => { const cellClass = cell === 'X' ? 'x' : (cell === 'O' ? 'o' : ''); html += `<div class="ttt-cell ${cellClass}" onclick="makeMoveTTT(${index}, '${data.board[index]}', ${isMyTurn}, '${mySymbol}')">${cell}</div>`; }); html += `</div>`; if(data.winner) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetTTT('${gameId}')">Play Again</button>`; gameUIContainer.innerHTML = html; }
function startCyberTanks(gameId, isPlayer1) {
    const canvas = document.getElementById('actionCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d');
    let myX = 135; let myY = isPlayer1 ? 350 : 30; let friendX = 135; let friendY = isPlayer1 ? 30 : 350; let isShooting = false; let lastP2Shooting = false; 
    let bullets = []; let p1Score = 0; let p2Score = 0; let isGameOver = false; const myColor = '#3b82f6'; const friendColor = '#ef4444'; const tankSize = 20; const keys = { ArrowLeft: false, ArrowRight: false };
    const handleShoot = (e) => { if(e) e.preventDefault(); if(!isPlayingActionGame || isGameOver) return; if(isPlayer1 && !isShooting) { bullets.push({ x: myX + 8, y: myY - 8, dy: -6, isP1: true }); } isShooting = true; };
    const handleKeyDown = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft') { e.preventDefault(); keys.ArrowLeft = true; } if(e.key === 'ArrowRight') { e.preventDefault(); keys.ArrowRight = true; } if(e.key === ' ' || e.key === 'ArrowUp') handleShoot(e); };
    const handleKeyUp = (e) => { if(e.key === 'ArrowLeft') keys.ArrowLeft = false; if(e.key === 'ArrowRight') keys.ArrowRight = false; if(e.key === ' ' || e.key === 'ArrowUp') isShooting = false; };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    const btnLeft = document.getElementById('btnLeft'); const btnRight = document.getElementById('btnRight');
    if (btnLeft) { btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); keys.ArrowLeft = true; }; btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = (e) => { e.preventDefault(); keys.ArrowLeft = false; }; }
    if (btnRight) { btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); keys.ArrowRight = true; }; btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = (e) => { e.preventDefault(); keys.ArrowRight = false; }; }
    if(!document.getElementById('btnShoot')) { const btnShoot = document.createElement('button'); btnShoot.id = 'btnShoot'; btnShoot.className = 'game-control-btn'; btnShoot.style.background = 'rgba(236, 72, 153, 0.2)'; btnShoot.style.borderColor = 'var(--accent)'; btnShoot.innerText = '🔥'; document.getElementById('gameControls').appendChild(btnShoot); }
    const btnShoot = document.getElementById('btnShoot'); if (btnShoot) { btnShoot.onmousedown = btnShoot.ontouchstart = handleShoot; btnShoot.onmouseup = btnShoot.ontouchend = btnShoot.onmouseleave = (e) => { e.preventDefault(); isShooting = false; }; }
    function drawTank(x, y, isP1Tank) { if (isP1Tank) { ctx.fillStyle = isPlayer1 ? myColor : friendColor; ctx.fillRect(x, y, tankSize, tankSize); ctx.fillStyle = 'white'; ctx.fillRect(x + 8, y - 8, 4, 10); } else { ctx.fillStyle = !isPlayer1 ? myColor : friendColor; ctx.fillRect(x, y, tankSize, tankSize); ctx.fillStyle = 'white'; ctx.fillRect(x + 8, y + tankSize - 2, 4, 10); } }
    const syncInterval = setInterval(async () => { if(isGameOver) return; try { if (isPlayer1) { await updateDoc(doc(db, "games", gameId), { p1X: myX, p1Shooting: isShooting, bullets: bullets, currentP1Score: p1Score, currentP2Score: p2Score }); } else { await updateDoc(doc(db, "games", gameId), { p2X: myX, p2Shooting: isShooting }); } } catch(e) {} }, 80);
    const unsub = onSnapshot(doc(db, "games", gameId), (docSnap) => { if(!docSnap.exists() || isGameOver) return; const data = docSnap.data(); if (isPlayer1) { friendX = data.p2X !== undefined ? data.p2X : friendX; if(data.p2Shooting && !lastP2Shooting) { bullets.push({ x: friendX + 8, y: friendY + tankSize + 2, dy: 6, isP1: false }); } lastP2Shooting = !!data.p2Shooting; } else { friendX = data.p1X !== undefined ? data.p1X : friendX; bullets = data.bullets || []; p1Score = data.currentP1Score || 0; p2Score = data.currentP2Score || 0; } });
    function gameLoop() { if(isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if(keys.ArrowLeft) { if (isPlayer1 && myX > 0) myX -= 4; if (!isPlayer1 && myX < canvas.width - tankSize) myX += 4; } if(keys.ArrowRight) { if (isPlayer1 && myX < canvas.width - tankSize) myX += 4; if (!isPlayer1 && myX > 0) myX -= 4; } ctx.save(); if (!isPlayer1) { ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(Math.PI); ctx.translate(-canvas.width / 2, -canvas.height / 2); } ctx.fillStyle = '#555'; ctx.fillRect(50, 190, 60, 20); ctx.fillRect(190, 190, 60, 20); if (isPlayer1) { drawTank(myX, myY, true); drawTank(friendX, friendY, false); } else { drawTank(friendX, friendY, true); drawTank(myX, myY, false); } ctx.fillStyle = '#f59e0b'; for(let i = bullets.length - 1; i >= 0; i--) { let b = bullets[i]; b.y += b.dy; ctx.fillRect(b.x, b.y, 4, 8); if(isPlayer1) { if ((b.x + 4 > 50 && b.x < 110 && b.y + 8 > 190 && b.y < 210) || (b.x + 4 > 190 && b.x < 250 && b.y + 8 > 190 && b.y < 210)) { bullets.splice(i, 1); continue; } if(b.isP1 && b.x + 4 > friendX && b.x < friendX + tankSize && b.y + 8 > friendY && b.y < friendY + tankSize) { p1Score += 1; bullets.splice(i, 1); if(p1Score >= 5) gameOver(); continue; } if(!b.isP1 && b.x + 4 > myX && b.x < myX + tankSize && b.y + 8 > myY && b.y < myY + tankSize) { p2Score += 1; bullets.splice(i, 1); if(p2Score >= 5) gameOver(); continue; } if(b.y < 0 || b.y > canvas.height) bullets.splice(i, 1); } } ctx.restore(); ctx.fillStyle = 'white'; ctx.font = 'bold 16px Inter'; if (isPlayer1) { ctx.fillText(`You: ${p1Score}`, 10, 25); ctx.fillText(`Opponent: ${p2Score}`, canvas.width - 120, 25); } else { ctx.fillText(`You: ${p2Score}`, 10, 25); ctx.fillText(`Opponent: ${p1Score}`, canvas.width - 120, 25); } currentAnimationId = requestAnimationFrame(gameLoop); }
    function gameOver() { isGameOver = true; isPlayingActionGame = false; clearInterval(syncInterval); unsub(); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); if (btnLeft) { btnLeft.onmousedown = btnLeft.ontouchstart = null; btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = null; } if (btnRight) { btnRight.onmousedown = btnRight.ontouchstart = null; btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = null; } if (btnShoot) { btnShoot.onmousedown = btnShoot.ontouchstart = null; btnShoot.onmouseup = btnShoot.ontouchend = btnShoot.onmouseleave = null; } if(currentAnimationId) cancelAnimationFrame(currentAnimationId); ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 24px Inter'; let winText = (isPlayer1 && p1Score >= 5) || (!isPlayer1 && p2Score >= 5) ? "YOU WIN!" : "YOU LOSE!"; ctx.fillText(winText, 85, 200); setTimeout(() => { if (isPlayer1) updateDoc(doc(db, "games", gameId), { p1Score: p1Score, p2Score: p2Score }); }, 2000); }
    gameLoop();
}
window.makeMoveTTT = async (index, currentVal, isMyTurn, mySymbol) => { if(!isMyTurn || currentVal !== "" || !currentGameId) return; const docRef = doc(db, "games", currentGameId); const snap = await getDoc(docRef); const data = snap.data(); if(data.winner) return; let newBoard = [...data.board]; newBoard[index] = mySymbol; const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; let newWinner = null; for (let i = 0; i < lines.length; i++) { const [a, b, c] = lines[i]; if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) newWinner = auth.currentUser.uid; } if(!newWinner && !newBoard.includes("")) newWinner = "draw"; const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; await updateDoc(docRef, { board: newBoard, turn: nextTurn, winner: newWinner }); };
window.resetTTT = async (gameId) => { const docRef = doc(db, "games", gameId); const snap = await getDoc(docRef); await updateDoc(docRef, { board: ["","","","","","","","",""], winner: null, turn: snap.data().player1 }); };
function renderRPS(data, gameId) { const isPlayer1 = data.player1 === auth.currentUser.uid; const myChoice = isPlayer1 ? data.p1Choice : data.p2Choice; const oppChoice = isPlayer1 ? data.p2Choice : data.p1Choice; let statusText = "Make your choice!"; let bothSelected = data.p1Choice && data.p2Choice; if (bothSelected) { if (myChoice === oppChoice) statusText = "It's a Tie!"; else if ((myChoice === 'rock' && oppChoice === 'scissors') || (myChoice === 'paper' && oppChoice === 'rock') || (myChoice === 'scissors' && oppChoice === 'paper')) statusText = "🎉 You Won!"; else statusText = "😞 You Lost!"; } else if (myChoice) statusText = "Waiting for opponent..."; const icons = { rock: "fa-hand-back-fist", paper: "fa-hand", scissors: "fa-hand-scissors" }; let html = `<div class="game-turn-indicator">${statusText}</div><div class="rps-arena"><div class="rps-player"><span>You</span><div class="rps-choice-display"><i class="fa-solid ${myChoice ? icons[myChoice] : 'fa-question'}"></i></div></div><div class="vs-badge">VS</div><div class="rps-player"><span>Opponent</span><div class="rps-choice-display"><i class="fa-solid ${bothSelected ? icons[oppChoice] : (oppChoice ? 'fa-check' : 'fa-question')}" style="color: ${oppChoice && !bothSelected ? '#10b981' : 'white'}"></i></div></div></div>`; if (!myChoice && !bothSelected) html += `<div class="rps-controls"><button class="rps-btn" onclick="makeMoveRPS('rock')"><i class="fa-solid fa-hand-back-fist"></i></button><button class="rps-btn" onclick="makeMoveRPS('paper')"><i class="fa-solid fa-hand"></i></button><button class="rps-btn" onclick="makeMoveRPS('scissors')"><i class="fa-solid fa-hand-scissors"></i></button></div>`; if(bothSelected) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetRPS('${gameId}')">Play Again</button>`; gameUIContainer.innerHTML = html; }
window.makeMoveRPS = async (choice) => { if(!currentGameId) return; const docRef = doc(db, "games", currentGameId); const snap = await getDoc(docRef); const isPlayer1 = snap.data().player1 === auth.currentUser.uid; if (isPlayer1) await updateDoc(docRef, { p1Choice: choice }); else await updateDoc(docRef, { p2Choice: choice }); };
window.resetRPS = async (gameId) => { await updateDoc(doc(db, "games", gameId), { p1Choice: null, p2Choice: null }); };

// --- DOODLE LOGIC ---
const pDoodleArea = document.getElementById("privateDoodleArea"); const pDoodleCanvas = document.getElementById("pDoodleCanvas"); const pDoodleCtx = pDoodleCanvas.getContext("2d"); const pDoodleColor = document.getElementById("pDoodleColor"); const pDoodleSize = document.getElementById("pDoodleSize"); const undoPDoodleBtn = document.getElementById("undoPDoodleBtn");
let isPDrawing = false; let currentPStroke = [];
chatDoodleBtn.addEventListener("click", async () => {
    if(currentChatStatus !== 'accepted') { alert("Connection request not accepted yet."); return; }
    const chatSnap = await getDoc(doc(db, "chats", currentChatId));
    if(chatSnap.exists() && chatSnap.data().doodleActive) { pDoodleArea.style.display = "flex"; document.getElementById("doodleBadge").style.display = "none"; window.dispatchEvent(new Event('resize')); } 
    else {
        if (isCurrentChatGroup) { alert("Doodle is for 1v1 only!"); return; }
        await updateDoc(doc(db, "chats", currentChatId), { doodleReq: auth.currentUser.uid });
        const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000;
        const payload = { sender: auth.currentUser.uid, time: Date.now(), isDoodleRequest: true, isDeleted: false }; if (timerValue > 0) payload.timerDuration = timerValue;
        await addDoc(collection(db, "chats", currentChatId, "messages"), payload); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎨 DOODLE REQUEST", unread: true } } }, { merge: true });
        showToast("Request Sent", "Doodle request sent to friend.");
    }
});
document.getElementById("hideDoodleBtn").addEventListener("click", () => { pDoodleArea.style.display = "none"; if (currentChatId) { loadMessages(); } });
window.acceptDoodle = async () => { await updateDoc(doc(db, "chats", currentChatId), { doodleActive: true, doodleReq: null }); pDoodleArea.style.display = "flex"; window.dispatchEvent(new Event('resize')); };
document.getElementById("disconnectDoodleBtn").addEventListener("click", async () => { if(confirm("Stop doodling and wipe the board for both of you?")) { await updateDoc(doc(db, "chats", currentChatId), { doodleActive: false }); const snaps = await getDocs(collection(db, "chats", currentChatId, "doodle")); const batch = writeBatch(db); snaps.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); pDoodleArea.style.display = "none"; } });
function getPCoordinates(e) { const rect = pDoodleCanvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: clientX - rect.left, y: clientY - rect.top }; }
function drawPLine(x0, y0, x1, y1, color, size = 3) { pDoodleCtx.beginPath(); pDoodleCtx.moveTo(x0, y0); pDoodleCtx.lineTo(x1, y1); pDoodleCtx.strokeStyle = color; pDoodleCtx.lineWidth = size; pDoodleCtx.lineCap = 'round'; pDoodleCtx.stroke(); pDoodleCtx.closePath(); }
function initPrivateDoodle() {
    if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
    pDoodleCtx.fillStyle = "#fff"; pDoodleCtx.fillRect(0, 0, pDoodleCanvas.width, pDoodleCanvas.height);
    pDoodleUnsubscribe = onSnapshot(query(collection(db, "chats", currentChatId, "doodle"), orderBy("time", "asc")), (snapshot) => {
        pDoodleCtx.fillStyle = "#fff"; pDoodleCtx.fillRect(0, 0, pDoodleCanvas.width, pDoodleCanvas.height);
        snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if(data.type === 'clear') { pDoodleCtx.fillStyle = "#fff"; pDoodleCtx.fillRect(0, 0, pDoodleCanvas.width, pDoodleCanvas.height); } 
            else if(data.stroke && data.stroke.length > 0) {
                const size = data.size || 3;
                for(let i=0; i<data.stroke.length-1; i++) { drawPLine(data.stroke[i].x, data.stroke[i].y, data.stroke[i+1].x, data.stroke[i+1].y, data.color, size); }
                if(pDoodleArea.style.display === "none" && data.sender !== auth.currentUser.uid) { document.getElementById("doodleBadge").style.display = "block"; }
            }
        });
    });
}
const startPDrawing = (e) => { isPDrawing = true; currentPStroke = []; currentPStroke.push(getPCoordinates(e)); };
const drawP = (e) => { if (!isPDrawing) return; e.preventDefault(); const pos = getPCoordinates(e); const lastPos = currentPStroke[currentPStroke.length - 1]; drawPLine(lastPos.x, lastPos.y, pos.x, pos.y, pDoodleColor.value, pDoodleSize.value); currentPStroke.push(pos); };
const stopPDrawing = async () => { if (!isPDrawing) return; isPDrawing = false; if(currentPStroke.length > 1) { try { await addDoc(collection(db, "chats", currentChatId, "doodle"), { stroke: currentPStroke, color: pDoodleColor.value, size: pDoodleSize.value, time: Date.now(), sender: auth.currentUser.uid }); } catch(e) {} } };
pDoodleCanvas.addEventListener("mousedown", startPDrawing); pDoodleCanvas.addEventListener("mousemove", drawP); pDoodleCanvas.addEventListener("mouseup", stopPDrawing); pDoodleCanvas.addEventListener("mouseout", stopPDrawing); pDoodleCanvas.addEventListener("touchstart", startPDrawing, {passive: false}); pDoodleCanvas.addEventListener("touchmove", drawP, {passive: false}); pDoodleCanvas.addEventListener("touchend", stopPDrawing);
document.getElementById("clearPDoodleBtn").addEventListener("click", async () => { if(confirm("Clear board?")) { const snaps = await getDocs(collection(db, "chats", currentChatId, "doodle")); const batch = writeBatch(db); snaps.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); await addDoc(collection(db, "chats", currentChatId, "doodle"), { type: 'clear', time: Date.now() }); } });
if (undoPDoodleBtn) { undoPDoodleBtn.addEventListener("click", async () => { if (!currentChatId) return; try { const snaps = await getDocs(query(collection(db, "chats", currentChatId, "doodle"), orderBy("time", "desc"))); for (let docSnap of snaps.docs) { const data = docSnap.data(); if (data.sender === auth.currentUser.uid && data.type !== 'clear') { await deleteDoc(doc(db, "chats", currentChatId, "doodle", docSnap.id)); break; } else if (data.type === 'clear') { break; } } } catch(e) { console.error("Undo failed:", e); } }); }

// --- EXPLORE HUB ---
const exploreBtn = document.getElementById("exploreBtn"); const exploreArea = document.getElementById("exploreArea"); const closeExploreBtn = document.getElementById("closeExploreBtn"); const exploreTabs = document.querySelectorAll(".explore-tab"); const exploreSections = document.querySelectorAll(".explore-section"); let globalChatUnsubscribe = null;
bindPointerTap(exploreBtn, () => {
    history.pushState({ page: "explore" }, ""); exploreArea.style.display = "flex"; if(window.innerWidth <= 992) sidebar.style.display = "none";
    exploreTabs.forEach(t => t.classList.remove("active")); exploreSections.forEach(s => s.classList.remove("active"));
    document.querySelector('.explore-tab[data-target="exploreMemes"]').classList.add("active"); document.getElementById("exploreMemes").classList.add("active");
    initMemesFeed();
});
bindPointerTap(closeExploreBtn, () => { exploreArea.style.display = "none"; if(globalChatUnsubscribe) { globalChatUnsubscribe(); globalChatUnsubscribe = null; } if(window.innerWidth <= 992) sidebar.style.display = "flex"; });
exploreTabs.forEach(tab => {
    bindPointerTap(tab, () => {
        exploreTabs.forEach(t => t.classList.remove("active")); exploreSections.forEach(s => s.classList.remove("active")); tab.classList.add("active");
        const target = tab.getAttribute("data-target"); document.getElementById(target).classList.add("active");
        if (target === "exploreLounge") initGlobalLounge();
        if (target === "exploreLeaderboard") initLeaderboard();
        if (target === "exploreMemes") initMemesFeed();
    });
});

const globalChatBox = document.getElementById("globalChatBox"); const globalMsgInput = document.getElementById("globalMsgInput"); const sendGlobalBtn = document.getElementById("sendGlobalBtn");
function initGlobalLounge() {
    if (globalChatUnsubscribe) return; 
    globalChatBox.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Lounge...</div>';
    const q = query(collection(db, "global_lounge"), orderBy("time", "asc"), limit(100));
    globalChatUnsubscribe = onSnapshot(q, (snapshot) => {
        globalChatBox.innerHTML = ""; let lastMyMsgId = null; snapshot.forEach(d => { if(d.data().sender === auth.currentUser.uid) lastMyMsgId = d.id; });
        snapshot.forEach(docSnap => {
            const msg = docSnap.data(); const msgId = docSnap.id; const isMe = msg.sender === auth.currentUser.uid;
            if (msg.deletedFor && msg.deletedFor.includes(auth.currentUser.uid)) return;
            const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const div = document.createElement("div"); div.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
            const senderUser = allUsers.find(u => u.id === msg.sender);
const avatarUrl = senderUser ? generateAvatar(senderUser, msg.senderName) : (msg.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName)}&background=10b981&color=fff`);
            let nameTag = !isMe ? `<div style="font-size:11px; color: #10b981; font-weight:600; margin-bottom:4px;">${msg.senderName}</div>` : ""; let contentHtml = "";
            if (msg.isDeleted) { contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`; } 
            else {
                let replyHtml = msg.replyToText ? `<div class="replied-msg-box" onclick="event.stopPropagation();"><b>${msg.replyToName}</b><div class="preview-text">${msg.replyToText}</div></div>` : "";
                const encodedText = encodeURIComponent(msg.text || ""); const encodedName = encodeURIComponent(isMe ? 'You' : msg.senderName);
            const formattedText = formatMentions(msg.text);
contentHtml = `<div class="msg-bubble" style="${isMe ? 'background: #10b981;' : ''}" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'global')">${nameTag}${replyHtml}<span style="word-wrap: break-word; white-space: pre-wrap; display: block; max-width: 100%;">${formattedText}</span>${msg.isEdited ? '<span style="font-size:10px; opacity:0.5; display:block; margin-top:5px;">(edited)</span>' : ''}</div>`; 
            }
            div.innerHTML = `${!isMe ? `<img src="${avatarUrl}" class="msg-avatar" data-uid="${msg.sender}">` : ''}<div style="display:flex; flex-direction:column; max-width: 100%;">${contentHtml}<div class="msg-time">${timeStr}</div></div>${isMe ? `<img src="${document.getElementById('myAvatar').src}" class="msg-avatar" data-uid="${auth.currentUser.uid}">` : ''}`;
            globalChatBox.appendChild(div);
        });
        globalChatBox.scrollTop = globalChatBox.scrollHeight;
    });
}
async function sendGlobalMessage() { 
    const text = globalMsgInput.value.trim(); if(!text) return; globalMsgInput.value = ""; 
    const payload = { text: text, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, avatarUrl: document.getElementById("myAvatar").src, time: Date.now(), isEdited: false, isDeleted: false };
    if (replyingToMsg && replyingToMsg.context === 'global') { payload.replyToId = replyingToMsg.id; payload.replyToText = replyingToMsg.text; payload.replyToName = replyingToMsg.name; document.getElementById("cancelReplyBtn").click(); }
    try { await addDoc(collection(db, "global_lounge"), payload); } catch(e) { showToast("Error", "Message failed to send."); } 
}
sendGlobalBtn.addEventListener("click", sendGlobalMessage); globalMsgInput.addEventListener("keypress", (e) => { if(e.key === "Enter") { e.preventDefault(); sendGlobalMessage(); } });

const lbGameSelect = document.getElementById("lbGameSelect"); const leaderboardList = document.getElementById("leaderboardList");
async function initLeaderboard() { lbGameSelect.addEventListener("change", fetchLeaderboard); fetchLeaderboard(); }
async function fetchLeaderboard() {
    leaderboardList.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching scores...</div>'; const game = lbGameSelect.value;
    try {
        const usersSnap = await getDocs(collection(db, "users")); let players = [];
        usersSnap.forEach(doc => { const data = doc.data(); if(data.highScores && data.highScores[game]) { players.push({ name: data.fullName || data.username, score: data.highScores[game], uid: doc.id }); } });
        players.sort((a, b) => b.score - a.score); players = players.slice(0, 50); leaderboardList.innerHTML = "";
        if(players.length === 0) { leaderboardList.innerHTML = "<p style='text-align:center; color:var(--text-muted);'>No scores yet. Be the first to play!</p>"; return; }
        players.forEach((p, index) => {
            let rankClass = index === 0 ? 'top-1' : (index === 1 ? 'top-2' : (index === 2 ? 'top-3' : '')); const isMe = p.uid === auth.currentUser.uid ? " (You)" : "";
            leaderboardList.innerHTML += `<div class="lb-rank-card ${rankClass}"><div class="lb-rank">#${index + 1}</div><div style="font-weight: 500;">${p.name} <span style="font-size:12px; color:var(--primary);">${isMe}</span></div><div class="lb-score">${p.score}</div></div>`;
        });
    } catch(e) { leaderboardList.innerHTML = "<p>Error loading leaderboard.</p>"; }
}

let currentMemeSubreddit = 'wholesomememes'; 
const memeSafeBtn = document.getElementById("memeSafeBtn"); const memeDankBtn = document.getElementById("memeDankBtn"); const memesWrapper = document.getElementById("memesWrapper");
if(memeSafeBtn && memeDankBtn) {
    memeSafeBtn.addEventListener("click", () => { memeSafeBtn.classList.add("active"); memeDankBtn.classList.remove("active"); currentMemeSubreddit = 'wholesomememes'; memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>'; loadMoreMemes(); });
    memeDankBtn.addEventListener("click", () => { memeDankBtn.classList.add("active"); memeSafeBtn.classList.remove("active"); currentMemeSubreddit = 'dankmemes'; memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>'; loadMoreMemes(); });
}
async function initMemesFeed() { if(memesWrapper.children.length > 1) return; memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>'; loadMoreMemes(); }
async function loadMoreMemes() {
    const spinner = memesWrapper.querySelector('.fa-spinner')?.parentElement;
    try {
        const response = await fetch(`https://meme-api.com/gimme/${currentMemeSubreddit}/10`); if (!response.ok) throw new Error("Meme API Down");
        const data = await response.json(); if(spinner) spinner.remove();
        data.memes.forEach(meme => {
            if(!meme.url || meme.url.includes('.mp4')) return; 
            const card = document.createElement('div'); card.className = "meme-card";
            card.innerHTML = `<h4>${meme.title}</h4><img src="${meme.url}" alt="Meme" loading="lazy"><div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">👍 ${meme.ups || '1k+'} | r/${currentMemeSubreddit}</div>`;
            memesWrapper.appendChild(card);
        });
    } catch(e) { 
        console.log("Primary API failed, trying Imgflip Fallback...");
        try {
            const fallbackRes = await fetch('https://api.imgflip.com/get_memes'); const fallbackData = await fallbackRes.json(); if(spinner) spinner.remove();
            const allMemes = fallbackData.data.memes; const randomMemes = allMemes.sort(() => 0.5 - Math.random()).slice(0, 10);
            randomMemes.forEach(meme => { const card = document.createElement('div'); card.className = "meme-card"; card.innerHTML = `<h4>${meme.name}</h4><img src="${meme.url}" alt="Meme" loading="lazy"><div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">🔥 Trending | Imgflip</div>`; memesWrapper.appendChild(card); });
        } catch(err) { if(spinner) spinner.remove(); memesWrapper.innerHTML += `<div style="color:#ef4444; text-align:center; padding: 20px;">Check your internet connection or disable strict Ad-Blockers!</div>`; }
    }
    const oldBtn = memesWrapper.querySelector('.primary-btn'); if(oldBtn) oldBtn.remove();
    const btn = document.createElement("button"); btn.className = "primary-btn glow-btn"; btn.style.width = "auto"; btn.style.margin = "20px"; btn.innerText = "Load More Memes";
    btn.onclick = () => { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; loadMoreMemes(); };
    memesWrapper.appendChild(btn);
}

// --- SETTINGS & CLEANUP ---
if (chatSettingsBtn) chatSettingsBtn.addEventListener("click", () => document.getElementById("chatSettingsModal").style.display = "flex");
if (modalMsgTimerSelect) modalMsgTimerSelect.addEventListener("change", async (e) => { if (currentChatId && !isCurrentChatGroup) { await updateDoc(doc(db, "chats", currentChatId), { messageTimer: e.target.value }); showToast("Timer Updated", "Disappearing message timer changed for this chat."); } });
if (changeWallpaperBtn && wallpaperInput) { changeWallpaperBtn.addEventListener("click", () => wallpaperInput.click()); wallpaperInput.addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file || !currentChatId || isCurrentChatGroup) return; const originalText = changeWallpaperBtn.innerHTML; changeWallpaperBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; changeWallpaperBtn.disabled = true; try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "chats", currentChatId), { wallpaperUrl: data.secure_url }); showToast("Wallpaper Updated", "Chat background synced for both users."); } catch (err) { alert("Failed to upload wallpaper: " + err.message); } finally { changeWallpaperBtn.innerHTML = originalText; changeWallpaperBtn.disabled = false; wallpaperInput.value = ""; } }); }
if (removeWallpaperBtn) { removeWallpaperBtn.addEventListener("click", async () => { if (!currentChatId || isCurrentChatGroup) return; try { await updateDoc(doc(db, "chats", currentChatId), { wallpaperUrl: null }); showToast("Wallpaper Removed", "Restored default background for both."); } catch (err) {} }); }
if (clearChatMeBtn) { clearChatMeBtn.addEventListener("click", async () => { if (!currentChatId) return; if (confirm("Are you sure you want to clear this chat for yourself? Messages will be hidden for you but remain for the other person.")) { clearChatMeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...'; try { const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages"))); const batch = writeBatch(db); msgsSnap.docs.forEach(docSnap => { batch.update(docSnap.ref, { deletedFor: arrayUnion(auth.currentUser.uid) }); }); await batch.commit(); document.getElementById("chatSettingsModal").style.display = "none"; showToast("Chat Cleared", "Messages have been hidden from your screen."); } catch (e) { alert("Error clearing chat."); } finally { clearChatMeBtn.innerHTML = '<i class="fa-solid fa-eraser"></i> Clear Chat for Me'; } } }); }

window.addEventListener("popstate", (e) => {
    let modalClosed = false;
    
    // 1. Dynamically close ANY open modal overlays (covers OTP, Profiles, Settings, etc.)
    document.querySelectorAll('.modal-overlay').forEach(modal => { 
        if (modal.style.display === "flex") { 
            modal.style.display = "none"; 
            modalClosed = true; 
        } 
    });
    if (modalClosed) { history.pushState(null, ""); return; }
    
    // 2. Close full-screen areas (Shared Whiteboard, Games, Explore Hub)
    if (document.getElementById("privateDoodleArea") && document.getElementById("privateDoodleArea").style.display === "flex") { document.getElementById("hideDoodleBtn").click(); history.pushState(null, ""); return; }
    if (document.getElementById("activeGameArea") && document.getElementById("activeGameArea").style.display === "flex") { document.getElementById("closeGameBtn").click(); history.pushState(null, ""); return; }
    if (document.getElementById("exploreArea") && document.getElementById("exploreArea").style.display === "flex") { document.getElementById("closeExploreBtn").click(); history.pushState(null, ""); return; }
    
    // 3. Navigate out of chat area back to the user list (Mobile)
    if (window.innerWidth <= 992 && document.getElementById("activeChatState") && document.getElementById("activeChatState").style.display === "flex") { 
        document.getElementById("backToUsersBtn").click(); 
        history.pushState(null, ""); 
        return; 
    }
});

window.setTheme = (themeName) => { document.body.className = ''; if (themeName !== 'default') { document.body.classList.add(themeName); } localStorage.setItem('chitchat_theme', themeName); };
const savedTheme = localStorage.getItem('chitchat_theme'); if (savedTheme) window.setTheme(savedTheme);

document.getElementById("appSettingsBtn")?.addEventListener("click", () => {
    if(myUserData) {
        document.getElementById("settingsFullName").value = myUserData.fullName || "";
        document.getElementById("settingsUsername").value = myUserData.username || "";
        document.getElementById("settingsBio").value = myUserData.bio || "";
        document.getElementById("settingsStatusPrivacy").value = myUserData.privacyStatus || "everyone";
        document.getElementById("settingsPfpPrivacy").value = myUserData.privacyPfp || "everyone";
    }
    document.getElementById("appSettingsModal").style.display = "flex";
});
document.getElementById("settingsSaveProfileBtn")?.addEventListener("click", async () => {
    const newName = document.getElementById("settingsFullName").value.trim();
    const newUsername = document.getElementById("settingsUsername").value.trim().toLowerCase();
    const newBio = document.getElementById("settingsBio").value.trim();
    if (!newName || !newUsername) { alert("Display Name and Username cannot be empty."); return; }
    const btn = document.getElementById("settingsSaveProfileBtn"); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    try {
        if (newUsername !== myUserData.username) {
            const usernameQuery = query(collection(db, "users"), where("username", "==", newUsername), limit(1));
            const usernameSnapshot = await getDocs(usernameQuery);
            if (!usernameSnapshot.empty) { alert("This username is already taken by another user."); btn.innerHTML = 'Save Profile'; return; }
        }
        await updateDoc(doc(db, "users", auth.currentUser.uid), { fullName: newName, username: newUsername, bio: newBio, privacyStatus: document.getElementById("settingsStatusPrivacy").value, privacyPfp: document.getElementById("settingsPfpPrivacy").value });
        showToast("Profile Updated", "Your details were saved successfully.");
        document.getElementById("appSettingsModal").style.display = "none";
    } catch(e) { showToast("Error", "Failed to update profile."); } finally { btn.innerHTML = 'Save Profile'; }
});
const settingsPfpInput = document.getElementById("settingsPfpInput");
document.getElementById("settingsChangePfpBtn")?.addEventListener("click", () => settingsPfpInput.click());
settingsPfpInput?.addEventListener("change", async (e) => {
    const file = e.target.files[0]; if (!file) return; const btn = document.getElementById("settingsChangePfpBtn");
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; btn.disabled = true;
    try {
        const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); 
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); 
        const data = await response.json(); await updateDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url }); 
        showToast("Avatar Updated", "New profile picture set!");
    } catch(err) { showToast("Error", "Failed to upload avatar."); } finally { btn.innerHTML = '<i class="fa-solid fa-camera"></i> Update Avatar'; btn.disabled = false; settingsPfpInput.value = ""; }
});

window.approveMember = async (groupId, memberId) => { try { await updateDoc(doc(db, "groups", groupId), { members: arrayUnion(memberId), pendingMembers: arrayRemove(memberId) }); showToast("Approved", "User has been added to the group."); document.getElementById("groupSettingsModal").style.display = "none"; } catch (e) { alert("Error approving member."); } };
window.rejectMember = async (groupId, memberId) => { try { await updateDoc(doc(db, "groups", groupId), { pendingMembers: arrayRemove(memberId) }); showToast("Rejected", "Request deleted."); document.getElementById("groupSettingsModal").style.display = "none"; } catch (e) { alert("Error rejecting member."); } };

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.style.zIndex = "1000"; 
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; } });
});
document.getElementById('toastContainer').style.zIndex = "9999";
// =========================================================
// PWA INSTALLATION LOGIC
// =========================================================
let deferredPrompt;
const installAppBtn = document.getElementById('installAppBtn');

// 1. Catch the browser's hidden install event
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome from showing its default mini-infobar
  e.preventDefault();
  // Save the event so it can be triggered later
  deferredPrompt = e;
  
  // Unhide our custom "Install App" button in the sidebar
  if (installAppBtn) {
    installAppBtn.style.display = 'flex';
  }
});

// 2. Handle the user clicking the install button
if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      // Show the native browser install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User installed Chit-Chat');
        // Hide the button since it's installed now
        installAppBtn.style.display = 'none';
      } else {
        console.log('User dismissed the install prompt');
      }
      // Clear the prompt variable, it can only be used once
      deferredPrompt = null;
    } else {
      alert("Your browser doesn't support this or the app is already installed!");
    }
  });
}
// =========================================================
// AUTOMATIC & RELIABLE PWA UPDATE LOGIC
// =========================================================
const updateAppBtn = document.getElementById('updateAppBtn');
let refreshing = false; 

// Fires ONLY when a new Service Worker has successfully taken over — reload to apply it
// Guard: navigator.serviceWorker may not exist on some browsers/iOS
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (!refreshing) {
    refreshing = true;
    showToast("🎉 Update Applied!", "Reloading with the latest version...");
    setTimeout(() => {
      window.location.href = window.location.href.split('?')[0] + '?updated=' + Date.now();
    }, 1200);
  }
});

if (updateAppBtn) {
  updateAppBtn.addEventListener('click', async () => {
    if (!('serviceWorker' in navigator)) {
      showToast("Error", "Your browser does not support updates.");
      return;
    }

    const originalText = updateAppBtn.innerHTML;
    updateAppBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Checking...';
    updateAppBtn.disabled = true;

    const resetBtn = (msg) => {
      if (updateAppBtn && !refreshing) {
        updateAppBtn.innerHTML = originalText;
        updateAppBtn.disabled = false;
      }
      if (msg) showToast("Up to Date ✓", msg);
    };

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        showToast("Error", "Service Worker not found.");
        resetBtn();
        return;
      }

      // CASE 1: An update was already downloaded in the background and is waiting to activate
      if (reg.waiting) {
        updateAppBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying Update...';
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange listener above will handle the reload
        setTimeout(() => { if (!refreshing) resetBtn(); }, 4000); // silent failsafe only
        return;
      }

      // CASE 2: Listen for a NEW update discovered during this check
      let updateFound = false;

      reg.addEventListener('updatefound', () => {
        updateFound = true;
        const newWorker = reg.installing;
        updateAppBtn.innerHTML = '<i class="fa-solid fa-download fa-fade"></i> Downloading Update...';

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New version downloaded — activate it immediately
              updateAppBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Applying Update...';
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              // controllerchange listener will reload the page
            } else {
              // First install — no previous controller, nothing to update
              resetBtn("You are on our latest version.");
            }
          } else if (newWorker.state === 'redundant') {
            showToast("Error", "Update check failed. Please try again.");
            resetBtn();
          }
        });
      }, { once: true });

      // Ask the browser to fetch sw.js from the server and compare
      await reg.update();

      // CASE 3: reg.update() completed with no new worker found = already up to date
      setTimeout(() => {
        if (!updateFound && !reg.waiting && !refreshing) {
          resetBtn("You are on our latest version.");
        }
      }, 1500); // 1.5s grace period for slow networks

    } catch (err) {
      console.error("PWA Update Error:", err);
      showToast("Error", "Could not reach the server. Try again.");
      if (updateAppBtn && !refreshing) {
        updateAppBtn.innerHTML = originalText;
        updateAppBtn.disabled = false;
      }
    }
  });
}
// =========================================================
// MOBILE KEYBOARD VIEWPORT FIX (ANDROID & IOS)
// =========================================================

function lockViewport() {
    if (window.visualViewport) {
        const h = window.visualViewport.height;
        
        // 1. Force all main containers to shrink, stopping them from extending off-screen
        document.documentElement.style.height = h + 'px';
        document.body.style.height = h + 'px';
        const appScreen = document.getElementById("appScreen");
        if (appScreen) appScreen.style.height = h + 'px';
        
        // 2. Vigorously snap back to the top to fight Android's automatic panning
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        
        // 3. Keep the actual chat messages scrolled to the bottom
        const activeChat = document.getElementById("chatBox");
        const globalChat = document.getElementById("globalChatBox");
        if (activeChat) activeChat.scrollTop = activeChat.scrollHeight;
        if (globalChat) globalChat.scrollTop = globalChat.scrollHeight;
    }
}

// Listen to both resize AND scroll. Android triggers a scroll when it pushes the layout up.
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', lockViewport);
    window.visualViewport.addEventListener('scroll', lockViewport);
}

// 3. Focus and Blur handlers for the text inputs
const chatInputs = [document.getElementById("msg"), document.getElementById("globalMsgInput")];
chatInputs.forEach(input => {
    if (input) {
        input.addEventListener('focus', () => {
            // Fire multiple times during the keyboard animation to keep the header pinned
            setTimeout(lockViewport, 50);
            setTimeout(lockViewport, 300);
        });
        
        input.addEventListener('blur', () => {
            // Restore everything to full height when the keyboard closes
            document.documentElement.style.height = '100dvh';
            document.body.style.height = '100dvh';
            const appScreen = document.getElementById("appScreen");
            if (appScreen) appScreen.style.height = '100%';
            window.scrollTo(0, 0);
        });
    }
});
// ==========================================
// MOBILE WALLPAPER FIX
// ==========================================
function lockWallpaperHeight() {
    const wallpaper = document.querySelector('.chat-wallpaper');
    if (wallpaper) {
        // Measure the physical screen size before any keyboard opens
        const initialHeight = window.innerHeight;
        
        // Lock the wallpaper to exactly those pixels permanently
        wallpaper.style.height = `${initialHeight}px`;
    }
}

// Run this the exact moment the app loads
window.addEventListener('DOMContentLoaded', lockWallpaperHeight);
