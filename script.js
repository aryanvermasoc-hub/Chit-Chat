import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, query, orderBy, getDoc, getDocs, deleteDoc, updateDoc, arrayUnion, writeBatch, limit } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAc1esUcE7tXVRIXvknsUZCrRJR_PNhMzE",
  authDomain: "chat-373ed.firebaseapp.com",
  databaseURL: "https://chat-373ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-373ed",
  storageBucket: "chat-373ed.firebasestorage.app",
  messagingSenderId: "457068201028",
  appId: "1:457068201028:web:cf014c885371cf5c13e811"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const CLOUD_NAME = "ddkov7oka"; 
const UPLOAD_PRESET = "chitchat_preset"; 

// --- 2. GLOBAL STATE ---
let currentChatId = null; let currentChatStatus = null; let targetUserUid = null;
let messagesUnsubscribe = null; let chatMetaUnsubscribe = null; let chatDocUnsubscribe = null; 
let typingTimeout = null; let isSignupMode = false; let replyingToMsg = null; let isCurrentChatGroup = false; 
let allUsers = []; let allGroups = []; let myUserData = null; let myProfileUnsubscribe = null;

let currentGameId = null; let gameUnsubscribe = null; let isPlayingActionGame = false;
let singlePlayerMode = false; let currentAnimationId = null; let currentSpDifficulty = 'medium'; 

let activeMsgId = null; let activeMsgText = ""; let activeMsgSender = "";
let activeMsgContext = 'chat'; 
let pDoodleUnsubscribe = null; window.msgTimeouts = [];

let generatedOTP = null; 
let pendingSignupData = null;

window.changeSpDifficulty = (val) => { currentSpDifficulty = val; };

// --- WEBRTC GLOBAL VARIABLES ---
let localStream = null;
let remoteStream = null;
let peerConnection = null;
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

// --- 3. DOM ELEMENTS ---
const authScreen = document.getElementById("authScreen"); const appScreen = document.getElementById("appScreen");
const tabLogin = document.getElementById("tabLogin"); const tabSignup = document.getElementById("tabSignup");
const nameGroup = document.getElementById("nameGroup"); const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username"); const passwordInput = document.getElementById("password");
const authActionBtn = document.getElementById("authActionBtn"); const sidebar = document.getElementById("sidebar");
const usersList = document.getElementById("usersList"); const searchInput = document.getElementById("searchInput");
const activeChatState = document.getElementById("activeChatState"); const emptyChatState = document.getElementById("emptyChatState");
const chatBox = document.getElementById("chatBox"); const msgInput = document.getElementById("msg"); const sendBtn = document.getElementById("sendBtn");
const backToUsersBtn = document.getElementById("backToUsersBtn");

const chatToggleBtn = document.getElementById("chatToggleBtn"); const homeGamesBtn = document.getElementById("homeGamesBtn");
const newsFeedContainer = document.getElementById("newsFeedContainer"); const chatListContainer = document.getElementById("chatListContainer");
const gamesNavContainer = document.getElementById("gamesNavContainer"); const openUsersListBtn = document.getElementById("openUsersListBtn");

const chatSettingsBtn = document.getElementById("chatSettingsBtn"); const chatSettingsModal = document.getElementById("chatSettingsModal");
const modalMsgTimerSelect = document.getElementById("modalMsgTimerSelect"); const changeWallpaperBtn = document.getElementById("changeWallpaperBtn");
const wallpaperInput = document.getElementById("wallpaperInput"); const clearChatMeBtn = document.getElementById("clearChatMeBtn");
const removeWallpaperBtn = document.getElementById("removeWallpaperBtn");

const launchGameMenuBtn = document.getElementById("launchGameMenuBtn");
const chatDoodleBtn = document.getElementById("chatDoodleBtn");

// GHOST MODE DOM (SYNCED)
const ghostModeBtn = document.getElementById("ghostModeBtn");
window.isGhostModeActive = false;

if (ghostModeBtn) {
    ghostModeBtn.addEventListener("click", async () => {
        if (!currentChatId || isCurrentChatGroup) {
            showToast("Not available", "Ghost mode is for 1v1 chats only.");
            return;
        }
        // Send the toggle command to Firebase instead of changing it locally
        const newState = !window.isGhostModeActive;
        try {
            await updateDoc(doc(db, "chats", currentChatId), { ghostModeActive: newState });
        } catch(e) { console.error("Ghost mode toggle error", e); }
    });
}

function switchSidebarView(view) {
    newsFeedContainer.style.display = "none"; chatListContainer.style.display = "none"; gamesNavContainer.style.display = "none";
    if (view === 'chats') { chatListContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-message"></i> Chats'; chatToggleBtn.style.color = "white"; homeGamesBtn.style.color = "var(--text-muted)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; } 
    else if (view === 'games') { gamesNavContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed'; chatToggleBtn.style.color = "white"; homeGamesBtn.style.color = "var(--primary)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; } 
    else if (view === 'feed') { newsFeedContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed (Active)'; chatToggleBtn.style.color = "var(--accent)"; homeGamesBtn.style.color = "var(--text-muted)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; }
}

switchSidebarView('games');
chatToggleBtn.addEventListener("click", () => { if (chatListContainer.style.display === "flex") { switchSidebarView('feed'); } else { switchSidebarView('chats'); } });
homeGamesBtn.addEventListener("click", () => { switchSidebarView('games'); });
if(openUsersListBtn) { openUsersListBtn.addEventListener("click", () => { switchSidebarView('chats'); openUsersListBtn.style.color = "var(--primary)"; }); }

const encryptMessage = (text, secretKey) => { if (!text) return text; return CryptoJS.AES.encrypt(text, secretKey).toString(); };
const decryptMessage = (cipherText, secretKey) => { if (!cipherText) return cipherText; try { const bytes = CryptoJS.AES.decrypt(cipherText, secretKey); return bytes.toString(CryptoJS.enc.Utf8); } catch (e) { return "[Encrypted Message]"; } };
const getFakeEmail = (username) => `${username.toLowerCase().trim()}@chitchat.app`;
const generateAvatar = (userObj, fallbackName) => { if (userObj && userObj.avatarUrl) return userObj.avatarUrl; const name = (userObj && (userObj.fullName || userObj.username)) || fallbackName || "User"; return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&rounded=true&bold=true`; };
function timeAgo(ms) { if (!ms) return ""; const seconds = Math.floor((Date.now() - ms) / 1000); if (seconds < 60) return "Just now"; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} min ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} hr ago`; return `${Math.floor(hours / 24)} days ago`; }

window.showToast = function(title, message, avatarUrl) {
  const container = document.getElementById("toastContainer"); if(!container) return;
  const imgUrl = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=8b5cf6&color=fff`;
  const toast = document.createElement("div"); toast.className = "toast";
  toast.innerHTML = `<img src="${imgUrl}" alt="icon" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"><div class="toast-content" style="display: flex; flex-direction: column; overflow: hidden;"><span style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${title}</span><span style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${message}</span></div>`;
  container.appendChild(toast); setTimeout(() => { toast.style.animation = "fadeOutToast 0.5s ease forwards"; setTimeout(() => { if(toast.parentElement) toast.remove(); }, 500); }, 4000);
};

const emailGroup = document.getElementById("emailGroup");
const confirmPasswordGroup = document.getElementById("confirmPasswordGroup");

const toggleAuthMode = (signup) => { 
  isSignupMode = signup; 
  if (signup) { 
    tabSignup.classList.add("active"); 
    tabLogin.classList.remove("active"); 
    nameGroup.style.display = "flex"; 
    if(emailGroup) emailGroup.style.display = "flex"; 
    if(confirmPasswordGroup) confirmPasswordGroup.style.display = "flex"; 
    authActionBtn.innerText = "Create Account"; 
  } else { 
    tabLogin.classList.add("active"); 
    tabSignup.classList.remove("active"); 
    nameGroup.style.display = "none"; 
    if(emailGroup) emailGroup.style.display = "none"; 
    if(confirmPasswordGroup) confirmPasswordGroup.style.display = "none"; 
    authActionBtn.innerText = "Enter Chit-Chat"; 
  } 
};

tabLogin.addEventListener("click", () => toggleAuthMode(false));
tabSignup.addEventListener("click", () => toggleAuthMode(true));

authActionBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim().toLowerCase(); 
  const password = passwordInput.value.trim(); 
  const fullName = fullNameInput.value.trim();
  
  const realEmail = document.getElementById("emailInput") ? document.getElementById("emailInput").value.trim() : "";
  const confirmPassword = document.getElementById("confirmPassword") ? document.getElementById("confirmPassword").value.trim() : "";

  if (!username || !password || (isSignupMode && (!fullName || !realEmail || !confirmPassword))) { 
      alert("Please fill in all required fields."); 
      return; 
  }
  if (isSignupMode && password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
  }
  if (username.includes(" ")) { 
      alert("Username cannot contain spaces."); 
      return; 
  }

  authActionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
  
  try { 
      if (isSignupMode) { 
          generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
          pendingSignupData = { realEmail, password, username, fullName };

          await emailjs.send("service_z5e6d5x", "template_fks6dsp", {
              to_name: fullName,
              to_email: realEmail,
              otp_code: generatedOTP
          });

          document.getElementById("otpModal").style.display = "flex";
          authActionBtn.innerText = "Create Account"; 
          
      } else { 
          const loginEmail = username.includes('@') ? username : `${username}@chitchat.app`;
          await signInWithEmailAndPassword(auth, loginEmail, password); 
      } 
  } catch (error) { 
      alert(error.message || "Failed to process request."); 
      authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat"; 
  }
});

document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
    const enteredOtp = document.getElementById("otpInput").value.trim();
    const verifyBtn = document.getElementById("verifyOtpBtn");

    if (enteredOtp !== generatedOTP) {
        alert("Invalid OTP! Please check your email and try again.");
        return;
    }

    verifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
    verifyBtn.disabled = true;

  try {
        const accountEmail = `${pendingSignupData.username}@chitchat.app`;
        const cred = await createUserWithEmailAndPassword(auth, accountEmail, pendingSignupData.password); 
        
        await setDoc(doc(db, "users", cred.user.uid), { 
            username: pendingSignupData.username, 
            fullName: pendingSignupData.fullName,
            realEmail: pendingSignupData.realEmail,
            createdAt: Date.now(), 
            isOnline: false, 
            lastSeen: Date.now() 
        });
        
        document.getElementById("otpModal").style.display = "none";
        generatedOTP = null; pendingSignupData = null;
        document.getElementById("otpInput").value = "";
        verifyBtn.innerText = "Verify & Create Account";
        verifyBtn.disabled = false;

        alert("Account verified and created! You can now log in.");
        await signOut(auth);
        document.getElementById("tabLogin").click(); 

    } catch (error) {
        alert(error.message.replace("Firebase: ", ""));
        verifyBtn.innerText = "Verify & Create Account";
        verifyBtn.disabled = false;
    }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (confirm("Disconnect from Chit-Chat?")) { try { await updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: Date.now() }); } catch (e) {} if(myProfileUnsubscribe) myProfileUnsubscribe(); signOut(auth); }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    authScreen.style.display = "none"; appScreen.style.display = "flex"; history.pushState({ page: "home" }, ""); 
    await updateDoc(doc(db, "users", user.uid), { isOnline: true });
    showToast("Welcome Back!", "You are securely connected.");
    window.addEventListener("beforeunload", () => updateDoc(doc(db, "users", user.uid), { isOnline: false, lastSeen: Date.now() }));
    startMyProfileListener(user.uid); loadSidebarData(); loadNewsFeed(); 
  } else {
    authScreen.style.display = "flex"; appScreen.style.display = "none"; emptyChatState.style.display = "flex"; activeChatState.style.display = "none";
    usernameInput.value = ""; passwordInput.value = ""; authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat"; myUserData = null;
  }
});

async function loadNewsFeed() {
  const container = document.getElementById("newsFeedContainer"); container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--primary);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px;"></i><p style="margin-top:10px;">Loading Latest Tech News...</p></div>';
  try {
    const res = await fetch(`https://dev.to/api/articles?per_page=15&page=${Math.floor(Math.random() * 5) + 1}&tag=programming`); const articles = await res.json(); container.innerHTML = '';
    articles.forEach(article => { container.innerHTML += `<div class="news-feed-card"><h4>${article.title}</h4><p>${article.description || 'Tap to read the full insight...'}</p><a href="${article.url}" target="_blank">Read Article <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; margin-left:3px;"></i></a></div>`; });
  } catch(e) { container.innerHTML = '<div style="text-align:center; color: #ff4757; padding: 20px;">Failed to load news feed.</div>'; }
}
function startMyProfileListener(uid) {
  if(myProfileUnsubscribe) myProfileUnsubscribe();
  myProfileUnsubscribe = onSnapshot(doc(db, "users", uid), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (myUserData && data.chatMeta) {
        for (let otherUid in data.chatMeta) {
          let newMeta = data.chatMeta[otherUid]; let oldMeta = myUserData.chatMeta ? myUserData.chatMeta[otherUid] : null;
          if (newMeta.unread && (!oldMeta || oldMeta.time !== newMeta.time)) {
            if (currentChatId && targetUserUid === otherUid) { updateDoc(doc(db, "users", uid), { [`chatMeta.${otherUid}.unread`]: false }); } 
            else {
              const sender = allUsers.find(u => u.id === otherUid); const sName = sender ? (sender.fullName || sender.username) : "Someone"; const sAvatar = generateAvatar(sender, sName); let preview = newMeta.text;
              if(preview === "🎮 GAME CHALLENGE" || preview === "🎨 DOODLE REQUEST") { showToast(`Challenge!`, `${sName} sent you a request.`, sAvatar); } 
              else {
                  if (preview.startsWith("U2FsdGVkX1") || preview.startsWith("U2Fz")) { const pChatId = uid < otherUid ? `${uid}_${otherUid}` : `${otherUid}_${uid}`; const decrypted = decryptMessage(preview, pChatId); preview = decrypted ? decrypted : "🔒 Encrypted Message"; }
                  showToast(`New Message from ${sName}`, preview, sAvatar);
              }
            }
          }
        }
      }
      myUserData = data; const displayName = data.fullName || data.username;
      document.getElementById("myName").innerText = displayName; document.getElementById("myUsername").innerText = `@${data.username}`; document.getElementById("myAvatar").src = generateAvatar(data, displayName);
      if(allUsers.length > 0) renderSidebar();
    }
  });
}

function loadSidebarData() {
  onSnapshot(collection(db, "users"), (snapshot) => { allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderSidebar(); });
  onSnapshot(collection(db, "groups"), (snapshot) => { allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); renderSidebar(); });
}

document.getElementById("showUsersTab").addEventListener("click", () => { document.getElementById("showUsersTab").classList.add("active"); document.getElementById("showGroupsTab").classList.remove("active"); document.getElementById("usersList").style.display = "block"; document.getElementById("groupsList").style.display = "none"; });
document.getElementById("showGroupsTab").addEventListener("click", () => { document.getElementById("showGroupsTab").classList.add("active"); document.getElementById("showUsersTab").classList.remove("active"); document.getElementById("groupsList").style.display = "block"; document.getElementById("usersList").style.display = "none"; });

function renderSidebar() {
  const usersListEl = document.getElementById("usersList"); const groupsListEl = document.getElementById("groupsList");
  usersListEl.innerHTML = ""; if(groupsListEl) groupsListEl.innerHTML = "";

  allGroups.forEach(group => {
    if (!group.members.includes(auth.currentUser.uid)) return; 
    const groupCard = document.createElement("div"); groupCard.className = "user-item";
    groupCard.innerHTML = `<div class="avatar-wrapper"><div class="avatar" style="background:var(--primary); display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; font-size:18px;">${group.name.charAt(0)}</div></div><div class="user-meta"><span class="name">${group.name}</span><span class="handle">${group.members.length} members</span></div>`;
    groupCard.onclick = () => openGroupChat(group.id, group.name, group.members.length);
    if(groupsListEl) groupsListEl.appendChild(groupCard);
  });

  let sortedUsers = [...allUsers].filter(u => u.id !== auth.currentUser.uid);
  sortedUsers.sort((a, b) => { let timeA = myUserData?.chatMeta?.[a.id]?.time || 0; let timeB = myUserData?.chatMeta?.[b.id]?.time || 0; return timeB - timeA; });

  sortedUsers.forEach((user) => {
    const displayName = user.fullName || user.username; const avatarUrl = generateAvatar(user, displayName); const isOnline = user.isOnline ? "online" : "";
    const meta = myUserData?.chatMeta?.[user.id]; const unreadStyle = meta?.unread ? "font-weight:700; color:var(--primary);" : "";
    let previewText = meta?.text ? meta.text : `@${user.username}`;
    if (previewText.startsWith("U2FsdGVkX1") || previewText.startsWith("U2Fz")) { const pChatId = auth.currentUser.uid < user.id ? `${auth.currentUser.uid}_${user.id}` : `${user.id}_${auth.currentUser.uid}`; const decryptedText = decryptMessage(previewText, pChatId); previewText = decryptedText ? decryptedText : "🔒 Encrypted Message"; }
    const userCard = document.createElement("div"); userCard.className = "user-item";
    userCard.innerHTML = `<div class="avatar-wrapper"><img src="${avatarUrl}" class="avatar"><div class="status-dot ${isOnline}"></div></div><div class="user-meta"><span class="name" style="${unreadStyle}">${displayName}</span><span class="handle" style="${unreadStyle}">${previewText}</span></div>${meta?.unread ? '<div style="width:10px; height:10px; background:var(--primary); border-radius:50%; flex-shrink:0;"></div>' : ''}`;
    userCard.onclick = () => { if(meta?.unread) updateDoc(doc(db, "users", auth.currentUser.uid), { [`chatMeta.${user.id}.unread`]: false }); openChat(user.id, displayName, avatarUrl, user.isOnline, user.lastSeen); }
    usersListEl.appendChild(userCard);
  });
}

const createGroupBtn = document.getElementById("createGroupBtn");
if(createGroupBtn) {
  createGroupBtn.addEventListener("click", () => {
    const groupName = prompt("Enter a name for the new Group:"); if (!groupName) return;
    let promptText = "Select members by typing their numbers:\n\n"; const selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid);
    selectableUsers.forEach((u, index) => { promptText += `${index + 1}. ${u.fullName || u.username}\n`; });
    const selections = prompt(promptText); if (!selections) return;
    let members = [auth.currentUser.uid]; selections.split(',').forEach(numText => { const idx = parseInt(numText.trim()) - 1; if (selectableUsers[idx]) members.push(selectableUsers[idx].id); });
    if (members.length > 1) { addDoc(collection(db, "groups"), { name: groupName, members: members, createdAt: Date.now(), createdBy: auth.currentUser.uid }); showToast("Group Created", `${groupName} was created successfully.`); } else { alert("You must add at least one other person."); }
  });
}

if (backToUsersBtn) { 
    backToUsersBtn.addEventListener("click", () => { 
        if (window.innerWidth <= 992) { 
            sidebar.classList.remove("hidden"); 
            activeChatState.style.display = "none"; 
            emptyChatState.style.display = "flex"; 
            
            currentChatId = null; 
            targetUserUid = null; 
            isCurrentChatGroup = false;
            
            if (messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
            if (chatDocUnsubscribe) { chatDocUnsubscribe(); chatDocUnsubscribe = null; }
            if (chatMetaUnsubscribe) { chatMetaUnsubscribe(); chatMetaUnsubscribe = null; }
        } 
    }); 
}

function listenToChatStatus(targetName) {
    if (chatDocUnsubscribe) chatDocUnsubscribe();
    const overlay = document.getElementById("chatStateOverlay"); 
    const inputWrapper = document.querySelector("#activeChatState .chat-input-wrapper");
    
    if (isCurrentChatGroup) { 
        currentChatStatus = 'accepted'; 
        if(overlay) overlay.style.display = "none"; 
        if(inputWrapper) inputWrapper.style.display = "flex"; 
        return; 
    }
    
    chatDocUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (snap) => {
        if (snap.exists()) {
            const data = snap.data(); currentChatStatus = data.status;
            if (data.messageTimer !== undefined && modalMsgTimerSelect && modalMsgTimerSelect.value != data.messageTimer) { 
                modalMsgTimerSelect.value = data.messageTimer; 
            }
            
            if (data.doodleActive) {
                initPrivateDoodle();
            } else {
                if (document.getElementById("privateDoodleArea")) document.getElementById("privateDoodleArea").style.display = "none";
                if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
            }

            // Sync Ghost Mode via Firebase
            const previousGhostState = window.isGhostModeActive;
            window.isGhostModeActive = !!data.ghostModeActive;
            
            if (window.isGhostModeActive) {
                if (ghostModeBtn) ghostModeBtn.classList.add("active");
                if (inputWrapper) inputWrapper.classList.add("ghost-input-active");
                if (!previousGhostState && currentChatStatus === 'accepted') showToast("Ghost Mode 👻", "Active! Messages vanish in 10s.");
            } else {
                if (ghostModeBtn) ghostModeBtn.classList.remove("active");
                if (inputWrapper) inputWrapper.classList.remove("ghost-input-active");
                if (previousGhostState && currentChatStatus === 'accepted') showToast("Ghost Mode Off", "Back to normal chat mode.");
            }

            if (data.status === 'pending') {
                document.getElementById("chatDoodleBtn").style.display = "none"; 
                if (ghostModeBtn) ghostModeBtn.style.display = "none"; 
                document.getElementById("launchGameMenuBtn").style.display = "none";
                document.getElementById("chatSettingsBtn").style.display = "none";
                if(overlay) overlay.style.display = "flex"; 
                if(inputWrapper) inputWrapper.style.display = "none";
                
                if (data.initiator === auth.currentUser.uid) { 
                    overlay.innerHTML = `<p style="font-size: 14px; margin: 0; color: var(--text-muted);"><i class="fa-solid fa-clock"></i> Request sent to <b>${targetName}</b>. Waiting for approval...</p>`; 
                } else { 
                    overlay.innerHTML = `<p style="font-size: 14px; margin-bottom: 15px;"><strong style="color:var(--primary);">${targetName}</strong> wants to connect with you.</p><div style="display:flex; gap: 15px; justify-content: center;"><button onclick="acceptChatRequest()" class="primary-btn glow-btn" style="width:auto; padding: 8px 25px; background:#10b981;">Accept</button><button onclick="declineChatRequest()" class="primary-btn" style="width:auto; padding: 8px 25px; background:rgba(255,255,255,0.1); color:var(--text-muted);">Decline</button></div>`; 
                }
            } else if (data.status === 'accepted') { 
                document.getElementById("chatDoodleBtn").style.display = "block"; 
                if (ghostModeBtn) ghostModeBtn.style.display = "block";
                document.getElementById("launchGameMenuBtn").style.display = "block"; 
                document.getElementById("chatSettingsBtn").style.display = "block"; 
                if(overlay) overlay.style.display = "none"; 
                if(inputWrapper) inputWrapper.style.display = "flex"; 
            }
        } else {
            currentChatStatus = 'none'; 
            document.getElementById("chatDoodleBtn").style.display = "none";
            if (ghostModeBtn) ghostModeBtn.style.display = "none";
            document.getElementById("launchGameMenuBtn").style.display = "none";
            document.getElementById("chatSettingsBtn").style.display = "none";
            if(overlay) overlay.style.display = "flex"; 
            if(inputWrapper) inputWrapper.style.display = "none";
            overlay.innerHTML = `<p style="font-size: 14px; margin-bottom: 15px;">You are not connected with <b>${targetName}</b>.</p><button onclick="sendChatRequest()" class="primary-btn glow-btn" style="width:auto; padding: 8px 25px;"><i class="fa-solid fa-user-plus"></i> Send Request</button>`;
        }
    });
}

function openChat(targetUid, targetName, targetAvatar, isTargetOnline, targetLastSeen) {
  isCurrentChatGroup = false; 
  currentChatId = auth.currentUser.uid < targetUid ? `${auth.currentUser.uid}_${targetUid}` : `${targetUid}_${auth.currentUser.uid}`; 
  targetUserUid = targetUid;
  
  document.getElementById("chatSettingsBtn").style.display = "none"; 
  document.getElementById("chatDoodleBtn").style.display = "none"; 
  if (ghostModeBtn) ghostModeBtn.style.display = "none"; 
  document.getElementById("launchGameMenuBtn").style.display = "none"; 
  
  document.getElementById("chatBox").innerHTML = ""; 
  if(replyingToMsg) document.getElementById("cancelReplyBtn").click();
  if (document.getElementById("privateDoodleArea")) document.getElementById("privateDoodleArea").style.display = "none";

  const overlay = document.getElementById("chatStateOverlay");
  if(overlay) {
      overlay.style.display = "none";
      overlay.innerHTML = "";
  }

  if (myUserData && myUserData.chatMeta && myUserData.chatMeta[targetUserUid] && myUserData.chatMeta[targetUserUid].wallpaperUrl) { 
      document.getElementById("chatBox").style.backgroundImage = `linear-gradient(rgba(10,10,15,0.8), rgba(10,10,15,0.8)), url('${myUserData.chatMeta[targetUserUid].wallpaperUrl}')`; 
  } else { 
      document.getElementById("chatBox").style.backgroundImage = "none"; 
  }
  
  document.getElementById("chatTargetName").innerText = targetName; 
  document.getElementById("chatTargetAvatar").src = targetAvatar; 
  const targetStatus = document.getElementById("chatTargetStatus");
  
  if (isTargetOnline) { 
      targetStatus.classList.add('online'); targetStatus.innerText = "Online"; 
  } else { 
      targetStatus.classList.remove('online'); targetStatus.innerText = `Last seen: ${timeAgo(targetLastSeen)}`; 
  }
  
  emptyChatState.style.display = "none"; 
  activeChatState.style.display = "flex"; 
  if(window.innerWidth <= 992) { sidebar.classList.add("hidden"); history.pushState({ page: "chat" }, ""); }

  loadMessages(); listenToTyping(); listenToChatStatus(targetName); 
}

function openGroupChat(groupId, groupName, memberCount) {
  isCurrentChatGroup = true; currentChatId = groupId; targetUserUid = null;
  document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none"; document.getElementById("chatDoodleBtn").style.display = "none"; 
  if (ghostModeBtn) ghostModeBtn.style.display = "none"; 
  document.getElementById("chatBox").innerHTML = ""; document.getElementById("chatBox").style.backgroundImage = "none"; if(replyingToMsg) document.getElementById("cancelReplyBtn").click();
  if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
  
  const overlay = document.getElementById("chatStateOverlay");
  if(overlay) { overlay.style.display = "none"; overlay.innerHTML = ""; }

  const groupData = allGroups.find(g => g.id === groupId); const avatarToUse = groupData && groupData.avatarUrl ? groupData.avatarUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=8b5cf6&color=fff`;
  document.getElementById("chatTargetName").innerText = groupName; document.getElementById("chatTargetAvatar").src = avatarToUse; document.getElementById("chatTargetStatus").innerText = `${memberCount} members (Tap for Info)`;
  emptyChatState.style.display = "none"; activeChatState.style.display = "flex"; if(window.innerWidth <= 992) { sidebar.classList.add("hidden"); history.pushState({ page: "chat" }, ""); }
  loadMessages(); listenToChatStatus(groupName); 
}

function loadMessages() {
  if (messagesUnsubscribe) messagesUnsubscribe(); 
  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("time", "asc"));
  
  messagesUnsubscribe = onSnapshot(q, (snapshot) => {
    chatBox.innerHTML = ""; let lastMyMsg = null; 
    if(window.msgTimeouts) window.msgTimeouts.forEach(clearTimeout); window.msgTimeouts = [];
    const fragment = document.createDocumentFragment();
    let lastMyMsgId = null;
    snapshot.forEach(d => { if(d.data().sender === auth.currentUser.uid) lastMyMsgId = d.id; });
    snapshot.forEach(docSnap => {
      const msg = docSnap.data(); const msgId = docSnap.id; const isMe = msg.sender === auth.currentUser.uid;
      if (isMe) lastMyMsg = msg; if (msg.isExpired) return;

      const pDoodleArea = document.getElementById("privateDoodleArea");
      const isDoodleOpen = pDoodleArea && pDoodleArea.style.display === "flex";
      const activeGameArea = document.getElementById("activeGameArea");
      const isGameOpen = activeGameArea && activeGameArea.style.display === "flex";
      const isSidebarCoveringChat = window.innerWidth <= 992 && !sidebar.classList.contains("hidden");
      const isChatCurrentlyVisible = activeChatState.style.display === "flex" && document.visibilityState === 'visible' && !isSidebarCoveringChat;

      if (!isMe && !msg.seenAt && !isDoodleOpen && !isGameOpen && isChatCurrentlyVisible) { 
          const updateData = { seenAt: Date.now() }; 
          if (msg.timerDuration) { updateData.expiresAt = Date.now() + msg.timerDuration; } 
          updateDoc(doc(db, "chats", currentChatId, "messages", msgId), updateData).catch(e=>{}); 
      }

      if (msg.expiresAt) {
          const timeLeft = msg.expiresAt - Date.now();
          const wipeMessage = async () => {
              if (msg.imagePublicId) { try { await updateDoc(doc(db, "chats", currentChatId, "messages", msgId), { text: "🚫 Image Expired", imageUrl: null, isExpired: true }); } catch(e) {} } 
              else { try { await deleteDoc(doc(db, "chats", currentChatId, "messages", msgId)); } catch(e) { await updateDoc(doc(db, "chats", currentChatId, "messages", msgId), { text: "", expiresAt: null, isExpired: true }); } }
              if (!isCurrentChatGroup) { try { const expiredMeta = { time: Date.now(), text: "🚫 Message Expired", unread: false }; await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: expiredMeta } }, { merge: true }); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: expiredMeta } }, { merge: true }); } catch(err) {} }
          };
          if (timeLeft <= 0) { wipeMessage(); return; } 
          else { const timerId = setTimeout(() => { wipeMessage(); }, timeLeft); window.msgTimeouts.push(timerId); }
      }

      if (msg.deletedFor && msg.deletedFor.includes(auth.currentUser.uid)) return;

      const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const div = document.createElement("div"); div.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
      let contentHtml = "";

      if (msg.isDoodleRequest) {
          if (isMe) { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎨 Doodle Request Sent</h4><p>Waiting for opponent to accept...</p></div>`; }
          else { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎨 Shared Whiteboard</h4><p>Wants to draw with you!</p><div class="challenge-actions"><button class="btn-accept" onclick="acceptDoodle()">Accept</button></div></div>`; }
      } else if (msg.isGameChallenge) {
          const gameNames = { "ludo": "Ludo Arena", "tictactoe": "Tic Tac Toe", "rps": "Rock Paper Scissors", "jetfighter": "Jet Fighter", "carracing": "Car Racing" };
          if (isMe) { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎮 Challenge Sent</h4><p>Waiting for opponent to accept ${gameNames[msg.gameType] || 'a Game'}...</p></div>`; } 
          else { contentHtml = `<div class="challenge-bubble" onclick="event.stopPropagation();"><h4>🎮 Game Request</h4><p>Wants to play <b>${gameNames[msg.gameType] || 'a Game'}</b></p><div class="challenge-actions"><button class="btn-accept" onclick="acceptGameChallenge('${msg.gameId}', '${msg.gameType}')">Accept</button></div></div>`; }
      } else if (msg.isDeleted) { contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`; } 
      else {
        let decryptedText = decryptMessage(msg.text, currentChatId); if (!decryptedText && !msg.imageUrl) return;
        let replyHtml = msg.replyToText ? `<div class="replied-msg-box" onclick="event.stopPropagation();"><b>${msg.replyToName}</b><div class="preview-text">${decryptMessage(msg.replyToText, currentChatId)}</div></div>` : "";
        let imgHtml = msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width:100%; border-radius:12px; margin-bottom:8px; cursor:pointer;" onclick="event.stopPropagation(); window.open('${msg.imageUrl}')" />` : "";
        let groupSenderHtml = (isCurrentChatGroup && !isMe) ? `<div style="font-size:11px; color:var(--primary); font-weight:600; margin-bottom:4px;">${msg.senderName}</div>` : "";
        const encodedText = encodeURIComponent(decryptedText || (msg.imageUrl ? 'Image' : '')); const encodedName = encodeURIComponent(isMe ? 'You' : (msg.senderName || document.getElementById('chatTargetName').innerText));
        const ghostClass = msg.isGhost ? 'ghost-msg' : '';
        contentHtml = `<div class="msg-bubble ${ghostClass}" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')">${groupSenderHtml}${replyHtml}${imgHtml}<span style="word-wrap: break-word; white-space: pre-wrap; display: block; max-width: 100%;">${decryptedText}</span> ${msg.isEdited ? '<span style="font-size:10px; opacity:0.5; display:block; margin-top:5px;">(edited)</span>' : ''}</div>`;
      }
      
      let avatarSrc = isCurrentChatGroup && !isMe ? generateAvatar(allUsers.find(u=>u.id===msg.sender), msg.senderName) : document.getElementById('chatTargetAvatar').src;
      let seenTickHtml = (isMe && msgId === lastMyMsgId && msg.seenAt) ? `<i class="fa-solid fa-check-double" style="color: #3b82f6; margin-left: 5px; font-size: 11px;"></i>` : '';
      div.innerHTML = `${!isMe ? `<img src="${avatarSrc}" class="msg-avatar">` : ''}<div style="display:flex; flex-direction:column; max-width: 100%;">${contentHtml}<div class="msg-time">${timeStr}${seenTickHtml}</div></div>`;
      fragment.appendChild(div);
    });

    chatBox.appendChild(fragment);
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}
window.openMessageModal = (msgId, encodedText, encodedName, isMe, context = 'chat') => { 
    activeMsgId = msgId; 
    activeMsgText = decodeURIComponent(encodedText); 
    activeMsgSender = decodeURIComponent(encodedName); 
    activeMsgContext = context;
    
    const list = document.getElementById("msgOptionsList"); 
    list.innerHTML = `<button class="primary-btn" style="background: var(--primary);" onclick="triggerReply()"><i class="fa-solid fa-reply"></i> Reply</button>`; 
    if (isMe) { 
        list.innerHTML += `<button class="primary-btn" style="background: #3b82f6;" onclick="triggerEdit()"><i class="fa-solid fa-pen"></i> Edit Message</button><button class="primary-btn" style="background: #ef4444;" onclick="triggerDeleteEveryone()"><i class="fa-solid fa-trash-can"></i> Delete for Everyone</button>`; 
    } 
    list.innerHTML += `<button class="primary-btn" style="background: #f59e0b;" onclick="triggerDeleteMe()"><i class="fa-solid fa-eraser"></i> Delete for Me</button>`; 
    document.getElementById("msgOptionsModal").style.display = "flex"; 
};

window.closeMsgOptions = () => { document.getElementById("msgOptionsModal").style.display = "none"; };

window.triggerReply = () => { 
    closeMsgOptions(); 
    replyingToMsg = { id: activeMsgId, text: activeMsgText, name: activeMsgSender, context: activeMsgContext }; 
    document.getElementById("replyPreviewName").innerText = `Replying to ${activeMsgSender}`; 
    document.getElementById("replyPreviewText").innerText = activeMsgText; 
    
    const previewContainer = document.getElementById("replyPreviewContainer");
    previewContainer.style.display = "flex"; 
    
    if (activeMsgContext === 'global') {
        document.getElementById("exploreLounge").insertBefore(previewContainer, document.querySelector("#exploreLounge .chat-input-wrapper"));
        globalMsgInput.focus();
    } else {
        document.getElementById("activeChatState").insertBefore(previewContainer, document.querySelector("#activeChatState .chat-input-wrapper"));
        msgInput.focus();
    }
};

window.triggerEdit = async () => { 
    closeMsgOptions(); 
    const newText = prompt("Edit message:", activeMsgText); 
    if (newText && newText.trim() !== "" && newText !== activeMsgText) { 
        if (activeMsgContext === 'global') {
            await updateDoc(doc(db, "global_lounge", activeMsgId), { text: newText.trim(), isEdited: true });
        } else {
            await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { text: encryptMessage(newText.trim(), currentChatId), isEdited: true }); 
        }
    } 
};

window.triggerDeleteEveryone = async () => { 
    closeMsgOptions(); 
    if (confirm("Delete this message for everyone?")) { 
        if (activeMsgContext === 'global') {
            await updateDoc(doc(db, "global_lounge", activeMsgId), { isDeleted: true, text: "" });
        } else {
            await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { isDeleted: true, text: "" }); 
        }
    } 
};

window.triggerDeleteMe = async () => { 
    closeMsgOptions(); 
    if (confirm("Delete this message for yourself?")) { 
        if (activeMsgContext === 'global') {
            await updateDoc(doc(db, "global_lounge", activeMsgId), { deletedFor: arrayUnion(auth.currentUser.uid) });
        } else {
            await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { deletedFor: arrayUnion(auth.currentUser.uid) }); 
        }
    } 
};

document.getElementById("cancelReplyBtn").addEventListener("click", () => { 
    replyingToMsg = null; 
    const previewContainer = document.getElementById("replyPreviewContainer");
    previewContainer.style.display = "none"; 
    document.getElementById("activeChatState").insertBefore(previewContainer, document.querySelector("#activeChatState .chat-input-wrapper")); 
});

window.sendChatRequest = async () => {
    if (!currentChatId || !targetUserUid) return;
    try {
        await setDoc(doc(db, "chats", currentChatId), { status: 'pending', initiator: auth.currentUser.uid, createdAt: Date.now() });
        await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "👋 Connection Request", unread: true } } }, { merge: true });
        showToast("Request Sent", "Waiting for approval.");
    } catch (error) { showToast("Error", "Failed to send request."); }
};

window.acceptChatRequest = async () => {
    if (!currentChatId) return;
    try { await updateDoc(doc(db, "chats", currentChatId), { status: 'accepted' }); showToast("Connected", "You can now chat!"); } 
    catch (error) { showToast("Error", "Failed to accept request."); }
};

window.declineChatRequest = async () => {
    if (!currentChatId) return;
    try {
        await deleteDoc(doc(db, "chats", currentChatId)); showToast("Declined", "Request removed.");
        if (window.innerWidth <= 992) document.getElementById("backToUsersBtn").click();
    } catch (error) { showToast("Error", "Failed to decline request."); }
};

function listenToTyping() { if (chatMetaUnsubscribe) chatMetaUnsubscribe(); if (isCurrentChatGroup) return; chatMetaUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (docSnap) => { if (docSnap.exists() && docSnap.data()[`typing_${targetUserUid}`]) { document.getElementById("chatTargetStatus").innerText = "typing..."; } else { const targetUser = allUsers.find(u => u.id === targetUserUid); if (targetUser && targetUser.isOnline) { document.getElementById("chatTargetStatus").innerText = "Online"; } else if (targetUser) { document.getElementById("chatTargetStatus").innerText = `Last seen: ${timeAgo(targetUser.lastSeen)}`; } } }); }
msgInput.addEventListener("input", async () => { if(!currentChatId || isCurrentChatGroup) return; await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: true }, { merge: true }); clearTimeout(typingTimeout); typingTimeout = setTimeout(async () => { await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true }); }, 1500); });

async function sendMessage() {
  const text = msgInput.value.trim(); if (!text) return;
  const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000;
  msgInput.value = ""; msgInput.focus(); if (!isCurrentChatGroup && currentChatStatus !== 'accepted') return;
  
  const encryptedText = encryptMessage(text, currentChatId);
  if (!isCurrentChatGroup) { await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true }); try { await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { time: Date.now(), text: `You: ${text}`, unread: false } } }, { merge: true }); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: encryptedText, unread: true } } }, { merge: true }); } catch(err) {} }
  
  const payload = { text: encryptedText, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false, isGameChallenge: false };
  
  // GHOST MODE OVERRIDE
  if (window.isGhostModeActive) {
      payload.timerDuration = 10000; 
      payload.isGhost = true; 
  } else if (timerValue > 0) {
      payload.timerDuration = timerValue; 
  }
  
  if (replyingToMsg && replyingToMsg.context === 'chat') { payload.replyToId = replyingToMsg.id; payload.replyToText = encryptMessage(replyingToMsg.text, currentChatId); payload.replyToName = replyingToMsg.name; document.getElementById("cancelReplyBtn").click(); }
  try { await addDoc(collection(db, "chats", currentChatId, "messages"), payload); } catch (e) { showToast("Error", "Message failed to send."); }
}
sendBtn.addEventListener("click", sendMessage); msgInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
searchInput.addEventListener("input", (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll(".user-item").forEach(item => { item.style.display = item.innerText.toLowerCase().includes(term) ? "flex" : "none"; }); });

const profileModal = document.getElementById("profileModal"); const closeProfileBtn = document.getElementById("closeProfileBtn"); const profileAvatar = document.getElementById("profileAvatar"); const profileName = document.getElementById("profileName"); const profileHandle = document.getElementById("profileHandle"); const profileBioDisplay = document.getElementById("profileBioDisplay"); const profileBioEdit = document.getElementById("profileBioEdit"); const profileJoinDate = document.getElementById("profileJoinDate"); const editProfileBtn = document.getElementById("editProfileBtn"); const saveProfileBtn = document.getElementById("saveProfileBtn"); const profileAvatarInput = document.getElementById("profileAvatarInput"); const editAvatarBtn = document.getElementById("editAvatarBtn");
window.openProfile = async (uid) => { 
    profileModal.style.display = "flex"; editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "none"; editAvatarBtn.style.display = "none"; profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block"; profileBioDisplay.innerText = "Loading..."; 
    const isCurrentUser = auth.currentUser && uid === auth.currentUser.uid; 
    const profileCallActions = document.getElementById("profileCallActions");
    if (isCurrentUser) { editProfileBtn.style.display = "block"; editAvatarBtn.style.display = "block"; }

    try { 
        const docSnap = await getDoc(doc(db, "users", uid)); 
        if (docSnap.exists()) { 
            const data = docSnap.data(); const dName = data.fullName || data.username; 
            profileName.innerText = dName; profileHandle.innerText = `@${data.username}`; profileAvatar.src = generateAvatar(data, dName); 
            const bioText = data.bio || "Hey there! I am using Chit-Chat."; 
            profileBioDisplay.innerText = bioText; profileBioEdit.value = bioText; profileJoinDate.innerText = `Joined: ${new Date(data.createdAt || Date.now()).toLocaleDateString()}`; 
        } 
    } catch (e) { console.error(e); } 
};
closeProfileBtn.addEventListener("click", () => profileModal.style.display = "none"); profileModal.addEventListener("click", (e) => { if(e.target === profileModal) profileModal.style.display = "none"; });
editProfileBtn.addEventListener("click", () => { profileBioDisplay.style.display = "none"; profileBioEdit.style.display = "block"; editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "block"; profileBioEdit.focus(); });
saveProfileBtn.addEventListener("click", async () => { const newBio = profileBioEdit.value.trim(); saveProfileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; try { await updateDoc(doc(db, "users", auth.currentUser.uid), { bio: newBio }); profileBioDisplay.innerText = newBio || "Hey there! I am using Chit-Chat."; profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block"; saveProfileBtn.style.display = "none"; editProfileBtn.style.display = "block"; showToast("Profile Updated", "Your bio has been saved."); } catch(e) {} finally { saveProfileBtn.innerHTML = 'Save Changes'; } });
editAvatarBtn.addEventListener("click", () => profileAvatarInput.click()); profileAvatarInput.addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file) return; editAvatarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:12px;"></i>'; editAvatarBtn.disabled = true; try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url }); profileAvatar.src = data.secure_url; document.getElementById("myAvatar").src = data.secure_url; showToast("Avatar Updated", "Your new profile picture looks great!", data.secure_url); } catch(err) {} finally { editAvatarBtn.innerHTML = '<i class="fa-solid fa-camera"></i>'; editAvatarBtn.disabled = false; profileAvatarInput.value = ""; } });
document.querySelector(".current-user").addEventListener("click", () => { if(auth.currentUser) openProfile(auth.currentUser.uid); }); document.querySelector(".chat-target-info").addEventListener("click", () => { if(targetUserUid && !isCurrentChatGroup) openProfile(targetUserUid); });

// GLOBAL EXPLORE LOUNGE
const exploreBtn = document.getElementById("exploreBtn");
const exploreArea = document.getElementById("exploreArea");
const closeExploreBtn = document.getElementById("closeExploreBtn");
const exploreTabs = document.querySelectorAll(".explore-tab");
const exploreSections = document.querySelectorAll(".explore-section");
let globalChatUnsubscribe = null;

exploreBtn.addEventListener("click", () => {
    history.pushState({ page: "explore" }, ""); 
    exploreArea.style.display = "flex";
    if(window.innerWidth <= 992) sidebar.classList.add("hidden");
    exploreTabs.forEach(t => t.classList.remove("active"));
    exploreSections.forEach(s => s.classList.remove("active"));
    document.querySelector('.explore-tab[data-target="exploreMemes"]').classList.add("active");
    document.getElementById("exploreMemes").classList.add("active");
    initMemesFeed();
});
closeExploreBtn.addEventListener("click", () => { exploreArea.style.display = "none"; if(globalChatUnsubscribe) { globalChatUnsubscribe(); globalChatUnsubscribe = null; } if(window.innerWidth <= 992) sidebar.classList.remove("hidden"); });
exploreTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        exploreTabs.forEach(t => t.classList.remove("active")); exploreSections.forEach(s => s.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.getAttribute("data-target"); document.getElementById(target).classList.add("active");
        if (target === "exploreLounge") initGlobalLounge();
        if (target === "exploreLeaderboard") initLeaderboard();
        if (target === "exploreMemes") initMemesFeed();
    });
});
const memesWrapper = document.getElementById("memesWrapper");
async function initMemesFeed() {
    if(memesWrapper.children.length > 1) return; 
    memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    loadMoreMemes();
}
async function loadMoreMemes() {
    const spinner = memesWrapper.querySelector('.fa-spinner')?.parentElement;
    try {
        const response = await fetch(`https://meme-api.com/gimme/wholesomememes/10`);
        if (!response.ok) throw new Error("Meme API Down");
        const data = await response.json();
        if(spinner) spinner.remove();
        data.memes.forEach(meme => {
            if(!meme.url || meme.url.includes('.mp4')) return; 
            const card = document.createElement('div'); card.className = "meme-card";
            card.innerHTML = `<h4>${meme.title}</h4><img src="${meme.url}" alt="Meme" loading="lazy"><div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">👍 ${meme.ups || '1k+'} | r/wholesomememes</div>`;
            memesWrapper.appendChild(card);
        });
    } catch(e) { 
        if(spinner) spinner.remove();
        memesWrapper.innerHTML += `<div style="color:#ef4444; text-align:center; padding: 20px;">Memes failed to load!</div>`; 
    }
}

// CHAT SETTINGS & WALLPAPERS
if (chatSettingsBtn) { chatSettingsBtn.addEventListener("click", () => document.getElementById("chatSettingsModal").style.display = "flex"); }
if (modalMsgTimerSelect) { modalMsgTimerSelect.addEventListener("change", async (e) => { if (currentChatId && !isCurrentChatGroup) { await updateDoc(doc(db, "chats", currentChatId), { messageTimer: e.target.value }); showToast("Timer Updated", "Disappearing message timer changed for this chat."); } }); }
if (changeWallpaperBtn && wallpaperInput) { changeWallpaperBtn.addEventListener("click", () => wallpaperInput.click()); wallpaperInput.addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file || !currentChatId || isCurrentChatGroup) return; const originalText = changeWallpaperBtn.innerHTML; changeWallpaperBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; changeWallpaperBtn.disabled = true; try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { wallpaperUrl: data.secure_url } } }, { merge: true }); document.getElementById("chatBox").style.backgroundImage = `linear-gradient(rgba(10,10,15,0.8), rgba(10,10,15,0.8)), url('${data.secure_url}')`; showToast("Wallpaper Updated", "Chat background changed successfully."); } catch (err) { alert("Failed to upload wallpaper: " + err.message); } finally { changeWallpaperBtn.innerHTML = originalText; changeWallpaperBtn.disabled = false; wallpaperInput.value = ""; } }); }
if (removeWallpaperBtn) { removeWallpaperBtn.addEventListener("click", async () => { if (!currentChatId || !targetUserUid || isCurrentChatGroup) return; try { await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { wallpaperUrl: null } } }, { merge: true }); document.getElementById("chatBox").style.backgroundImage = "none"; showToast("Wallpaper Removed", "Restored default background."); } catch (err) {} }); }

window.addEventListener("popstate", (e) => {
    const modals = ["profileModal", "chatSettingsModal", "groupSettingsModal", "msgOptionsModal", "gameSelectionModal", "infoModal"]; let modalClosed = false;
    modals.forEach(id => { const modal = document.getElementById(id); if (modal && modal.style.display === "flex") { modal.style.display = "none"; modalClosed = true; } });
    if (modalClosed) { history.pushState(null, ""); return; }
    if (document.getElementById("privateDoodleArea") && document.getElementById("privateDoodleArea").style.display === "flex") { document.getElementById("hideDoodleBtn").click(); history.pushState(null, ""); return; }
    if (document.getElementById("activeGameArea") && document.getElementById("activeGameArea").style.display === "flex") { document.getElementById("closeGameBtn").click(); history.pushState(null, ""); return; }
    if (document.getElementById("exploreArea") && document.getElementById("exploreArea").style.display === "flex") { document.getElementById("closeExploreBtn").click(); history.pushState(null, ""); return; }
    if (window.innerWidth <= 992 && document.getElementById("activeChatState") && document.getElementById("activeChatState").style.display === "flex") { document.getElementById("backToUsersBtn").click(); history.pushState(null, ""); return; }
});

// --- CALL DATA CLEANUP ---
window.addEventListener("beforeunload", () => {
    if (currentChatId && localStream) clearCallData(currentChatId);
});
document.body.addEventListener('click', function unlockAudio() {
    const audio = document.getElementById("ringtoneAudio");
    if(audio) { audio.volume = 0; audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.volume = 1; }).catch(e => console.log("Unlock failed", e)); }
    document.body.removeEventListener('click', unlockAudio);
}, { once: true });
window.stopAllCallAssets = () => {
    const ringtone = document.getElementById("ringtoneAudio"); if (ringtone) { ringtone.pause(); ringtone.currentTime = 0; }
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    const timerDisplay = document.getElementById("callTimer"); if (timerDisplay) timerDisplay.textContent = "00:00"; callSeconds = 0;
    if (window.audioCtx && window.audioCtx.state !== 'closed') { window.audioCtx.close(); window.audioCtx = null; window.gainNode = null; }
};
