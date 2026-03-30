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
let activeMsgContext = 'chat'; // TRACKS IF WE ARE IN PERSONAL CHAT OR GLOBAL LOUNGE
let pDoodleUnsubscribe = null; window.msgTimeouts = [];

// NEW: Global variables to track the OTP process
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
  console.log("Button clicked! Mode:", isSignupMode ? "Sign Up" : "Login");
  
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
          // 1. Generate a random 6-digit OTP
          generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
          
          // 2. Store the user's data temporarily
          pendingSignupData = { realEmail, password, username, fullName };

          console.log("Sending OTP via EmailJS...");
          
          // 3. Send via EmailJS with YOUR actual IDs
          await emailjs.send("service_z5e6d5x", "template_fks6dsp", {
              to_name: fullName,
              to_email: realEmail,
              otp_code: generatedOTP
          });

          // 4. Show the OTP Modal
          document.getElementById("otpModal").style.display = "flex";
          authActionBtn.innerText = "Create Account"; // Reset button text
          
      } else { 
          console.log("Attempting to log in...");
          const loginEmail = username.includes('@') ? username : `${username}@chitchat.app`;
          await signInWithEmailAndPassword(auth, loginEmail, password); 
      } 
  } catch (error) { 
      console.error("Auth/Email Error:", error);
      alert(error.message || "Failed to process request."); 
      authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat"; 
  }
});

// OTP Verification Listener
document.getElementById("verifyOtpBtn").addEventListener("click", async () => {
    const enteredOtp = document.getElementById("otpInput").value.trim();
    const verifyBtn = document.getElementById("verifyOtpBtn");

    if (enteredOtp !== generatedOTP) {
        alert("Invalid OTP! Please check your email and try again.");
        return;
    }

    // OTP is correct, proceed to create the Firebase user
    verifyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
    verifyBtn.disabled = true;

  try {
        // Use the username system so Login continues to work perfectly
        const accountEmail = `${pendingSignupData.username}@chitchat.app`;
        const cred = await createUserWithEmailAndPassword(auth, accountEmail, pendingSignupData.password); 
        
        await setDoc(doc(db, "users", cred.user.uid), { 
            username: pendingSignupData.username, 
            fullName: pendingSignupData.fullName,
            realEmail: pendingSignupData.realEmail, // Saving the real email just in case you need it later
            createdAt: Date.now(), 
            isOnline: false, 
            lastSeen: Date.now() 
        });
        
        // Hide modal and clear data
        document.getElementById("otpModal").style.display = "none";
        generatedOTP = null;
        pendingSignupData = null;
        document.getElementById("otpInput").value = "";
        verifyBtn.innerText = "Verify & Create Account";
        verifyBtn.disabled = false;

        alert("Account verified and created! You can now log in.");
        
        // Ensure user is signed out so they have to log in manually
        await signOut(auth);
        document.getElementById("tabLogin").click(); 

    } catch (error) {
        console.error("Firebase Creation Error:", error);
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
if (backToUsersBtn) { backToUsersBtn.addEventListener("click", () => { if (window.innerWidth <= 992) { sidebar.classList.remove("hidden"); activeChatState.style.display = "none"; emptyChatState.style.display = "flex"; } }); }
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
                document.getElementById("privateDoodleArea").style.display = "none";
                if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
            }

            if (data.status === 'pending') {
                document.getElementById("chatDoodleBtn").style.display = "none"; 
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
                document.getElementById("launchGameMenuBtn").style.display = "block"; 
                document.getElementById("chatSettingsBtn").style.display = "block"; 
                if(overlay) overlay.style.display = "none"; 
                if(inputWrapper) inputWrapper.style.display = "flex"; 
            }
        } else {
            currentChatStatus = 'none'; 
            document.getElementById("chatDoodleBtn").style.display = "none";
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
  document.getElementById("launchGameMenuBtn").style.display = "none"; 
  
  document.getElementById("chatBox").innerHTML = ""; 
  if(replyingToMsg) document.getElementById("cancelReplyBtn").click();
  document.getElementById("privateDoodleArea").style.display = "none";

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

loadMessages(); listenToTyping(); listenToChatStatus(targetName); window.listenForCalls();
}
function openGroupChat(groupId, groupName, memberCount) {
  isCurrentChatGroup = true; currentChatId = groupId; targetUserUid = null;
  document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none"; document.getElementById("chatDoodleBtn").style.display = "none"; document.getElementById("chatBox").innerHTML = ""; document.getElementById("chatBox").style.backgroundImage = "none"; if(replyingToMsg) document.getElementById("cancelReplyBtn").click();
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
    snapshot.forEach(docSnap => {
      const msg = docSnap.data(); const msgId = docSnap.id; const isMe = msg.sender === auth.currentUser.uid;
      if (isMe) lastMyMsg = msg; if (msg.isExpired) return;
// Check karein ki kya doodle area screen par dikh raha hai
// Check karein ki kya doodle area ya game area screen par dikh raha hai
// Check karein ki kya doodle, game, ya chat screen par literally visible hai
const isDoodleOpen = pDoodleArea && pDoodleArea.style.display === "flex";
const activeGameArea = document.getElementById("activeGameArea");
const isGameOpen = activeGameArea && activeGameArea.style.display === "flex";
const isChatCurrentlyVisible = activeChatState.style.display === "flex" && document.visibilityState === 'visible';

// Sirf tabhi seen mark karein jab user actually is chat ko screen par dekh raha ho
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
        contentHtml = `<div class="msg-bubble" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')">${groupSenderHtml}${replyHtml}${imgHtml}<span style="word-wrap: break-word; white-space: pre-wrap; display: block; max-width: 100%;">${decryptedText}</span> ${msg.isEdited ? '<span style="font-size:10px; opacity:0.5; display:block; margin-top:5px;">(edited)</span>' : ''}</div>`;
      }
      
      let avatarSrc = isCurrentChatGroup && !isMe ? generateAvatar(allUsers.find(u=>u.id===msg.sender), msg.senderName) : document.getElementById('chatTargetAvatar').src;
      div.innerHTML = `${!isMe ? `<img src="${avatarSrc}" class="msg-avatar">` : ''}<div style="display:flex; flex-direction:column; max-width: 100%;">${contentHtml}<div class="msg-time">${timeStr}</div></div>${isMe ? `<img src="${document.getElementById('myAvatar').src}" class="msg-avatar">` : ''}`;
      fragment.appendChild(div);
    });

    if (lastMyMsg && lastMyMsg.seenAt) { 
        const seenDiv = document.createElement("div"); 
        seenDiv.style.textAlign = "right"; 
        seenDiv.style.fontSize = "11px"; 
        seenDiv.style.color = "var(--text-muted)"; 
        seenDiv.style.marginTop = "-15px"; 
        seenDiv.style.paddingRight = "45px"; 
        seenDiv.innerHTML = `<i class="fa-solid fa-check-double" style="color: #3b82f6;"></i> Seen`; 
        fragment.appendChild(seenDiv); // <--- YAHAN CHANGE KIYA
    }
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
        await setDoc(doc(db, "chats", currentChatId), {
            status: 'pending',
            initiator: auth.currentUser.uid,
            createdAt: Date.now()
        });
        
        await setDoc(doc(db, "users", targetUserUid), {
            chatMeta: { 
                [auth.currentUser.uid]: { 
                    time: Date.now(), 
                    text: "👋 Connection Request", 
                    unread: true 
                } 
            }
        }, { merge: true });
        
        showToast("Request Sent", "Waiting for approval.");
    } catch (error) {
        showToast("Error", "Failed to send request.");
        console.error(error);
    }
};

window.acceptChatRequest = async () => {
    if (!currentChatId) return;
    try {
        await updateDoc(doc(db, "chats", currentChatId), {
            status: 'accepted'
        });
        showToast("Connected", "You can now chat!");
    } catch (error) {
        showToast("Error", "Failed to accept request.");
    }
};

window.declineChatRequest = async () => {
    if (!currentChatId) return;
    try {
        await deleteDoc(doc(db, "chats", currentChatId));
        showToast("Declined", "Request removed.");
        if (window.innerWidth <= 992) {
            document.getElementById("backToUsersBtn").click();
        }
    } catch (error) {
        showToast("Error", "Failed to decline request.");
    }
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
  if (timerValue > 0) payload.timerDuration = timerValue; 
  
  if (replyingToMsg && replyingToMsg.context === 'chat') { payload.replyToId = replyingToMsg.id; payload.replyToText = encryptMessage(replyingToMsg.text, currentChatId); payload.replyToName = replyingToMsg.name; document.getElementById("cancelReplyBtn").click(); }
  try { await addDoc(collection(db, "chats", currentChatId, "messages"), payload); } catch (e) { showToast("Error", "Message failed to send."); }
}
sendBtn.addEventListener("click", sendMessage); msgInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
searchInput.addEventListener("input", (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll(".user-item").forEach(item => { item.style.display = item.innerText.toLowerCase().includes(term) ? "flex" : "none"; }); });

const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none"; document.body.appendChild(fileInput);
document.querySelector('.fa-paperclip').parentElement.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file || !currentChatId) return; const originalHtml = sendBtn.innerHTML; sendBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; sendBtn.disabled = true;
  try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000; const optimizedUrl = data.secure_url.replace('/upload/', '/upload/q_auto,f_auto,w_600/');
const payload = { text: "", imageUrl: optimizedUrl, imagePublicId: data.public_id, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false }; if (timerValue > 0) payload.timerDuration = timerValue; await addDoc(collection(db, "chats", currentChatId, "messages"), payload); } catch (err) { alert("Upload failed: " + err.message); } finally { sendBtn.innerHTML = originalHtml; sendBtn.disabled = false; fileInput.value = ""; }
});

const profileModal = document.getElementById("profileModal"); const closeProfileBtn = document.getElementById("closeProfileBtn"); const profileAvatar = document.getElementById("profileAvatar"); const profileName = document.getElementById("profileName"); const profileHandle = document.getElementById("profileHandle"); const profileBioDisplay = document.getElementById("profileBioDisplay"); const profileBioEdit = document.getElementById("profileBioEdit"); const profileJoinDate = document.getElementById("profileJoinDate"); const editProfileBtn = document.getElementById("editProfileBtn"); const saveProfileBtn = document.getElementById("saveProfileBtn"); const profileAvatarInput = document.getElementById("profileAvatarInput"); const editAvatarBtn = document.getElementById("editAvatarBtn");
window.openProfile = async (uid) => { 
    profileModal.style.display = "flex"; 
    editProfileBtn.style.display = "none"; 
    saveProfileBtn.style.display = "none"; 
    editAvatarBtn.style.display = "none"; 
    profileBioEdit.style.display = "none"; 
    profileBioDisplay.style.display = "block"; 
    profileBioDisplay.innerText = "Loading..."; 
    
    const isCurrentUser = auth.currentUser && uid === auth.currentUser.uid; 
    
    // NEW: Show/Hide Call Buttons based on whose profile it is
    const profileCallActions = document.getElementById("profileCallActions");
    if (isCurrentUser) { 
        editProfileBtn.style.display = "block"; 
        editAvatarBtn.style.display = "block"; 
        if (profileCallActions) profileCallActions.style.display = "none";
    } else {
        if (profileCallActions) profileCallActions.style.display = "flex";
    }

    try { 
        const docSnap = await getDoc(doc(db, "users", uid)); 
        if (docSnap.exists()) { 
            const data = docSnap.data(); 
            const dName = data.fullName || data.username; 
            profileName.innerText = dName; 
            profileHandle.innerText = `@${data.username}`; 
            profileAvatar.src = generateAvatar(data, dName); 
            const bioText = data.bio || "Hey there! I am using Chit-Chat."; 
            profileBioDisplay.innerText = bioText; 
            profileBioEdit.value = bioText; 
            profileJoinDate.innerText = `Joined: ${new Date(data.createdAt || Date.now()).toLocaleDateString()}`; 
        } 
    } catch (e) {
        console.error(e);
    } 
};
closeProfileBtn.addEventListener("click", () => profileModal.style.display = "none"); profileModal.addEventListener("click", (e) => { if(e.target === profileModal) profileModal.style.display = "none"; });
editProfileBtn.addEventListener("click", () => { profileBioDisplay.style.display = "none"; profileBioEdit.style.display = "block"; editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "block"; profileBioEdit.focus(); });
saveProfileBtn.addEventListener("click", async () => { const newBio = profileBioEdit.value.trim(); saveProfileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; try { await updateDoc(doc(db, "users", auth.currentUser.uid), { bio: newBio }); profileBioDisplay.innerText = newBio || "Hey there! I am using Chit-Chat."; profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block"; saveProfileBtn.style.display = "none"; editProfileBtn.style.display = "block"; showToast("Profile Updated", "Your bio has been saved."); } catch(e) {} finally { saveProfileBtn.innerHTML = 'Save Changes'; } });
editAvatarBtn.addEventListener("click", () => profileAvatarInput.click()); profileAvatarInput.addEventListener("change", async (e) => { const file = e.target.files[0]; if (!file) return; editAvatarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:12px;"></i>'; editAvatarBtn.disabled = true; try { const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url }); profileAvatar.src = data.secure_url; document.getElementById("myAvatar").src = data.secure_url; showToast("Avatar Updated", "Your new profile picture looks great!", data.secure_url); } catch(err) {} finally { editAvatarBtn.innerHTML = '<i class="fa-solid fa-camera"></i>'; editAvatarBtn.disabled = false; profileAvatarInput.value = ""; } });
document.querySelector(".current-user").addEventListener("click", () => { if(auth.currentUser) openProfile(auth.currentUser.uid); }); document.querySelector(".chat-target-info").addEventListener("click", () => { if(targetUserUid && !isCurrentChatGroup) openProfile(targetUserUid); });

document.querySelector(".chat-header").addEventListener("click", (e) => {
    if (e.target.closest('.mobile-back-btn') || e.target.closest('#launchGameMenuBtn') || e.target.closest('#chatSettingsBtn') || e.target.closest('#chatDoodleBtn')) return;
    if (isCurrentChatGroup && currentChatId) {
        const group = allGroups.find(g => g.id === currentChatId); if(group) {
            document.getElementById("groupSettingsName").innerText = group.name; document.getElementById("groupMemberCount").innerText = group.members.length; document.getElementById("groupSettingsAvatar").src = group.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=8b5cf6&color=fff`;
            const membersListDiv = document.getElementById("groupMembersList"); membersListDiv.innerHTML = "<h4 style='font-size:12px; color:var(--text-muted); margin-bottom:8px;'>Group Members:</h4>"; group.members.forEach(memberId => { const userObj = allUsers.find(u => u.id === memberId); const name = userObj ? (userObj.fullName || userObj.username) : "Unknown User"; const isMe = memberId === auth.currentUser.uid ? " (You)" : ""; membersListDiv.innerHTML += `<div style="font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">${name}${isMe}</div>`; });
            const deleteBtn = document.getElementById("deleteGroupBtn");
            if (group.createdBy === auth.currentUser.uid) { deleteBtn.style.display = "flex"; deleteBtn.onclick = async () => { if (confirm(`Are you sure you want to delete ${group.name}?`)) { deleteBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Deleting..."; const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages"))); const batch = writeBatch(db); msgsSnap.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); await deleteDoc(doc(db, "groups", currentChatId)); document.getElementById("groupSettingsModal").style.display = "none"; document.getElementById("backToUsersBtn").click(); showToast("Group Deleted", "Group permanently wiped."); } }; } else { deleteBtn.style.display = "none"; }
            document.getElementById("groupSettingsModal").style.display = "flex";
        }
    }
});
window.triggerAddGroupMember = async () => { const group = allGroups.find(g => g.id === currentChatId); if(!group) return; let promptText = "Type the number of the user to add:\n\n"; const selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid && !group.members.includes(u.id)); if(selectableUsers.length === 0) { alert("All users are already in the group!"); return; } selectableUsers.forEach((u, index) => { promptText += `${index + 1}. ${u.fullName || u.username}\n`; }); const selection = prompt(promptText); if(selection) { const idx = parseInt(selection.trim()) - 1; if(selectableUsers[idx]) { await updateDoc(doc(db, "groups", currentChatId), { members: arrayUnion(selectableUsers[idx].id) }); showToast("Member Added", `${selectableUsers[idx].fullName || selectableUsers[idx].username} was added.`); document.getElementById("groupSettingsModal").style.display = "none"; } } };
window.triggerGroupAvatarUpload = () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = async (e) => { const file = e.target.files[0]; if(!file) return; try { showToast("Uploading...", "Updating group icon"); const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "groups", currentChatId), { avatarUrl: data.secure_url }); document.getElementById("groupSettingsAvatar").src = data.secure_url; document.getElementById("chatTargetAvatar").src = data.secure_url; showToast("Success", "Group icon updated!"); } catch(err) { alert("Failed to update group image."); } }; input.click(); };

launchGameMenuBtn.addEventListener("click", () => { gameSelectionModal.style.display = "flex"; }); 
closeGameSelectBtn.addEventListener("click", () => { gameSelectionModal.style.display = "none"; });

document.querySelectorAll(".game-select-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const gameType = btn.getAttribute("data-game");
        gameSelectionModal.style.display = "none";

        const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000;

        if (gameType === 'doodle') {
            if (isCurrentChatGroup) { alert("Doodle is for 1v1 only!"); return; }
            await updateDoc(doc(db, "chats", currentChatId), { doodleReq: auth.currentUser.uid });
            
            const payload = { sender: auth.currentUser.uid, time: Date.now(), isDoodleRequest: true, isDeleted: false };
            if (timerValue > 0) payload.timerDuration = timerValue; 
            
            await addDoc(collection(db, "chats", currentChatId, "messages"), payload);
            await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎨 DOODLE REQUEST", unread: true } } }, { merge: true });
            showToast("Request Sent", "Doodle request sent to friend.");
            return;
        }

        const gameId = `game_${Date.now()}_${auth.currentUser.uid}`;
        let initialData = { type: gameType, status: "waiting", player1: auth.currentUser.uid, player2: targetUserUid, createdAt: Date.now(), turn: auth.currentUser.uid, winner: null, p1Score: null, p2Score: null, board: ["","","","","","","","",""], p1Choice: null, p2Choice: null };
        if(gameType === 'ludo') { initialData.ludoTokens = { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }; initialData.diceValue = null; }
        await setDoc(doc(db, "games", gameId), initialData);
        
        const gPayload = { sender: auth.currentUser.uid, time: Date.now(), isGameChallenge: true, gameType: gameType, gameId: gameId, isDeleted: false };
        if (timerValue > 0) gPayload.timerDuration = timerValue;
        
        await addDoc(collection(db, "chats", currentChatId, "messages"), gPayload);
        await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎮 GAME CHALLENGE", unread: true } } }, { merge: true });
        joinGameRoom(gameId, gameType);
    });
});

window.acceptGameChallenge = async (gameId, gameType) => { await updateDoc(doc(db, "games", gameId), { status: "playing" }); joinGameRoom(gameId, gameType); };
closeGameBtn.addEventListener("click", () => { 
    if(currentAnimationId) cancelAnimationFrame(currentAnimationId); 
    if (singlePlayerMode) { 
        singlePlayerMode = false; spTttActive = false; 
        if (window.innerWidth <= 992) sidebar.classList.remove("hidden"); 
    } else { 
        if(gameUnsubscribe) gameUnsubscribe(); 
        if(currentGameId) { updateDoc(doc(db, "games", currentGameId), { status: "abandoned" }); } 
    } 
    activeGameArea.style.display = "none"; 
    currentGameId = null; 
    isPlayingActionGame = false; 
    
    // Game band hote hi messages ko "Seen" mark karne ke liye trigger karein
    if (currentChatId) {
        loadMessages();
    }
});
function joinGameRoom(gameId, gameType) {
    currentGameId = gameId; isPlayingActionGame = false; singlePlayerMode = false; activeGameArea.style.display = "flex";
    let gTitle = "Game"; if (gameType === 'tictactoe') gTitle = "Tic Tac Toe"; if (gameType === 'rps') gTitle = "Rock Paper Scissors"; if (gameType === 'jetfighter') gTitle = "Jet Fighter"; if (gameType === 'carracing') gTitle = "Car Racing"; if (gameType === 'ludo') gTitle = "Ludo Arena"; document.getElementById("activeGameTitle").innerText = gTitle;
    if(gameUnsubscribe) gameUnsubscribe();
    gameUnsubscribe = onSnapshot(doc(db, "games", gameId), (docSnap) => {
        if(!docSnap.exists()) return; const data = docSnap.data();
        if(data.status === "abandoned") { gameUIContainer.innerHTML = `<h3 style="color:var(--accent);">Opponent left the game.</h3>`; isPlayingActionGame = false; return; }
        if(data.status === "waiting") { gameUIContainer.innerHTML = `<h3>Waiting for opponent... <i class="fa-solid fa-spinner fa-spin"></i></h3>`; isPlayingActionGame = false; return; }
        if (data.type === 'tictactoe') renderTicTacToe(data, gameId); if (data.type === 'rps') renderRPS(data, gameId); if (data.type === 'jetfighter') renderActionGame(data, gameId, 'jetfighter'); if (data.type === 'carracing') renderActionGame(data, gameId, 'carracing'); if (data.type === 'ludo') renderLudo(data, gameId);
    });
}

const ludoPath = [ {x:30,y:130}, {x:50,y:130}, {x:70,y:130}, {x:90,y:130}, {x:110,y:130}, {x:130,y:110}, {x:130,y:90}, {x:130,y:70}, {x:130,y:50}, {x:130,y:30}, {x:130,y:10}, {x:150,y:10}, {x:170,y:10}, {x:170,y:30}, {x:170,y:50}, {x:170,y:70}, {x:170,y:90}, {x:170,y:110}, {x:190,y:130}, {x:210,y:130}, {x:230,y:130}, {x:250,y:130}, {x:270,y:130}, {x:290,y:130}, {x:290,y:150}, {x:290,y:170}, {x:270,y:170}, {x:250,y:170}, {x:230,y:170}, {x:210,y:170}, {x:190,y:170}, {x:170,y:190}, {x:170,y:210}, {x:170,y:230}, {x:170,y:250}, {x:170,y:270}, {x:170,y:290}, {x:150,y:290}, {x:130,y:290}, {x:130,y:270}, {x:130,y:250}, {x:130,y:230}, {x:130,y:210}, {x:130,y:190}, {x:110,y:170}, {x:90,y:170}, {x:70,y:170}, {x:50,y:170}, {x:30,y:170}, {x:10,y:170}, {x:10,y:150}, {x:10,y:130}, {x:30,y:150}, {x:50,y:150}, {x:70,y:150}, {x:90,y:150}, {x:110,y:150}, {x:270,y:150}, {x:250,y:150}, {x:230,y:150}, {x:210,y:150}, {x:190,y:150} ];
const ludoBases = { p1: [{x:40,y:40}, {x:80,y:40}, {x:40,y:80}, {x:80,y:80}], p2: [{x:220,y:220}, {x:260,y:220}, {x:220,y:260}, {x:260,y:260}] };

function renderLudo(data, gameId) {
    const isPlayer1 = data.player1 === auth.currentUser.uid; const isMyTurn = data.turn === auth.currentUser.uid; const myRole = isPlayer1 ? 'p1' : 'p2'; const diceIcons = ['🎲', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']; let currentDice = data.diceValue ? diceIcons[data.diceValue] : '🎲';
    let statusText = data.winner ? (data.winner === auth.currentUser.uid ? "🎉 You Won!" : "😞 You Lost!") : (isMyTurn ? "Your Turn" : "Opponent's Turn"); let colorTheme = isMyTurn && !data.winner ? (isPlayer1 ? '#ef4444' : '#3b82f6') : 'white';
    let p1User = allUsers.find(u => u.id === data.player1) || { fullName: 'Player 1' }; let p2User = allUsers.find(u => u.id === data.player2) || { fullName: 'Player 2' }; if (data.player1 === auth.currentUser.uid) p1User.fullName = "You"; if (data.player2 === auth.currentUser.uid) p2User.fullName = "You";
    let html = `<div class="ludo-header-info"><div class="ludo-player-badge red-badge ${data.turn === data.player1 && !data.winner ? 'active' : ''}">${p1User.fullName || p1User.username}</div><div class="ludo-vs">VS</div><div class="ludo-player-badge blue-badge ${data.turn === data.player2 && !data.winner ? 'active' : ''}">${p2User.fullName || p2User.username}</div></div><div class="game-turn-indicator" style="color: ${colorTheme}; font-weight:bold; margin-top: 10px;">${statusText}</div><div class="ludo-container"><div class="ludo-board-wrapper" id="ludoBoard"></div><div class="ludo-controls"><button id="ludoDiceBtn" class="dice-btn ${data.diceValue ? '' : 'pulse'}" ${!isMyTurn || data.winner ? 'disabled' : ''} onclick="rollLudoDice('${gameId}', '${myRole}')">${currentDice}</button></div>${data.winner ? `<button class="primary-btn glow-btn" style="max-width:200px;" onclick="resetLudo('${gameId}')">Play Again</button>` : ''}</div>`;
    gameUIContainer.innerHTML = html;
    const board = document.getElementById("ludoBoard"); board.innerHTML += `<div class="ludo-base red-base"><div class="base-inner"></div></div><div class="ludo-base blue-base"><div class="base-inner"></div></div>`;
    ludoPath.forEach((pos, i) => { let extraClass = ''; if (i >= 52 && i <= 56) extraClass = 'path-red'; if (i >= 57 && i <= 61) extraClass = 'path-blue'; const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; if (safeZones.includes(i)) extraClass += ' safe-zone'; if (i === 0) extraClass += ' start-red'; if (i === 26) extraClass += ' start-blue'; board.innerHTML += `<div class="ludo-cell ${extraClass}" style="left:${pos.x - 10}px; top:${pos.y - 10}px;">${safeZones.includes(i) ? '<i class="fa-solid fa-star" style="font-size:8px; opacity:0.5; color:white;"></i>' : ''}</div>`; });
    ['p1', 'p2'].forEach(player => { data.ludoTokens[player].forEach((pos, index) => { let coords = pos === -1 ? ludoBases[player][index] : ludoPath[pos]; if ((player === 'p1' && pos === 57) || (player === 'p2' && pos === 62)) return; let token = document.createElement("div"); token.className = `ludo-token token-${player === 'p1' ? 'red' : 'blue'}`; if (isMyTurn && player === myRole && data.diceValue) { token.classList.add('token-playable'); } token.style.left = `${coords.x}px`; token.style.top = `${coords.y}px`; if (isMyTurn && player === myRole && data.diceValue) { token.onclick = () => moveLudoToken(gameId, data, index, myRole); } board.appendChild(token); }); });
}
window.rollLudoDice = async (gameId, myRole) => { const diceBtn = document.getElementById("ludoDiceBtn"); diceBtn.classList.add("dice-rolling"); diceBtn.classList.remove("pulse"); diceBtn.disabled = true; setTimeout(async () => { const roll = Math.floor(Math.random() * 6) + 1; await updateDoc(doc(db, "games", gameId), { diceValue: roll }); const docSnap = await getDoc(doc(db, "games", gameId)); const data = docSnap.data(); let canMove = false; data.ludoTokens[myRole].forEach(pos => { if (pos === -1 && roll === 6) canMove = true; if (pos !== -1) { if (myRole === 'p1' && pos + roll <= 57) canMove = true; if (myRole === 'p2') { let absoluteProgress = pos >= 26 ? (pos - 26) : (pos + 26); if (absoluteProgress + roll <= 57) canMove = true; } } }); if (!canMove) { showToast("No Moves!", "Skipping turn..."); const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; await updateDoc(doc(db, "games", gameId), { turn: nextTurn, diceValue: null }); } }, 500); };
window.moveLudoToken = async (gameId, data, tokenIndex, role) => { let tokens = { ...data.ludoTokens }; let roll = data.diceValue; let currPos = tokens[role][tokenIndex]; let newPos = currPos; if (currPos === -1) { if (roll !== 6) return; newPos = role === 'p1' ? 0 : 26; } else { if (role === 'p1') { newPos = currPos + roll; if (newPos > 51 && currPos <= 51) newPos = 51 + (newPos - 51); if (newPos > 57) return; } else { newPos = currPos + roll; if (currPos <= 24 && newPos >= 25) { newPos = 56 + (newPos - 24); } else if (newPos > 51 && currPos > 24 && currPos <= 51) { newPos = newPos - 52; } if (newPos > 62) return; } } tokens[role][tokenIndex] = newPos; const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; let hasKilled = false; let oppRole = role === 'p1' ? 'p2' : 'p1'; if (!safeZones.includes(newPos) && newPos <= 51) { tokens[oppRole].forEach((oppPos, idx) => { if (oppPos === newPos) { tokens[oppRole][idx] = -1; hasKilled = true; } }); } let hasWon = false; if (role === 'p1' && tokens.p1.every(p => p === 57)) hasWon = true; if (role === 'p2' && tokens.p2.every(p => p === 62)) hasWon = true; let nextTurn = data.turn; let nextDice = null; if (roll !== 6 && !hasKilled && !hasWon) { nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; } await updateDoc(doc(db, "games", gameId), { ludoTokens: tokens, turn: nextTurn, diceValue: nextDice, winner: hasWon ? auth.currentUser.uid : null }); };
window.resetLudo = async (gameId) => { const docSnap = await getDoc(doc(db, "games", gameId)); await updateDoc(doc(db, "games", gameId), { ludoTokens: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }, winner: null, turn: docSnap.data().player1, diceValue: null }); };

window.startSinglePlayer = (gameType) => { 
    singlePlayerMode = true; currentGameId = null; 
    if (window.innerWidth <= 992) sidebar.classList.add("hidden"); 
    activeGameArea.style.display = "flex"; 
    
    if (gameType === 'tictactoe') { spTttReset(); } 
    else if (gameType === 'rps') { renderSinglePlayerRPS(); } 
    else if (gameType === 'jetfighter' || gameType === 'carracing' || gameType === 'flappybird') { renderSinglePlayerAction(gameType); } 
};

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
window.renderSinglePlayerAction = async (gameType) => { 
    spGameType = gameType; 
    let title = "Jet Fighter (Solo)";
    if(gameType === 'carracing') title = "Car Racing (Solo)";
    if(gameType === 'flappybird') title = "Flappy Bird (Solo)";
    document.getElementById("activeGameTitle").innerText = title; 
    
    gameUIContainer.innerHTML = `<h3>Loading High Score... <i class="fa-solid fa-spinner fa-spin"></i></h3>`; 
    try { 
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid)); 
        const data = userDoc.data(); 
        spHighScore = (data && data.highScores && data.highScores[gameType]) ? data.highScores[gameType] : 0; 
    } catch(e) { spHighScore = 0; } 
    showSpActionMenu(); 
};

window.showSpActionMenu = () => { 
    isPlayingActionGame = false; 
    gameUIContainer.innerHTML = `<div class="game-turn-indicator" style="margin-bottom: 5px;">Beat your High Score!</div><div style="font-size: 16px; color: var(--accent); margin-bottom: 15px; font-weight:bold;">High Score: ${spHighScore}</div><div class="action-game-container"><div style="position: relative; width: 100%; max-width: 300px;"><canvas id="actionCanvas" width="300" height="400" class="action-canvas" style="margin: 0;"></canvas><div id="startOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.6); border-radius:12px; z-index:10;"><button class="primary-btn glow-btn" id="btnStartGame" style="width:auto; padding:15px 40px; font-size: 16px;">Play Now</button></div></div><div class="game-btn-row" id="gameControls" style="display:none;"><button class="game-control-btn" id="btnLeft">⬅️</button><button class="game-control-btn" id="btnRight">➡️</button></div></div>`; 
    const canvas = document.getElementById('actionCanvas'); 
    if (canvas) { 
        const ctx = canvas.getContext('2d'); 
        if (spGameType === 'carracing') { 
            ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50); 
        } else if (spGameType === 'flappybird') {
            ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(150, 200, 15, 0, Math.PI * 2); ctx.fill();
        } else { 
            ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill(); 
        } 
    } 
    document.getElementById('btnStartGame').addEventListener('click', () => { 
        isPlayingActionGame = true; 
        document.getElementById('startOverlay').style.display = 'none'; 
        document.getElementById('gameControls').style.display = 'flex'; 
        
        if (spGameType === 'carracing') startCarRacing(null, true); 
        else if (spGameType === 'flappybird') startFlappyBird(null, true);
        else startJetFighter(null, true); 
    }); 
};

window.handleSpActionGameOver = async (score) => { let isNewHighScore = false; if (score > spHighScore) { spHighScore = score; isNewHighScore = true; try { await setDoc(doc(db, "users", auth.currentUser.uid), { highScores: { [spGameType]: score } }, { merge: true }); } catch(e) {} } gameUIContainer.innerHTML = `<div class="game-turn-indicator" style="color:${isNewHighScore ? 'var(--primary)' : 'white'}">${isNewHighScore ? '🏆 NEW HIGH SCORE!' : 'GAME OVER'}</div><div style="font-size: 24px; text-align: center; margin: 20px 0;">Your Score: <b style="color:var(--primary)">${score}</b><br>High Score: <b style="color:var(--accent)">${spHighScore}</b></div><button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="showSpActionMenu()">Play Again</button>`; };

function renderActionGame(data, gameId, gameType) { const isPlayer1 = data.player1 === auth.currentUser.uid; const myScore = isPlayer1 ? data.p1Score : data.p2Score; const oppScore = isPlayer1 ? data.p2Score : data.p1Score; if (myScore !== undefined && myScore !== null && oppScore !== undefined && oppScore !== null) { isPlayingActionGame = false; let statusText = "It's a Tie!"; if (myScore > oppScore) statusText = "🎉 You Won!"; else if (myScore < oppScore) statusText = "😞 You Lost!"; gameUIContainer.innerHTML = `<div class="game-turn-indicator">${statusText}</div><div style="font-size: 24px; text-align: center; margin: 20px 0;">Your Score: <b style="color:var(--primary)">${myScore}</b><br>Opponent's Score: <b style="color:var(--accent)">${oppScore}</b></div><button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetActionGame('${gameId}')">Play Again</button>`; return; } if (myScore !== undefined && myScore !== null) { isPlayingActionGame = false; gameUIContainer.innerHTML = `<div class="game-turn-indicator">Waiting for opponent to finish...</div><div style="font-size: 20px; text-align: center; margin: 20px 0;">Your Score: <b style="color:var(--primary)">${myScore}</b></div>`; return; } if (isPlayingActionGame) return; gameUIContainer.innerHTML = `<div class="game-turn-indicator" style="margin-bottom: 5px;">High Score Challenge!</div><div class="action-game-container"><div style="position: relative; width: 100%; max-width: 300px;"><canvas id="actionCanvas" width="300" height="400" class="action-canvas" style="margin: 0;"></canvas><div id="startOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.6); border-radius:12px; z-index:10; flex-direction:column; gap:10px;"><span style="color:white; font-size:14px;">Opponent is ready!</span><button class="primary-btn glow-btn" id="btnStartGame" style="width:auto; padding:15px 40px; font-size: 16px;">Play Now</button></div></div><div class="game-btn-row" id="gameControls" style="display:none;"><button class="game-control-btn" id="btnLeft">⬅️</button><button class="game-control-btn" id="btnRight">➡️</button></div></div>`; const canvas = document.getElementById('actionCanvas'); if (canvas) { const ctx = canvas.getContext('2d'); if (gameType === 'carracing') { ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50); } else { ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill(); } } document.getElementById('btnStartGame').addEventListener('click', () => { isPlayingActionGame = true; document.getElementById('startOverlay').style.display = 'none'; document.getElementById('gameControls').style.display = 'flex'; if (gameType === 'carracing') startCarRacing(gameId, isPlayer1); else startJetFighter(gameId, isPlayer1); }); }
window.resetActionGame = async (gameId) => { await updateDoc(doc(db, "games", gameId), { p1Score: null, p2Score: null }); };

function startFlappyBird(gameId, isPlayer1) { 
    const canvas = document.getElementById('actionCanvas'); 
    if (!canvas) return; 
    const ctx = canvas.getContext('2d'); 
    
    document.getElementById('gameControls').style.display = 'none';

    let birdY = 200; 
    let velocity = 0; 
    const gravity = 0.5; 
    const jumpStrength = -7; 
    const birdRadius = 12; 
    
    let pipes = []; 
    let frameCount = 0; 
    let score = 0; 
    let isGameOver = false; 

    const jump = (e) => { 
        if(!isPlayingActionGame) return; 
        if(e && e.type === 'keydown' && e.key !== ' ' && e.key !== 'ArrowUp') return; 
        if(e) e.preventDefault(); 
        velocity = jumpStrength; 
    }; 

    window.addEventListener('keydown', jump); 
    canvas.addEventListener('mousedown', jump); 
    canvas.addEventListener('touchstart', jump, {passive: false});

    function drawBird(x, y) { 
        ctx.fillStyle = '#f59e0b'; 
        ctx.beginPath(); ctx.arc(x, y, birdRadius, 0, Math.PI * 2); ctx.fill(); 
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(x + 5, y - 4, 4, 0, Math.PI*2); ctx.fill(); 
        ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(x + 6, y - 4, 2, 0, Math.PI*2); ctx.fill(); 
    } 

    function gameLoop() { 
        if(isGameOver) return; 
        ctx.clearRect(0, 0, canvas.width, canvas.height); 

        velocity += gravity; 
        birdY += velocity; 

        if(frameCount % 100 === 0) { 
            const gap = 120; 
            const minPipeHeight = 50; 
            const maxPipeHeight = canvas.height - gap - minPipeHeight; 
            const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1) + minPipeHeight); 
            pipes.push({ x: canvas.width, topHeight: topHeight, passed: false }); 
        } 

        ctx.fillStyle = '#10b981'; 
        for(let i=0; i<pipes.length; i++) { 
            let p = pipes[i]; 
            p.x -= 2.5; 
            ctx.fillRect(p.x, 0, 40, p.topHeight); 
            const bottomY = p.topHeight + 120; 
            ctx.fillRect(p.x, bottomY, 40, canvas.height - bottomY); 

            const birdX = 50; 
            if (birdX + birdRadius > p.x && birdX - birdRadius < p.x + 40) { 
                if (birdY - birdRadius < p.topHeight || birdY + birdRadius > bottomY) { 
                    gameOver(); 
                } 
            } 
            if (p.x + 40 < birdX && !p.passed) { score++; p.passed = true; } 
        } 

        pipes = pipes.filter(p => p.x + 40 > 0); 

        if(birdY + birdRadius > canvas.height || birdY - birdRadius < 0) { gameOver(); } 

        drawBird(50, birdY); 

        ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('Score: ' + score, 10, 30); 

        frameCount++; 
        currentAnimationId = requestAnimationFrame(gameLoop); 
    } 

    function gameOver() { 
        isGameOver = true; 
        isPlayingActionGame = false; 
        window.removeEventListener('keydown', jump); 
        canvas.removeEventListener('mousedown', jump); 
        canvas.removeEventListener('touchstart', jump); 
        if(currentAnimationId) cancelAnimationFrame(currentAnimationId); 
        
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); 
        ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; 
        ctx.fillText('GAME OVER', 90, 180); ctx.fillText('Score: ' + score, 110, 220); 
        
        setTimeout(() => { 
            if (singlePlayerMode) { handleSpActionGameOver(score); } 
            else { updateDoc(doc(db, "games", gameId), { [isPlayer1 ? 'p1Score' : 'p2Score']: score }); } 
        }, 1500); 
    } 

    gameLoop(); 
}

function startCarRacing(gameId, isPlayer1) { const canvas = document.getElementById('actionCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); let carX = 135; const carWidth = 30; const carHeight = 50; let score = 0; let obstacles = []; let gameSpeed = 3; let isGameOver = false; const handleKeyDown = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft' && carX > 35) carX -= 100; if(e.key === 'ArrowRight' && carX < 235) carX += 100; }; window.addEventListener('keydown', handleKeyDown); function drawCar(x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, carWidth, carHeight); ctx.fillStyle = '#333'; ctx.fillRect(x - 5, y + 5, 5, 15); ctx.fillRect(x + carWidth, y + 5, 5, 15); ctx.fillRect(x - 5, y + 30, 5, 15); ctx.fillRect(x + carWidth, y + 30, 5, 15); } function gameLoop() { if(isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#555'; ctx.setLineDash([20, 20]); ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 400); ctx.stroke(); ctx.beginPath(); ctx.moveTo(200, 0); ctx.lineTo(200, 400); ctx.stroke(); ctx.setLineDash([]); drawCar(carX, 330, '#8b5cf6'); if(Math.random() < 0.02 + (score/20000)) { const lanes = [35, 135, 235]; const lane = lanes[Math.floor(Math.random() * lanes.length)]; if (!obstacles.some(o => Math.abs(o.y - (-50)) < 150 && o.x === lane)) { obstacles.push({ x: lane, y: -50, width: 30, height: 50 }); } } for(let i=0; i<obstacles.length; i++) { let obs = obstacles[i]; obs.y += gameSpeed; drawCar(obs.x, obs.y, '#ec4899'); if (carX < obs.x + obs.width && carX + carWidth > obs.x && 330 < obs.y + obs.height && 330 + carHeight > obs.y) { gameOver(); } } obstacles = obstacles.filter(o => o.y < 450); score++; if(score % 500 === 0) gameSpeed += 0.5; ctx.fillStyle = 'white'; ctx.font = 'bold 16px Inter'; ctx.fillText('Score: ' + Math.floor(score/10), 10, 25); currentAnimationId = requestAnimationFrame(gameLoop); } function gameOver() { isGameOver = true; isPlayingActionGame = false; window.removeEventListener('keydown', handleKeyDown); if(currentAnimationId) cancelAnimationFrame(currentAnimationId); const finalScore = Math.floor(score/10); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('CRASHED!', 100, 180); ctx.fillText('Score: ' + finalScore, 100, 220); setTimeout(() => { if (singlePlayerMode) { handleSpActionGameOver(finalScore); } else { updateDoc(doc(db, "games", gameId), { [isPlayer1 ? 'p1Score' : 'p2Score']: finalScore }); } }, 1500); } const btnLeft = document.getElementById('btnLeft'); const btnRight = document.getElementById('btnRight'); btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); if(carX > 35) carX -= 100; }; btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); if(carX < 235) carX += 100; }; gameLoop(); }
function startJetFighter(gameId, isPlayer1) { const canvas = document.getElementById('actionCanvas'); if (!canvas) return; const ctx = canvas.getContext('2d'); let jetX = 135; const jetSize = 30; let bullets = []; let enemies = []; let score = 0; let isGameOver = false; let isMovingLeft = false; let isMovingRight = false; const handleKeyDown = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft') isMovingLeft = true; if(e.key === 'ArrowRight') isMovingRight = true; if(e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); bullets.push({ x: jetX + jetSize/2 - 2, y: 350 }); } }; const handleKeyUp = (e) => { if(!isPlayingActionGame) return; if(e.key === 'ArrowLeft') isMovingLeft = false; if(e.key === 'ArrowRight') isMovingRight = false; }; window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp); function drawJet(x, y, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + jetSize/2, y); ctx.lineTo(x + jetSize, y + jetSize); ctx.lineTo(x, y + jetSize); ctx.fill(); } function gameLoop() { if(isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if(isMovingLeft && jetX > 0) jetX -= 5; if(isMovingRight && jetX < canvas.width - jetSize) jetX += 5; ctx.fillStyle = 'white'; for(let i=0; i<3; i++) { ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, 2); } drawJet(jetX, 350, '#10b981'); ctx.fillStyle = '#f59e0b'; for(let i=0; i<bullets.length; i++) { bullets[i].y -= 7; ctx.fillRect(bullets[i].x, bullets[i].y, 4, 10); } bullets = bullets.filter(b => b.y > 0); if(Math.random() < 0.03 + (score/10000)) { enemies.push({ x: Math.random() * (canvas.width - 20), y: -20, size: 20 }); } for(let i=0; i<enemies.length; i++) { let e = enemies[i]; e.y += 2.5; ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x, e.y, e.size, e.size); for(let j=0; j<bullets.length; j++) { let b = bullets[j]; if(b.x > e.x && b.x < e.x + e.size && b.y > e.y && b.y < e.y + e.size) { e.dead = true; b.dead = true; score += 10; } } if (jetX < e.x + e.size && jetX + jetSize > e.x && 350 < e.y + e.size && 350 + jetSize > e.y) { gameOver(); } } enemies = enemies.filter(e => !e.dead && e.y < 450); bullets = bullets.filter(b => !b.dead); ctx.fillStyle = 'white'; ctx.font = 'bold 16px Inter'; ctx.fillText('Score: ' + score, 10, 25); currentAnimationId = requestAnimationFrame(gameLoop); } function gameOver() { isGameOver = true; isPlayingActionGame = false; window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); if(currentAnimationId) cancelAnimationFrame(currentAnimationId); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 20px Inter'; ctx.fillText('DESTROYED!', 90, 180); ctx.fillText('Score: ' + score, 105, 220); setTimeout(() => { if (singlePlayerMode) { handleSpActionGameOver(score); } else { updateDoc(doc(db, "games", gameId), { [isPlayer1 ? 'p1Score' : 'p2Score']: score }); } }, 1500); } const btnLeft = document.getElementById('btnLeft'); const btnRight = document.getElementById('btnRight'); btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); isMovingLeft = true; }; btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = (e) => { e.preventDefault(); isMovingLeft = false; }; btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); isMovingRight = true; }; btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = (e) => { e.preventDefault(); isMovingRight = false; }; if(!document.getElementById('btnShoot')) { const btnShoot = document.createElement('button'); btnShoot.id = 'btnShoot'; btnShoot.className = 'game-control-btn'; btnShoot.style.background = 'rgba(236, 72, 153, 0.2)'; btnShoot.style.borderColor = 'var(--accent)'; btnShoot.innerText = '🔥'; document.getElementById('gameControls').appendChild(btnShoot); btnShoot.onmousedown = btnShoot.ontouchstart = (e) => { e.preventDefault(); bullets.push({ x: jetX + jetSize/2 - 2, y: 350 }); }; } gameLoop(); }
function renderTicTacToe(data, gameId) { const isMyTurn = data.turn === auth.currentUser.uid; const mySymbol = data.player1 === auth.currentUser.uid ? "X" : "O"; let turnText = data.winner ? (data.winner === 'draw' ? "It's a Draw!" : (data.winner === auth.currentUser.uid ? "🎉 You Won!" : "😞 You Lost!")) : (isMyTurn ? "Your Turn" : "Opponent's Turn"); let html = `<div class="game-turn-indicator" style="color: ${isMyTurn && !data.winner ? 'var(--primary)' : 'white'}">${turnText}</div><div class="ttt-board">`; data.board.forEach((cell, index) => { const cellClass = cell === 'X' ? 'x' : (cell === 'O' ? 'o' : ''); html += `<div class="ttt-cell ${cellClass}" onclick="makeMoveTTT(${index}, '${data.board[index]}', ${isMyTurn}, '${mySymbol}')">${cell}</div>`; }); html += `</div>`; if(data.winner) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetTTT('${gameId}')">Play Again</button>`; gameUIContainer.innerHTML = html; }
window.makeMoveTTT = async (index, currentVal, isMyTurn, mySymbol) => { if(!isMyTurn || currentVal !== "" || !currentGameId) return; const docRef = doc(db, "games", currentGameId); const snap = await getDoc(docRef); const data = snap.data(); if(data.winner) return; let newBoard = [...data.board]; newBoard[index] = mySymbol; const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; let newWinner = null; for (let i = 0; i < lines.length; i++) { const [a, b, c] = lines[i]; if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) newWinner = auth.currentUser.uid; } if(!newWinner && !newBoard.includes("")) newWinner = "draw"; const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; await updateDoc(docRef, { board: newBoard, turn: nextTurn, winner: newWinner }); };
window.resetTTT = async (gameId) => { const docRef = doc(db, "games", gameId); const snap = await getDoc(docRef); await updateDoc(docRef, { board: ["","","","","","","","",""], winner: null, turn: snap.data().player1 }); };
function renderRPS(data, gameId) { const isPlayer1 = data.player1 === auth.currentUser.uid; const myChoice = isPlayer1 ? data.p1Choice : data.p2Choice; const oppChoice = isPlayer1 ? data.p2Choice : data.p1Choice; let statusText = "Make your choice!"; let bothSelected = data.p1Choice && data.p2Choice; if (bothSelected) { if (myChoice === oppChoice) statusText = "It's a Tie!"; else if ((myChoice === 'rock' && oppChoice === 'scissors') || (myChoice === 'paper' && oppChoice === 'rock') || (myChoice === 'scissors' && oppChoice === 'paper')) statusText = "🎉 You Won!"; else statusText = "😞 You Lost!"; } else if (myChoice) statusText = "Waiting for opponent..."; const icons = { rock: "fa-hand-back-fist", paper: "fa-hand", scissors: "fa-hand-scissors" }; let html = `<div class="game-turn-indicator">${statusText}</div><div class="rps-arena"><div class="rps-player"><span>You</span><div class="rps-choice-display"><i class="fa-solid ${myChoice ? icons[myChoice] : 'fa-question'}"></i></div></div><div class="vs-badge">VS</div><div class="rps-player"><span>Opponent</span><div class="rps-choice-display"><i class="fa-solid ${bothSelected ? icons[oppChoice] : (oppChoice ? 'fa-check' : 'fa-question')}" style="color: ${oppChoice && !bothSelected ? '#10b981' : 'white'}"></i></div></div></div>`; if (!myChoice && !bothSelected) html += `<div class="rps-controls"><button class="rps-btn" onclick="makeMoveRPS('rock')"><i class="fa-solid fa-hand-back-fist"></i></button><button class="rps-btn" onclick="makeMoveRPS('paper')"><i class="fa-solid fa-hand"></i></button><button class="rps-btn" onclick="makeMoveRPS('scissors')"><i class="fa-solid fa-hand-scissors"></i></button></div>`; if(bothSelected) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetRPS('${gameId}')">Play Again</button>`; gameUIContainer.innerHTML = html; }
window.makeMoveRPS = async (choice) => { if(!currentGameId) return; const docRef = doc(db, "games", currentGameId); const snap = await getDoc(docRef); const isPlayer1 = snap.data().player1 === auth.currentUser.uid; if (isPlayer1) await updateDoc(docRef, { p1Choice: choice }); else await updateDoc(docRef, { p2Choice: choice }); };
window.resetRPS = async (gameId) => { await updateDoc(doc(db, "games", gameId), { p1Choice: null, p2Choice: null }); };


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
closeExploreBtn.addEventListener("click", () => {
    exploreArea.style.display = "none";
    if(globalChatUnsubscribe) {
        globalChatUnsubscribe();
        globalChatUnsubscribe = null; 
    }
    if(window.innerWidth <= 992) sidebar.classList.remove("hidden");
});
exploreTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        exploreTabs.forEach(t => t.classList.remove("active"));
        exploreSections.forEach(s => s.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.getAttribute("data-target");
        document.getElementById(target).classList.add("active");

        if (target === "exploreLounge") initGlobalLounge();
        if (target === "exploreLeaderboard") initLeaderboard();
        if (target === "exploreMemes") initMemesFeed();
    });
});

const globalChatBox = document.getElementById("globalChatBox");
const globalMsgInput = document.getElementById("globalMsgInput");
const sendGlobalBtn = document.getElementById("sendGlobalBtn");

function initGlobalLounge() {
    if (globalChatUnsubscribe) return; 
    globalChatBox.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Lounge...</div>';
    
    const q = query(collection(db, "global_lounge"), orderBy("time", "asc"), limit(100));
    globalChatUnsubscribe = onSnapshot(q, (snapshot) => {
        globalChatBox.innerHTML = "";
        snapshot.forEach(docSnap => {
            const msg = docSnap.data();
            const msgId = docSnap.id;
            const isMe = msg.sender === auth.currentUser.uid;
            
            if (msg.deletedFor && msg.deletedFor.includes(auth.currentUser.uid)) return;

            const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const div = document.createElement("div");
            div.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
            const avatarUrl = msg.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName)}&background=10b981&color=fff`;
            let nameTag = !isMe ? `<div style="font-size:11px; color: #10b981; font-weight:600; margin-bottom:4px;">${msg.senderName}</div>` : "";
            
            let contentHtml = "";
            if (msg.isDeleted) {
                contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`;
            } else {
                let replyHtml = msg.replyToText ? `<div class="replied-msg-box" onclick="event.stopPropagation();"><b>${msg.replyToName}</b><div class="preview-text">${msg.replyToText}</div></div>` : "";
                const encodedText = encodeURIComponent(msg.text || "");
                const encodedName = encodeURIComponent(isMe ? 'You' : msg.senderName);
                contentHtml = `<div class="msg-bubble" style="${isMe ? 'background: #10b981;' : ''}" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'global')">
                    ${nameTag}
                    ${replyHtml}
                    <span style="word-wrap: break-word; white-space: pre-wrap; display: block; max-width: 100%;">${msg.text}</span>
                    ${msg.isEdited ? '<span style="font-size:10px; opacity:0.5; display:block; margin-top:5px;">(edited)</span>' : ''}
                </div>`;
            }
            
            div.innerHTML = `${!isMe ? `<img src="${avatarUrl}" class="msg-avatar">` : ''}<div style="display:flex; flex-direction:column; max-width: 100%;">${contentHtml}<div class="msg-time">${timeStr}</div></div>${isMe ? `<img src="${document.getElementById('myAvatar').src}" class="msg-avatar">` : ''}`;
            globalChatBox.appendChild(div);
        });
        globalChatBox.scrollTop = globalChatBox.scrollHeight;
    });
}

async function sendGlobalMessage() { 
    const text = globalMsgInput.value.trim(); 
    if(!text) return; 
    globalMsgInput.value = ""; 
    
    const payload = { 
        text: text, 
        sender: auth.currentUser.uid, 
        senderName: document.getElementById("myName").innerText, 
        avatarUrl: document.getElementById("myAvatar").src, 
        time: Date.now(),
        isEdited: false,
        isDeleted: false
    };

    if (replyingToMsg && replyingToMsg.context === 'global') { 
        payload.replyToId = replyingToMsg.id; 
        payload.replyToText = replyingToMsg.text; 
        payload.replyToName = replyingToMsg.name; 
        document.getElementById("cancelReplyBtn").click(); 
    }

    try { 
        await addDoc(collection(db, "global_lounge"), payload); 
    } catch(e) { 
        showToast("Error", "Message failed to send."); 
    } 
}

sendGlobalBtn.addEventListener("click", sendGlobalMessage); globalMsgInput.addEventListener("keypress", (e) => { if(e.key === "Enter") sendGlobalMessage(); });

const lbGameSelect = document.getElementById("lbGameSelect");
const leaderboardList = document.getElementById("leaderboardList");

async function initLeaderboard() { lbGameSelect.addEventListener("change", fetchLeaderboard); fetchLeaderboard(); }
async function fetchLeaderboard() {
    leaderboardList.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching scores...</div>';
    const game = lbGameSelect.value;
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let players = [];
        usersSnap.forEach(doc => { const data = doc.data(); if(data.highScores && data.highScores[game]) { players.push({ name: data.fullName || data.username, score: data.highScores[game], uid: doc.id }); } });
        players.sort((a, b) => b.score - a.score); players = players.slice(0, 50); 
        leaderboardList.innerHTML = "";
        if(players.length === 0) { leaderboardList.innerHTML = "<p style='text-align:center; color:var(--text-muted);'>No scores yet. Be the first to play!</p>"; return; }
        players.forEach((p, index) => {
            let rankClass = index === 0 ? 'top-1' : (index === 1 ? 'top-2' : (index === 2 ? 'top-3' : ''));
            const isMe = p.uid === auth.currentUser.uid ? " (You)" : "";
            leaderboardList.innerHTML += `<div class="lb-rank-card ${rankClass}"><div class="lb-rank">#${index + 1}</div><div style="font-weight: 500;">${p.name} <span style="font-size:12px; color:var(--primary);">${isMe}</span></div><div class="lb-score">${p.score}</div></div>`;
        });
    } catch(e) { leaderboardList.innerHTML = "<p>Error loading leaderboard.</p>"; }
}
let currentMemeSubreddit = 'wholesomememes'; 

const memeSafeBtn = document.getElementById("memeSafeBtn");
const memeDankBtn = document.getElementById("memeDankBtn");

if(memeSafeBtn && memeDankBtn) {
    memeSafeBtn.addEventListener("click", () => {
        memeSafeBtn.classList.add("active");
        memeDankBtn.classList.remove("active");
        currentMemeSubreddit = 'wholesomememes';
        memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
        loadMoreMemes();
    });

    memeDankBtn.addEventListener("click", () => {
        memeDankBtn.classList.add("active");
        memeSafeBtn.classList.remove("active");
        currentMemeSubreddit = 'dankmemes'; 
        memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
        loadMoreMemes();
    });
}
const memesWrapper = document.getElementById("memesWrapper");
async function initMemesFeed() {
    if(memesWrapper.children.length > 1) return; 
    memesWrapper.innerHTML = '<div style="color:var(--primary); padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    loadMoreMemes();
}
async function loadMoreMemes() {
    const spinner = memesWrapper.querySelector('.fa-spinner')?.parentElement;
    
    try {
        const response = await fetch(`https://meme-api.com/gimme/${currentMemeSubreddit}/10`);
        if (!response.ok) throw new Error("Meme API Down");
        
        const data = await response.json();
        if(spinner) spinner.remove();

        data.memes.forEach(meme => {
            if(!meme.url || meme.url.includes('.mp4')) return; 
            const card = document.createElement('div');
            card.className = "meme-card";
            card.innerHTML = `<h4>${meme.title}</h4><img src="${meme.url}" alt="Meme" loading="lazy"><div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">👍 ${meme.ups || '1k+'} | r/${currentMemeSubreddit}</div>`;
            memesWrapper.appendChild(card);
        });

    } catch(e) { 
        console.log("Primary API failed, trying Imgflip Fallback...");
        
        try {
            const fallbackRes = await fetch('https://api.imgflip.com/get_memes');
            const fallbackData = await fallbackRes.json();
            if(spinner) spinner.remove();

            const allMemes = fallbackData.data.memes;
            const randomMemes = allMemes.sort(() => 0.5 - Math.random()).slice(0, 10);

            randomMemes.forEach(meme => {
                const card = document.createElement('div');
                card.className = "meme-card";
                card.innerHTML = `<h4>${meme.name}</h4><img src="${meme.url}" alt="Meme" loading="lazy"><div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">🔥 Trending | Imgflip</div>`;
                memesWrapper.appendChild(card);
            });
        } catch(err) {
            if(spinner) spinner.remove();
            memesWrapper.innerHTML += `<div style="color:#ef4444; text-align:center; padding: 20px;">Check your internet connection or disable strict Ad-Blockers!</div>`; 
        }
    }

    const oldBtn = memesWrapper.querySelector('.primary-btn');
    if(oldBtn) oldBtn.remove();

    const btn = document.createElement("button"); 
    btn.className = "primary-btn glow-btn"; 
    btn.style.width = "auto"; btn.style.margin = "20px"; 
    btn.innerText = "Load More Memes";
    btn.onclick = () => { 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; 
        loadMoreMemes(); 
    };
    memesWrapper.appendChild(btn);
}

const pDoodleArea = document.getElementById("privateDoodleArea");
const pDoodleCanvas = document.getElementById("pDoodleCanvas");
const pDoodleCtx = pDoodleCanvas.getContext("2d");
const pDoodleColor = document.getElementById("pDoodleColor");
const pDoodleSize = document.getElementById("pDoodleSize"); // NEW
const undoPDoodleBtn = document.getElementById("undoPDoodleBtn"); // NEW
let isPDrawing = false;
let currentPStroke = [];

chatDoodleBtn.addEventListener("click", async () => {
    if(currentChatStatus !== 'accepted') { alert("Connection request not accepted yet."); return; }
    
    const chatSnap = await getDoc(doc(db, "chats", currentChatId));
    if(chatSnap.exists() && chatSnap.data().doodleActive) {
        pDoodleArea.style.display = "flex";
        document.getElementById("doodleBadge").style.display = "none";
        window.dispatchEvent(new Event('resize')); 
    } else {
        if (isCurrentChatGroup) { alert("Doodle is for 1v1 only!"); return; }
        
        await updateDoc(doc(db, "chats", currentChatId), { doodleReq: auth.currentUser.uid });
        const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 60000;
        const payload = { sender: auth.currentUser.uid, time: Date.now(), isDoodleRequest: true, isDeleted: false };
        if (timerValue > 0) payload.timerDuration = timerValue;
        
        await addDoc(collection(db, "chats", currentChatId, "messages"), payload);
        await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎨 DOODLE REQUEST", unread: true } } }, { merge: true });
        showToast("Request Sent", "Doodle request sent to friend.");
    }
});

document.getElementById("hideDoodleBtn").addEventListener("click", () => { 
    pDoodleArea.style.display = "none"; 
    // Board band hote hi messages ko "Seen" mark karne ke liye loadMessages ko trigger karein
    if (currentChatId) {
        loadMessages();
    }
});
window.acceptDoodle = async () => {
    await updateDoc(doc(db, "chats", currentChatId), { doodleActive: true, doodleReq: null });
    pDoodleArea.style.display = "flex";
    window.dispatchEvent(new Event('resize')); 
};

document.getElementById("disconnectDoodleBtn").addEventListener("click", async () => {
    if(confirm("Stop doodling and wipe the board for both of you?")) {
        await updateDoc(doc(db, "chats", currentChatId), { doodleActive: false });
        const snaps = await getDocs(collection(db, "chats", currentChatId, "doodle"));
        const batch = writeBatch(db); 
        snaps.docs.forEach(d => batch.delete(d.ref)); 
        await batch.commit();
        pDoodleArea.style.display = "none";
    }
});

function getPCoordinates(e) {
    const rect = pDoodleCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
}

function drawPLine(x0, y0, x1, y1, color, size = 3) {
    pDoodleCtx.beginPath(); pDoodleCtx.moveTo(x0, y0); pDoodleCtx.lineTo(x1, y1);
    pDoodleCtx.strokeStyle = color; pDoodleCtx.lineWidth = size; pDoodleCtx.lineCap = 'round';
    pDoodleCtx.stroke(); pDoodleCtx.closePath();
}

function initPrivateDoodle() {
    if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
    pDoodleCtx.fillStyle = "#fff"; 
    pDoodleCtx.fillRect(0, 0, pDoodleCanvas.width, pDoodleCanvas.height);
    
    // Ordered by time to properly support redrawing on Undo
    pDoodleUnsubscribe = onSnapshot(query(collection(db, "chats", currentChatId, "doodle"), orderBy("time", "asc")), (snapshot) => {
        pDoodleCtx.fillStyle = "#fff"; 
        pDoodleCtx.fillRect(0, 0, pDoodleCanvas.width, pDoodleCanvas.height);
        
        snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if(data.type === 'clear') { 
                pDoodleCtx.fillStyle = "#fff"; 
                pDoodleCtx.fillRect(0, 0, pDoodleCanvas.width, pDoodleCanvas.height); 
            } 
            else if(data.stroke && data.stroke.length > 0) {
                const size = data.size || 3;
                for(let i=0; i<data.stroke.length-1; i++) { 
                    drawPLine(data.stroke[i].x, data.stroke[i].y, data.stroke[i+1].x, data.stroke[i+1].y, data.color, size); 
                }
                if(pDoodleArea.style.display === "none" && data.sender !== auth.currentUser.uid) { 
                    document.getElementById("doodleBadge").style.display = "block"; 
                }
            }
        });
    });
}

const startPDrawing = (e) => { isPDrawing = true; currentPStroke = []; currentPStroke.push(getPCoordinates(e)); };
const drawP = (e) => { 
    if (!isPDrawing) return; e.preventDefault(); 
    const pos = getPCoordinates(e); const lastPos = currentPStroke[currentPStroke.length - 1]; 
    drawPLine(lastPos.x, lastPos.y, pos.x, pos.y, pDoodleColor.value, pDoodleSize.value); 
    currentPStroke.push(pos); 
};
const stopPDrawing = async () => { 
    if (!isPDrawing) return; isPDrawing = false; 
    if(currentPStroke.length > 1) { 
        try { 
            await addDoc(collection(db, "chats", currentChatId, "doodle"), { stroke: currentPStroke, color: pDoodleColor.value, size: pDoodleSize.value, time: Date.now(), sender: auth.currentUser.uid }); 
        } catch(e) {} 
    } 
};

pDoodleCanvas.addEventListener("mousedown", startPDrawing); pDoodleCanvas.addEventListener("mousemove", drawP); 
pDoodleCanvas.addEventListener("mouseup", stopPDrawing); pDoodleCanvas.addEventListener("mouseout", stopPDrawing);
pDoodleCanvas.addEventListener("touchstart", startPDrawing, {passive: false}); pDoodleCanvas.addEventListener("touchmove", drawP, {passive: false}); pDoodleCanvas.addEventListener("touchend", stopPDrawing);

document.getElementById("clearPDoodleBtn").addEventListener("click", async () => {
    if(confirm("Clear board?")) {
        const snaps = await getDocs(collection(db, "chats", currentChatId, "doodle"));
        const batch = writeBatch(db); snaps.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
        await addDoc(collection(db, "chats", currentChatId, "doodle"), { type: 'clear', time: Date.now() });
    }
});

if (undoPDoodleBtn) {
    undoPDoodleBtn.addEventListener("click", async () => {
        if (!currentChatId) return;
        try {
            const snaps = await getDocs(query(collection(db, "chats", currentChatId, "doodle"), orderBy("time", "desc")));
            for (let docSnap of snaps.docs) {
                const data = docSnap.data();
                // Find and delete the last stroke drawn by the current user
                if (data.sender === auth.currentUser.uid && data.type !== 'clear') {
                    await deleteDoc(doc(db, "chats", currentChatId, "doodle", docSnap.id));
                    break;
                } else if (data.type === 'clear') {
                    break; // Can't undo past a clear
                }
            }
        } catch(e) { console.error("Undo failed:", e); }
    });
}

if (chatSettingsBtn) {
    chatSettingsBtn.addEventListener("click", () => {
        document.getElementById("chatSettingsModal").style.display = "flex";
    });
}

if (modalMsgTimerSelect) {
    modalMsgTimerSelect.addEventListener("change", async (e) => {
        if (currentChatId && !isCurrentChatGroup) {
            await updateDoc(doc(db, "chats", currentChatId), {
                messageTimer: e.target.value
            });
            showToast("Timer Updated", "Disappearing message timer changed for this chat.");
        }
    });
}

if (changeWallpaperBtn && wallpaperInput) {
    changeWallpaperBtn.addEventListener("click", () => {
        wallpaperInput.click();
    });

    wallpaperInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !currentChatId || isCurrentChatGroup) {
            if (isCurrentChatGroup) alert("Wallpapers are for 1v1 chats currently.");
            return;
        }
        
        const originalText = changeWallpaperBtn.innerHTML;
        changeWallpaperBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
        changeWallpaperBtn.disabled = true;
        
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", UPLOAD_PRESET);
            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
            const data = await response.json();
            
            await setDoc(doc(db, "users", auth.currentUser.uid), {
                chatMeta: { [targetUserUid]: { wallpaperUrl: data.secure_url } }
            }, { merge: true });

            document.getElementById("chatBox").style.backgroundImage = `linear-gradient(rgba(10,10,15,0.8), rgba(10,10,15,0.8)), url('${data.secure_url}')`;
            showToast("Wallpaper Updated", "Chat background changed successfully.");
        } catch (err) {
            alert("Failed to upload wallpaper: " + err.message);
        } finally {
            changeWallpaperBtn.innerHTML = originalText;
            changeWallpaperBtn.disabled = false;
            wallpaperInput.value = "";
        }
    });
}

if (removeWallpaperBtn) {
    removeWallpaperBtn.addEventListener("click", async () => {
        if (!currentChatId || !targetUserUid || isCurrentChatGroup) return;
        try {
            await setDoc(doc(db, "users", auth.currentUser.uid), {
                chatMeta: { [targetUserUid]: { wallpaperUrl: null } }
            }, { merge: true });
            document.getElementById("chatBox").style.backgroundImage = "none";
            showToast("Wallpaper Removed", "Restored default background.");
        } catch (err) {}
    });
}

if (clearChatMeBtn) {
    clearChatMeBtn.addEventListener("click", async () => {
        if (!currentChatId) return;
        if (confirm("Are you sure you want to clear this chat for yourself? Messages will be hidden for you but remain for the other person.")) {
            clearChatMeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...';
            try {
                const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages")));
                const batch = writeBatch(db);
                msgsSnap.docs.forEach(docSnap => {
                    batch.update(docSnap.ref, {
                        deletedFor: arrayUnion(auth.currentUser.uid)
                    });
                });
                await batch.commit();
                document.getElementById("chatSettingsModal").style.display = "none";
                showToast("Chat Cleared", "Messages have been hidden from your screen.");
            } catch (e) {
                alert("Error clearing chat.");
            } finally {
                clearChatMeBtn.innerHTML = '<i class="fa-solid fa-eraser"></i> Clear Chat for Me';
            }
        }
    });
}

window.addEventListener("popstate", (e) => {
    const modals = ["profileModal", "chatSettingsModal", "groupSettingsModal", "msgOptionsModal", "gameSelectionModal", "infoModal"];
    let modalClosed = false;
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (modal && modal.style.display === "flex") {
            modal.style.display = "none";
            modalClosed = true;
        }
    });
    if (modalClosed) {
        history.pushState(null, ""); 
        return;
    }

    if (document.getElementById("privateDoodleArea") && document.getElementById("privateDoodleArea").style.display === "flex") {
        document.getElementById("hideDoodleBtn").click();
        history.pushState(null, ""); 
        return;
    }

    if (document.getElementById("activeGameArea") && document.getElementById("activeGameArea").style.display === "flex") {
        document.getElementById("closeGameBtn").click();
        history.pushState(null, ""); 
        return;
    }

    if (document.getElementById("exploreArea") && document.getElementById("exploreArea").style.display === "flex") {
        document.getElementById("closeExploreBtn").click();
        history.pushState(null, ""); 
        return;
    }

    if (window.innerWidth <= 992 && document.getElementById("activeChatState") && document.getElementById("activeChatState").style.display === "flex") {
        document.getElementById("backToUsersBtn").click();
        history.pushState(null, ""); 
        return;
    }
});
// --- LEGACY USER EMAIL UPDATE LOGIC ---
let updateEmailOTP = null;
let pendingUpdateEmail = null;

// 1. Check if user needs to update email whenever their profile loads
onAuthStateChanged(auth, (user) => {
    if (user) {
        // We use getDoc directly here to check just once on login
        getDoc(doc(db, "users", user.uid)).then((docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // If realEmail is missing, show the warning modal after a short delay
                if (!data.realEmail) {
                    setTimeout(() => {
                        document.getElementById("missingEmailModal").style.display = "flex";
                    }, 2000); // 2 second delay so the app loads fully first
                }
            }
        });
    }
});

// 2. Send OTP for updating email
document.getElementById("sendUpdateOtpBtn").addEventListener("click", async () => {
    const emailToUpdate = document.getElementById("updateEmailInput").value.trim();
    const btn = document.getElementById("sendUpdateOtpBtn");

    if (!emailToUpdate || !emailToUpdate.includes("@")) {
        alert("Please enter a valid email address.");
        return;
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    btn.disabled = true;

    updateEmailOTP = Math.floor(100000 + Math.random() * 900000).toString();
    pendingUpdateEmail = emailToUpdate;
    const currentName = document.getElementById("myName").innerText || "User";

    try {
        await emailjs.send("service_z5e6d5x", "template_fks6dsp", {
            to_name: currentName,
            to_email: emailToUpdate,
            otp_code: updateEmailOTP
        });

        document.getElementById("updateEmailStep1").style.display = "none";
        document.getElementById("updateEmailStep2").style.display = "block";
    } catch (error) {
        alert("Failed to send OTP. Please try again.");
        btn.innerHTML = 'Send Verification Code';
        btn.disabled = false;
    }
});

// 3. Verify OTP and Save to Database
document.getElementById("verifyUpdateOtpBtn").addEventListener("click", async () => {
    const enteredOtp = document.getElementById("updateOtpInput").value.trim();
    const btn = document.getElementById("verifyUpdateOtpBtn");

    if (enteredOtp !== updateEmailOTP) {
        alert("Invalid OTP! Please check your email.");
        return;
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing...';
    btn.disabled = true;

    try {
        // Update the Firestore document with the new realEmail
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            realEmail: pendingUpdateEmail
        });

        document.getElementById("missingEmailModal").style.display = "none";
        showToast("Account Secured", "Your recovery email has been successfully added!");
        
        // Reset modal state for future
        document.getElementById("updateEmailStep1").style.display = "block";
        document.getElementById("updateEmailStep2").style.display = "none";
        document.getElementById("updateEmailInput").value = "";
        document.getElementById("updateOtpInput").value = "";
        btn.innerHTML = 'Verify & Secure Account';
        btn.disabled = false;

    } catch (error) {
        alert("Failed to update account. Please try again.");
        btn.innerHTML = 'Verify & Secure Account';
        btn.disabled = false;
    }
});
// --- VIDEO CALL LOGIC ---
// --- COMPLETE VIDEO CALL LOGIC ---
// --- COMPLETE AUDIO/VIDEO CALL LOGIC ---
const videoCallArea = document.getElementById("videoCallArea");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const endCallBtn = document.getElementById("endCallBtn");
const incomingCallModal = document.getElementById("incomingCallModal");
const answerCallBtn = document.getElementById("answerCallBtn");
const rejectCallBtn = document.getElementById("rejectCallBtn");
const openCallMenuBtn = document.getElementById("openCallMenuBtn");
const callSelectionModal = document.getElementById("callSelectionModal");
const startAudioCallBtn = document.getElementById("startAudioCallBtn");
const startVideoCallBtn = document.getElementById("startVideoCallBtn");

let callListenerUnsubscribe = null;
let isCurrentCallAudioOnly = false;

// 1. Camera/Mic Initialize
async function initMedia(audioOnly = false) {
    isCurrentCallAudioOnly = audioOnly;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
    video: !audioOnly, 
    audio: {
        echoCancellation: true, // Earphones hain toh isko false kar sakte hain
        noiseSuppression: false, // Delay kam karne ke liye false
        autoGainControl: false,  // Delay kam karne ke liye false
        sampleRate: 48000        // High quality audio
    } 
});
        localVideo.srcObject = localStream;
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;

        if(audioOnly) {
            localVideo.style.display = "none";
            remoteVideo.style.opacity = "0"; 
        } else {
            localVideo.style.display = "block";
            remoteVideo.style.opacity = "1";
        }
    } catch (error) {
        showToast("Error", "Media permissions denied!");
        console.error(error);
    }
}

// 2. Caller Logic Setup 
async function initiateCall(audioOnly) {
    // callSelectionModal is now deleted, directly show video area
    videoCallArea.style.display = "flex";
    document.querySelector("#videoCallArea .game-header span").innerHTML = audioOnly 
        ? '<i class="fa-solid fa-phone"></i> Secure Voice Call' 
        : '<i class="fa-solid fa-video"></i> Secure Video Call';

    await initMedia(audioOnly);

    peerConnection = new RTCPeerConnection(servers);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
peerConnection.ontrack = (event) => { 
    remoteVideo.srcObject = event.streams[0]; 
    remoteVideo.muted = false; 
    remoteVideo.volume = 1.0;
    remoteVideo.play().catch(e => console.log(e)); 
};
    const callDoc = doc(collection(db, "calls"), currentChatId);
    const offerCandidates = collection(callDoc, "offerCandidates");
    const answerCandidates = collection(callDoc, "answerCandidates");

    peerConnection.onicecandidate = (event) => { event.candidate && addDoc(offerCandidates, event.candidate.toJSON()); };

    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);
    
    await setDoc(callDoc, { 
        offer: { sdp: offerDescription.sdp, type: offerDescription.type },
        callType: audioOnly ? 'audio' : 'video' 
    });

    onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!peerConnection.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            peerConnection.setRemoteDescription(answerDescription);
        }
    });

    onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        });
    });

    const msgText = audioOnly ? "📞 Voice Calling..." : "🎥 Video Calling...";
    const payload = { text: msgText, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false };
    await addDoc(collection(db, "chats", currentChatId, "messages"), payload);
}

if(startAudioCallBtn) startAudioCallBtn.addEventListener("click", () => initiateCall(true));
if(startVideoCallBtn) startVideoCallBtn.addEventListener("click", () => initiateCall(false));

// 3. Listen for Incoming Calls
window.listenForCalls = () => {
    if (!currentChatId) return;
    if (callListenerUnsubscribe) callListenerUnsubscribe();
    
    callListenerUnsubscribe = onSnapshot(doc(db, "calls", currentChatId), (snapshot) => {
        if (!snapshot.exists()) {
            incomingCallModal.style.display = "none";
            if(videoCallArea.style.display === "flex") { endCallBtn.click(); }
            return;
        }
        
        const data = snapshot.data();
        if (data.offer && !localStream && videoCallArea.style.display === "none") {
            const isAudioCall = data.callType === 'audio';
            document.querySelector("#incomingCallModal h3").innerText = isAudioCall ? "Incoming Voice Call" : "Incoming Video Call";
            document.querySelector("#incomingCallModal i.fa-phone-volume").className = isAudioCall ? "fa-solid fa-phone-volume" : "fa-solid fa-video";
            
            window.incomingCallTypeAudio = isAudioCall; 
            incomingCallModal.style.display = "flex";
        }
    });
};

// 4. Receiver Logic (Answer)
if(answerCallBtn) {
    answerCallBtn.addEventListener("click", async () => {
        incomingCallModal.style.display = "none";
        videoCallArea.style.display = "flex";
        
        document.querySelector("#videoCallArea .game-header span").innerHTML = window.incomingCallTypeAudio 
            ? '<i class="fa-solid fa-phone"></i> Secure Voice Call' 
            : '<i class="fa-solid fa-video"></i> Secure Video Call';

        await initMedia(window.incomingCallTypeAudio); 

        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
peerConnection.ontrack = (event) => { 
    remoteVideo.srcObject = event.streams[0]; 
    remoteVideo.muted = false; 
    remoteVideo.volume = 1.0;  
    remoteVideo.play().catch(e => console.log(e)); 
};
        const callDoc = doc(db, "calls", currentChatId);
        const answerCandidates = collection(callDoc, "answerCandidates");
        const offerCandidates = collection(callDoc, "offerCandidates");

        peerConnection.onicecandidate = (event) => { event.candidate && addDoc(answerCandidates, event.candidate.toJSON()); };

        const callData = (await getDoc(callDoc)).data();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));

        const answerDescription = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDescription);
        await updateDoc(callDoc, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } });

        onSnapshot(offerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
        });
    });
}

// 5. Reject & Hangup
if(rejectCallBtn) {
    rejectCallBtn.addEventListener("click", async () => {
        incomingCallModal.style.display = "none";
        if(currentChatId) await deleteDoc(doc(db, "calls", currentChatId));
    });
}

if(endCallBtn) {
    endCallBtn.addEventListener("click", () => {
        if (peerConnection) peerConnection.close();
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        localStream = null; peerConnection = null;
        videoCallArea.style.display = "none";
        if (currentChatId) deleteDoc(doc(db, "calls", currentChatId)).catch(e => {});
    });
}
// --- CALL CONTROLS (MIC, CAM, SPEAKER) ---
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const toggleSpeakerBtn = document.getElementById("toggleSpeakerBtn");

if (toggleMicBtn) {
    toggleMicBtn.addEventListener("click", () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                toggleMicBtn.innerHTML = audioTrack.enabled ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
                toggleMicBtn.style.background = audioTrack.enabled ? 'rgba(255,255,255,0.2)' : 'rgba(239,68,68,0.5)';
            }
        }
    });
}

if (toggleCamBtn) {
    toggleCamBtn.addEventListener("click", () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                toggleCamBtn.innerHTML = videoTrack.enabled ? '<i class="fa-solid fa-camera"></i>' : '<i class="fa-solid fa-camera-slash"></i>';
                toggleCamBtn.style.background = videoTrack.enabled ? 'rgba(255,255,255,0.2)' : 'rgba(239,68,68,0.5)';
            }
        }
    });
}

let isSpeakerOn = false;
if (toggleSpeakerBtn) {
    toggleSpeakerBtn.addEventListener("click", async () => {
        isSpeakerOn = !isSpeakerOn;
        toggleSpeakerBtn.style.background = isSpeakerOn ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)';
        toggleSpeakerBtn.style.color = isSpeakerOn ? '#000' : '#fff';

        if (typeof remoteVideo.setSinkId !== 'undefined') {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                if (audioOutputs.length > 1) {
                    // Try to switch to Loudspeaker
                    const targetDevice = isSpeakerOn ? audioOutputs[audioOutputs.length - 1].deviceId : audioOutputs[0].deviceId;
                    await remoteVideo.setSinkId(targetDevice);
                    showToast("Speaker", isSpeakerOn ? "Loudspeaker Active" : "Earpiece Active");
                } else {
                    showToast("Notice", "Your mobile OS is controlling the speaker output automatically.");
                }
            } catch (e) { console.error(e); }
        } else {
            // Agar browser direct speaker access na de:
            showToast("Mobile Browsers limit this.", "Turn on Video call to auto-switch to Loudspeaker.");
        }
    });
}
