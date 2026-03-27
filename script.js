import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, query, orderBy, getDoc, deleteDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAc1esUcE7tXVRIXvknsUZCrRJR_PNhMzE",
  authDomain: "chat-373ed.firebaseapp.com",
  databaseURL: "https://chat-373ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chat-373ed",
  storageBucket: "chat-373ed.firebasestorage.app",
  messagingSenderId: "457068201028",
  appId: "1:457068201028:web:cf014c885371cf5c13e811",
  measurementId: "G-ZW82BR13GX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 

// APIs
const YOUTUBE_KEY = "AIzaSyA_jYFuW-ANA-VPqX1wHpWmg6m-FiOxaD8"; 

// --- 2. GLOBAL STATE ---
let currentChatId = null;
let targetUserUid = null;
let messagesUnsubscribe = null;
let chatMetaUnsubscribe = null;
let typingTimeout = null;
let isSignupMode = false;
let replyingToMsg = null;
let isCurrentChatGroup = false; 
let allUsers = [];
let allGroups = [];
let myUserData = null; 
let myProfileUnsubscribe = null;

// GAME STATE
let currentGameId = null;
let gameUnsubscribe = null;
let isPlayingActionGame = false;
let singlePlayerMode = false;
let currentAnimationId = null; 

// --- 3. DOM ELEMENTS ---
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const nameGroup = document.getElementById("nameGroup");
const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const authActionBtn = document.getElementById("authActionBtn");
const sidebar = document.getElementById("sidebar");
const usersList = document.getElementById("usersList");
const searchInput = document.getElementById("searchInput");
const activeChatState = document.getElementById("activeChatState");
const emptyChatState = document.getElementById("emptyChatState");
const chatBox = document.getElementById("chatBox");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("sendBtn");
const backToUsersBtn = document.getElementById("backToUsersBtn");

// UI Toggle Logic
const chatToggleBtn = document.getElementById("chatToggleBtn");
const homeGamesBtn = document.getElementById("homeGamesBtn");
const newsFeedContainer = document.getElementById("newsFeedContainer");
const chatListContainer = document.getElementById("chatListContainer");
const gamesNavContainer = document.getElementById("gamesNavContainer");

// Screen State Management
function switchSidebarView(view) {
    newsFeedContainer.style.display = "none";
    chatListContainer.style.display = "none";
    gamesNavContainer.style.display = "none";

    if (view === 'chats') {
        chatListContainer.style.display = "flex";
        chatToggleBtn.innerHTML = '<i class="fa-solid fa-message"></i> Chats';
        chatToggleBtn.style.color = "white";
        homeGamesBtn.style.color = "var(--text-muted)";
    } else if (view === 'games') {
        gamesNavContainer.style.display = "flex";
        chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed';
        chatToggleBtn.style.color = "white";
        homeGamesBtn.style.color = "var(--primary)";
    } else if (view === 'feed') {
        newsFeedContainer.style.display = "flex";
        chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed (Active)';
        chatToggleBtn.style.color = "var(--accent)";
        homeGamesBtn.style.color = "var(--text-muted)";
    }
}

// Initial View
switchSidebarView('games');

chatToggleBtn.addEventListener("click", () => {
  if (chatListContainer.style.display === "flex") { switchSidebarView('feed'); } 
  else { switchSidebarView('chats'); }
});

homeGamesBtn.addEventListener("click", () => { switchSidebarView('games'); });

// --- 4. ENCRYPTION ENGINE (CryptoJS) ---
const encryptMessage = (text, secretKey) => {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, secretKey).toString();
};

const decryptMessage = (cipherText, secretKey) => {
  if (!cipherText) return cipherText;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, secretKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return "[Encrypted Message]"; 
  }
};

// --- 5. UTILS & TOAST NOTIFICATION ---
const getFakeEmail = (username) => `${username.toLowerCase().trim()}@chitchat.app`;

const generateAvatar = (userObj, fallbackName) => {
  if (userObj && userObj.avatarUrl) return userObj.avatarUrl;
  const name = (userObj && (userObj.fullName || userObj.username)) || fallbackName || "User";
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&rounded=true&bold=true`;
};

function timeAgo(ms) {
  if (!ms) return "";
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

window.showToast = function(title, message, avatarUrl) {
  const container = document.getElementById("toastContainer");
  if(!container) return;
  const imgUrl = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(title)}&background=8b5cf6&color=fff`;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <img src="${imgUrl}" alt="icon" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
    <div class="toast-content" style="display: flex; flex-direction: column; overflow: hidden;">
      <span style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${title}</span>
      <span style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${message}</span>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeOutToast 0.5s ease forwards";
    setTimeout(() => { if(toast.parentElement) toast.remove(); }, 500);
  }, 4000);
};

// --- 6. AUTHENTICATION UI LOGIC ---
const toggleAuthMode = (signup) => {
  isSignupMode = signup;
  if (signup) {
    tabSignup.classList.add("active"); tabLogin.classList.remove("active");
    nameGroup.style.display = "block"; authActionBtn.innerText = "Create Account";
  } else {
    tabLogin.classList.add("active"); tabSignup.classList.remove("active");
    nameGroup.style.display = "none"; authActionBtn.innerText = "Enter Chit-Chat";
  }
};
tabLogin.addEventListener("click", () => toggleAuthMode(false));
tabSignup.addEventListener("click", () => toggleAuthMode(true));

authActionBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();
  const fullName = fullNameInput.value.trim();

  if (!username || !password || (isSignupMode && !fullName)) { alert("Please fill in all required fields."); return; }
  if (username.includes(" ")) { alert("Username cannot contain spaces."); return; }

  const email = getFakeEmail(username);
  authActionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

  try {
    if (isSignupMode) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        username, fullName, createdAt: Date.now(), isOnline: true, lastSeen: Date.now()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    alert(error.message.replace("Firebase: ", ""));
    authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat";
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (confirm("Disconnect from Chit-Chat?")) {
    try {
      await updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: Date.now() });
    } catch (e) { console.error("Logout error updating status:", e); }
    if(myProfileUnsubscribe) myProfileUnsubscribe();
    signOut(auth);
  }
});

// --- 7. AUTH STATE OBSERVER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authScreen.style.display = "none"; appScreen.style.display = "flex";
    history.pushState({ page: "home" }, ""); 
    await updateDoc(doc(db, "users", user.uid), { isOnline: true });
    showToast("Welcome Back!", "You are securely connected.", "https://ui-avatars.com/api/?name=Chit+Chat&background=10b981&color=fff");
    window.addEventListener("beforeunload", () => updateDoc(doc(db, "users", user.uid), { isOnline: false, lastSeen: Date.now() }));
    startMyProfileListener(user.uid); 
    loadSidebarData(); 
    loadNewsFeed(); 
  } else {
    authScreen.style.display = "flex"; appScreen.style.display = "none";
    emptyChatState.style.display = "flex"; activeChatState.style.display = "none";
    usernameInput.value = ""; passwordInput.value = "";
    authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat";
    myUserData = null;
  }
});

// NEWS FEED
async function loadNewsFeed() {
  const container = document.getElementById("newsFeedContainer");
  container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--primary);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px;"></i><p style="margin-top:10px;">Loading Latest Tech News...</p></div>';
  try {
    const randomPage = Math.floor(Math.random() * 5) + 1;
    const res = await fetch(`https://dev.to/api/articles?per_page=15&page=${randomPage}&tag=programming`);
    const articles = await res.json();
    container.innerHTML = '';
    articles.forEach(article => {
      container.innerHTML += `<div class="news-feed-card"><h4>${article.title}</h4><p>${article.description || 'Tap to read the full insight...'}</p><a href="${article.url}" target="_blank">Read Article <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; margin-left:3px;"></i></a></div>`;
    });
  } catch(e) { 
    console.error("News feed error:", e);
    container.innerHTML = '<div style="text-align:center; color: #ff4757; padding: 20px;">Failed to load news feed. Please check your connection.</div>'; 
  }
}

// PROFILE LISTENER
function startMyProfileListener(uid) {
  if(myProfileUnsubscribe) myProfileUnsubscribe();
  myProfileUnsubscribe = onSnapshot(doc(db, "users", uid), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (myUserData && data.chatMeta) {
        for (let otherUid in data.chatMeta) {
          let newMeta = data.chatMeta[otherUid];
          let oldMeta = myUserData.chatMeta ? myUserData.chatMeta[otherUid] : null;

          if (newMeta.unread && (!oldMeta || oldMeta.time !== newMeta.time)) {
            if (currentChatId && targetUserUid === otherUid) {
              updateDoc(doc(db, "users", uid), { [`chatMeta.${otherUid}.unread`]: false });
            } else {
              const sender = allUsers.find(u => u.id === otherUid);
              const sName = sender ? (sender.fullName || sender.username) : "Someone";
              const sAvatar = generateAvatar(sender, sName);
              let preview = newMeta.text;
              if(preview === "🎮 GAME CHALLENGE") {
                  showToast(`Game Request!`, `${sName} challenged you to a game.`, sAvatar);
              } else {
                  if (preview.startsWith("U2Fz")) preview = decryptMessage(preview, uid < otherUid ? `${uid}_${otherUid}` : `${otherUid}_${uid}`) || "New encrypted message";
                  showToast(`New Message from ${sName}`, preview, sAvatar);
              }
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

// --- 8. SIDEBAR & SORTING ---
function loadSidebarData() {
  onSnapshot(collection(db, "users"), (snapshot) => {
    allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSidebar();
  });
  onSnapshot(collection(db, "groups"), (snapshot) => {
    allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderSidebar();
  });
}

function renderSidebar() {
  usersList.innerHTML = "";
  allGroups.forEach(group => {
    if (!group.members.includes(auth.currentUser.uid)) return; 
    const groupCard = document.createElement("div");
    groupCard.className = "user-item";
    groupCard.innerHTML = `<div class="avatar-wrapper"><div class="avatar" style="background:var(--primary); display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; font-size:18px;">${group.name.charAt(0)}</div></div><div class="user-meta"><span class="name">${group.name}</span><span class="handle">${group.members.length} members</span></div>`;
    groupCard.onclick = () => openGroupChat(group.id, group.name, group.members.length);
    usersList.appendChild(groupCard);
  });

  let sortedUsers = [...allUsers].filter(u => u.id !== auth.currentUser.uid);
  sortedUsers.sort((a, b) => {
    let timeA = myUserData?.chatMeta?.[a.id]?.time || 0;
    let timeB = myUserData?.chatMeta?.[b.id]?.time || 0;
    return timeB - timeA; 
  });

  sortedUsers.forEach((user) => {
    const displayName = user.fullName || user.username;
    const avatarUrl = generateAvatar(user, displayName);
    const isOnline = user.isOnline ? "online" : "";
    const meta = myUserData?.chatMeta?.[user.id];
    const unreadStyle = meta?.unread ? "font-weight:700; color:var(--primary);" : "";
    
    let previewText = meta?.text ? meta.text : `@${user.username}`;
    if (previewText.startsWith("U2Fz")) previewText = "🔒 Encrypted Message";

    const userCard = document.createElement("div");
    userCard.className = "user-item";
    userCard.innerHTML = `<div class="avatar-wrapper"><img src="${avatarUrl}" class="avatar"><div class="status-dot ${isOnline}"></div></div><div class="user-meta" style="flex:1; min-width:0;"><span class="name" style="${unreadStyle}">${displayName}</span><span class="handle" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; ${unreadStyle}">${previewText}</span></div>${meta?.unread ? '<div style="width:10px; height:10px; background:var(--primary); border-radius:50%;"></div>' : ''}`;

    userCard.onclick = () => {
      if(meta?.unread) updateDoc(doc(db, "users", auth.currentUser.uid), { [`chatMeta.${user.id}.unread`]: false });
      openChat(user.id, displayName, avatarUrl, user.isOnline, user.lastSeen);
    }
    usersList.appendChild(userCard);
  });
}

document.getElementById("createGroupBtn").addEventListener("click", () => {
  const groupName = prompt("Enter a name for the new Group:");
  if (!groupName) return;
  let promptText = "Select members by typing their numbers:\n\n";
  const selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid);
  selectableUsers.forEach((u, index) => { promptText += `${index + 1}. ${u.fullName || u.username}\n`; });
  const selections = prompt(promptText);
  if (!selections) return;
  let members = [auth.currentUser.uid]; 
  selections.split(',').forEach(numText => {
    const idx = parseInt(numText.trim()) - 1;
    if (selectableUsers[idx]) members.push(selectableUsers[idx].id);
  });
  if (members.length > 1) { 
    addDoc(collection(db, "groups"), { name: groupName, members: members, createdAt: Date.now(), createdBy: auth.currentUser.uid }); 
    showToast("Group Created", `${groupName} was created successfully.`); 
  } 
  else { alert("You must add at least one other person."); }
});

if (backToUsersBtn) {
  backToUsersBtn.addEventListener("click", () => { 
    if (window.innerWidth <= 992) { sidebar.classList.remove("hidden"); activeChatState.style.display = "none"; emptyChatState.style.display = "flex"; } 
  });
}

// Navigation Fix: Hardware Back Button
window.addEventListener("popstate", (e) => {
  if (window.innerWidth <= 992) {
    if (sidebar.classList.contains("hidden")) {
      sidebar.classList.remove("hidden");
      activeChatState.style.display = "none";
      emptyChatState.style.display = "flex";
      document.getElementById("reelsArea").style.display = "none";
      document.getElementById("activeGameArea").style.display = "none"; 
      isPlayingActionGame = false;
    }
  }
});

// --- 9. CHAT ENGINE ---
function openChat(targetUid, targetName, targetAvatar, isTargetOnline, targetLastSeen) {
  isCurrentChatGroup = false;
  const myUid = auth.currentUser.uid;
  currentChatId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
  targetUserUid = targetUid;
  
  document.getElementById("launchGameMenuBtn").style.display = "block";
  document.getElementById("chatBox").innerHTML = ""; 
  if(replyingToMsg) document.getElementById("cancelReplyBtn").click();

  document.getElementById("chatTargetName").innerText = targetName;
  document.getElementById("chatTargetAvatar").src = targetAvatar;
  const targetStatus = document.getElementById("chatTargetStatus");
  
  if (isTargetOnline) { targetStatus.classList.add('online'); targetStatus.innerText = "Online"; } 
  else { targetStatus.classList.remove('online'); targetStatus.innerText = `Last seen: ${timeAgo(targetLastSeen)}`; }
  
  emptyChatState.style.display = "none"; activeChatState.style.display = "flex";
  if(window.innerWidth <= 992) { sidebar.classList.add("hidden"); history.pushState({ page: "chat" }, ""); }
  loadMessages(); listenToTyping();
}

function openGroupChat(groupId, groupName, memberCount) {
  isCurrentChatGroup = true; currentChatId = groupId; targetUserUid = null;
  document.getElementById("launchGameMenuBtn").style.display = "none";
  
  document.getElementById("chatBox").innerHTML = "";
  if(replyingToMsg) document.getElementById("cancelReplyBtn").click();

  document.getElementById("chatTargetName").innerText = groupName;
  document.getElementById("chatTargetAvatar").src = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=8b5cf6&color=fff`;
  document.getElementById("chatTargetStatus").innerText = `${memberCount} members`;
  
  emptyChatState.style.display = "none"; activeChatState.style.display = "flex";
  if(window.innerWidth <= 992) { sidebar.classList.add("hidden"); history.pushState({ page: "chat" }, ""); }
  loadMessages();
}

function loadMessages() {
  if (messagesUnsubscribe) messagesUnsubscribe(); 
  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("time", "asc"));
  
  messagesUnsubscribe = onSnapshot(q, (snapshot) => {
    chatBox.innerHTML = "";
    
    snapshot.forEach(docSnap => {
      const msg = docSnap.data();
      const msgId = docSnap.id;
      const isMe = msg.sender === auth.currentUser.uid;
      
      if (msg.deletedFor && msg.deletedFor.includes(auth.currentUser.uid)) return;

      const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const div = document.createElement("div");
      div.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
      
      let contentHtml = "";

      if (msg.isGameChallenge) {
          const gameNames = { "tictactoe": "Tic Tac Toe", "rps": "Rock Paper Scissors", "jetfighter": "Jet Fighter", "carracing": "Car Racing" };
          const gameTitle = gameNames[msg.gameType] || "a Game";
          
          if (isMe) {
              contentHtml = `<div class="challenge-bubble"><h4>🎮 Challenge Sent</h4><p>Waiting for opponent to accept ${gameTitle}...</p></div>`;
          } else {
              contentHtml = `
                <div class="challenge-bubble">
                  <h4>🎮 Game Request</h4><p>Wants to play <b>${gameTitle}</b></p>
                  <div class="challenge-actions">
                     <button class="btn-accept" onclick="acceptGameChallenge('${msg.gameId}', '${msg.gameType}')">Accept</button>
                  </div>
                </div>`;
          }
      } else if (msg.isDeleted) {
        contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`;
      } else {
        let decryptedText = decryptMessage(msg.text, currentChatId);
        let replyHtml = msg.replyToText ? `<div class="replied-msg-box"><b>${msg.replyToName}</b><br>${decryptMessage(msg.replyToText, currentChatId)}</div>` : "";
        let imgHtml = msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width:100%; border-radius:12px; margin-bottom:8px; cursor:pointer;" onclick="window.open('${msg.imageUrl}')" />` : "";
        let groupSenderHtml = (isCurrentChatGroup && !isMe) ? `<div style="font-size:11px; color:var(--primary); font-weight:600; margin-bottom:4px;">${msg.senderName}</div>` : "";
        
        let safeText = decryptedText ? decryptedText.replace(/'/g, "\\'") : 'Image';
        let safeName = isMe ? 'You' : (msg.senderName ? msg.senderName.replace(/'/g, "\\'") : document.getElementById('chatTargetName').innerText.replace(/'/g, "\\'"));

        contentHtml = `
          <div class="msg-bubble" ondblclick="initReply('${msgId}', '${safeText}', '${safeName}')">
            ${groupSenderHtml}${replyHtml}${imgHtml}
            ${decryptedText} ${msg.isEdited ? '<span style="font-size:10px; opacity:0.5;"> (edited)</span>' : ''}
            <i class="fa-solid fa-ellipsis-vertical msg-options" title="Options" onclick="openMessageOptions('${msgId}', '${safeText}', ${isMe})"></i>
          </div>
        `;
      }
      
      let avatarSrc = isCurrentChatGroup && !isMe ? generateAvatar(allUsers.find(u=>u.id===msg.sender), msg.senderName) : document.getElementById('chatTargetAvatar').src;
      
      div.innerHTML = `
        ${!isMe ? `<img src="${avatarSrc}" class="msg-avatar">` : ''}
        <div style="display:flex; flex-direction:column;">
          ${contentHtml}<div class="msg-time">${timeStr}</div>
        </div>
        ${isMe ? `<img src="${document.getElementById('myAvatar').src}" class="msg-avatar">` : ''}
      `;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

window.initReply = (msgId, text, name) => { replyingToMsg = { id: msgId, text: text, name: name }; document.getElementById("replyPreviewName").innerText = `Replying to ${name}`; document.getElementById("replyPreviewText").innerText = text; document.getElementById("replyPreviewContainer").style.display = "flex"; msgInput.focus(); };
document.getElementById("cancelReplyBtn").addEventListener("click", () => { replyingToMsg = null; document.getElementById("replyPreviewContainer").style.display = "none"; });

window.openMessageOptions = async (msgId, currentText, isMe) => {
  const msgRef = doc(db, "chats", currentChatId, "messages", msgId);
  if (isMe) {
    const action = prompt("Message Options:\n1. Edit\n2. Delete for Everyone\n3. Delete for Me", "1");
    if (action === "1") { 
      const newText = prompt("Edit message:", currentText); 
      if (newText && newText !== currentText) await updateDoc(msgRef, { text: encryptMessage(newText, currentChatId), isEdited: true }); 
    } 
    else if (action === "2") { if(confirm("Delete for everyone?")) await updateDoc(msgRef, { isDeleted: true, text: "" }); } 
    else if (action === "3") { await updateDoc(msgRef, { deletedFor: arrayUnion(auth.currentUser.uid) }); }
  } else { if(confirm("Delete this message for yourself?")) await updateDoc(msgRef, { deletedFor: arrayUnion(auth.currentUser.uid) }); }
};

function listenToTyping() {
  if (chatMetaUnsubscribe) chatMetaUnsubscribe();
  if (isCurrentChatGroup) return; 
  chatMetaUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (docSnap) => {
    if (docSnap.exists() && docSnap.data()[`typing_${targetUserUid}`]) { document.getElementById("chatTargetStatus").innerText = "typing..."; } 
    else { 
      const targetUser = allUsers.find(u => u.id === targetUserUid); 
      if (targetUser && targetUser.isOnline) { document.getElementById("chatTargetStatus").innerText = "Online"; } 
      else if (targetUser) { document.getElementById("chatTargetStatus").innerText = `Last seen: ${timeAgo(targetUser.lastSeen)}`; } 
    }
  });
}

msgInput.addEventListener("input", async () => {
  if(!currentChatId || isCurrentChatGroup) return;
  await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: true }, { merge: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => { await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true }); }, 1500);
});

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = ""; msgInput.focus(); 
  
  const encryptedText = encryptMessage(text, currentChatId);

  if (!isCurrentChatGroup) {
    await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true });
    try {
      await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { time: Date.now(), text: `You: ${text}`, unread: false } } }, { merge: true });
      await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: encryptedText, unread: true } } }, { merge: true });
    } catch(err) { console.error("Error updating chat meta:", err); }
  }

  const payload = { text: encryptedText, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false, isGameChallenge: false };
  if (replyingToMsg) { payload.replyToId = replyingToMsg.id; payload.replyToText = encryptMessage(replyingToMsg.text, currentChatId); payload.replyToName = replyingToMsg.name; document.getElementById("cancelReplyBtn").click(); }
  
  try {
    await addDoc(collection(db, "chats", currentChatId, "messages"), payload);
  } catch (e) {
    console.error("Message send error:", e);
    showToast("Error", "Message failed to send. Please check your connection.", "https://cdn-icons-png.flaticon.com/512/564/564619.png");
  }
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
searchInput.addEventListener("input", (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll(".user-item").forEach(item => { item.style.display = item.innerText.toLowerCase().includes(term) ? "flex" : "none"; }); });

// --- 10. REAL-TIME GAMES LOGIC (MULTIPLAYER) ---
const launchGameMenuBtn = document.getElementById("launchGameMenuBtn");
const gameSelectionModal = document.getElementById("gameSelectionModal");
const closeGameSelectBtn = document.getElementById("closeGameSelectBtn");
const activeGameArea = document.getElementById("activeGameArea");
const closeGameBtn = document.getElementById("closeGameBtn");
const gameUIContainer = document.getElementById("gameUIContainer");

launchGameMenuBtn.addEventListener("click", () => { gameSelectionModal.style.display = "flex"; });
closeGameSelectBtn.addEventListener("click", () => { gameSelectionModal.style.display = "none"; });

document.querySelectorAll(".game-select-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
        const gameType = btn.getAttribute("data-game");
        const gameId = `game_${Date.now()}_${auth.currentUser.uid}`;
        gameSelectionModal.style.display = "none";

        await setDoc(doc(db, "games", gameId), {
            type: gameType,
            status: "waiting",
            player1: auth.currentUser.uid,
            player2: targetUserUid,
            createdAt: Date.now(),
            board: ["","","","","","","","",""],
            turn: auth.currentUser.uid,
            winner: null,
            p1Choice: null,
            p2Choice: null,
            p1Score: null,
            p2Score: null
        });

        await addDoc(collection(db, "chats", currentChatId, "messages"), {
            sender: auth.currentUser.uid,
            time: Date.now(),
            isGameChallenge: true,
            gameType: gameType,
            gameId: gameId,
            isDeleted: false
        });
        
        await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎮 GAME CHALLENGE", unread: true } } }, { merge: true });
        joinGameRoom(gameId, gameType);
    });
});

window.acceptGameChallenge = async (gameId, gameType) => {
    await updateDoc(doc(db, "games", gameId), { status: "playing" });
    joinGameRoom(gameId, gameType);
};

closeGameBtn.addEventListener("click", () => {
    if(currentAnimationId) cancelAnimationFrame(currentAnimationId);
    
    if (singlePlayerMode) {
        singlePlayerMode = false;
        spTttActive = false; // Kill local bot if running
        // FIX FOR MOBILE: Un-hide sidebar when returning to Arcade Zone
        if (window.innerWidth <= 992) {
            sidebar.classList.remove("hidden");
        }
    } else {
        if(gameUnsubscribe) gameUnsubscribe();
        if(currentGameId) { updateDoc(doc(db, "games", currentGameId), { status: "abandoned" }); }
    }
    
    activeGameArea.style.display = "none";
    currentGameId = null;
    isPlayingActionGame = false;
});

function joinGameRoom(gameId, gameType) {
    currentGameId = gameId;
    isPlayingActionGame = false;
    singlePlayerMode = false;
    activeGameArea.style.display = "flex";
    
    let gTitle = "Game";
    if (gameType === 'tictactoe') gTitle = "Tic Tac Toe";
    if (gameType === 'rps') gTitle = "Rock Paper Scissors";
    if (gameType === 'jetfighter') gTitle = "Jet Fighter";
    if (gameType === 'carracing') gTitle = "Car Racing";
    document.getElementById("activeGameTitle").innerText = gTitle;
    
    if(gameUnsubscribe) gameUnsubscribe();

    gameUnsubscribe = onSnapshot(doc(db, "games", gameId), (docSnap) => {
        if(!docSnap.exists()) return;
        const data = docSnap.data();
        if(data.status === "abandoned") {
            gameUIContainer.innerHTML = `<h3 style="color:var(--accent);">Opponent left the game.</h3>`;
            isPlayingActionGame = false;
            return;
        }
        if(data.status === "waiting") {
            gameUIContainer.innerHTML = `<h3>Waiting for opponent... <i class="fa-solid fa-spinner fa-spin"></i></h3>`;
            isPlayingActionGame = false;
            return;
        }
        if (data.type === 'tictactoe') renderTicTacToe(data, gameId);
        if (data.type === 'rps') renderRPS(data, gameId);
        if (data.type === 'jetfighter') renderActionGame(data, gameId, 'jetfighter');
        if (data.type === 'carracing') renderActionGame(data, gameId, 'carracing');
    });
}

// --- 11. SINGLE PLAYER GAMES (VS COMPUTER / HIGH SCORE) ---

window.startSinglePlayer = (gameType) => {
    singlePlayerMode = true;
    currentGameId = null;
    if (window.innerWidth <= 992) sidebar.classList.add("hidden");
    activeGameArea.style.display = "flex";
    
    if (gameType === 'tictactoe') { spTttReset(); }
    else if (gameType === 'rps') { renderSinglePlayerRPS(); }
    else if (gameType === 'jetfighter' || gameType === 'carracing') { renderSinglePlayerAction(gameType); }
};

// --- Single Player: Tic Tac Toe ---
let spTttBoard = ["","","","","","","","",""];
let spTttActive = true;

window.renderSinglePlayerTTT = () => {
    document.getElementById("activeGameTitle").innerText = "Tic Tac Toe (Solo)";
    let html = `<div class="game-turn-indicator">You vs Computer</div><div class="ttt-board">`;
    spTttBoard.forEach((cell, i) => {
        const cellClass = cell === 'X' ? 'x' : (cell === 'O' ? 'o' : '');
        html += `<div class="ttt-cell ${cellClass}" onclick="spTttMove(${i})">${cell}</div>`;
    });
    html += `</div>`;
    if(!spTttActive) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="spTttReset()">Play Again</button>`;
    gameUIContainer.innerHTML = html;
};

window.spTttMove = (i) => {
    if(!spTttActive || spTttBoard[i] !== "") return;
    spTttBoard[i] = "X";
    if(checkTttWin(spTttBoard, "X")) { spTttEnd("🎉 You Won!"); return; }
    if(!spTttBoard.includes("")) { spTttEnd("It's a Draw!"); return; }
    
    // Bot move
    let empty = spTttBoard.map((c, idx) => c === "" ? idx : null).filter(c => c !== null);
    if(empty.length > 0) {
        let botMove = empty[Math.floor(Math.random() * empty.length)];
        spTttBoard[botMove] = "O";
        if(checkTttWin(spTttBoard, "O")) { spTttEnd("😞 Computer Won!"); return; }
        if(!spTttBoard.includes("")) { spTttEnd("It's a Draw!"); return; }
    }
    renderSinglePlayerTTT();
};

function checkTttWin(board, player) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    return lines.some(line => line.every(idx => board[idx] === player));
}

function spTttEnd(msg) {
    spTttActive = false;
    renderSinglePlayerTTT();
    document.querySelector('.game-turn-indicator').innerText = msg;
}

window.spTttReset = () => { spTttBoard = ["","","","","","","","",""]; spTttActive = true; renderSinglePlayerTTT(); };


// --- Single Player: Rock Paper Scissors ---
window.renderSinglePlayerRPS = () => {
    document.getElementById("activeGameTitle").innerText = "RPS (Solo)";
    let html = `
    <div class="game-turn-indicator">Make your choice!</div>
    <div class="rps-controls">
        <button class="rps-btn" onclick="spRpsMove('rock')"><i class="fa-solid fa-hand-back-fist"></i></button>
        <button class="rps-btn" onclick="spRpsMove('paper')"><i class="fa-solid fa-hand"></i></button>
        <button class="rps-btn" onclick="spRpsMove('scissors')"><i class="fa-solid fa-hand-scissors"></i></button>
    </div>`;
    gameUIContainer.innerHTML = html;
};

window.spRpsMove = (choice) => {
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result = "It's a Tie!";
    
    if (
        (choice === 'rock' && botChoice === 'scissors') ||
        (choice === 'paper' && botChoice === 'rock') ||
        (choice === 'scissors' && botChoice === 'paper')
    ) {
        result = "🎉 You Won!";
    } else if (choice !== botChoice) {
        result = "😞 Computer Won!";
    }
    
    const icons = { rock: "fa-hand-back-fist", paper: "fa-hand", scissors: "fa-hand-scissors" };
    let html = `
    <div class="game-turn-indicator">${result}</div>
    <div class="rps-arena">
        <div class="rps-player"><span>You</span><div class="rps-choice-display"><i class="fa-solid ${icons[choice]}"></i></div></div>
        <div class="vs-badge">VS</div>
        <div class="rps-player"><span>Computer</span><div class="rps-choice-display"><i class="fa-solid ${icons[botChoice]}" style="color: #10b981;"></i></div></div>
    </div>
    <button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="renderSinglePlayerRPS()">Play Again</button>`;
    gameUIContainer.innerHTML = html;
};


// --- Single Player: Action Games (High Score logic) ---
let spGameType = '';
let spHighScore = 0;

window.renderSinglePlayerAction = async (gameType) => {
    spGameType = gameType;
    document.getElementById("activeGameTitle").innerText = gameType === 'carracing' ? "Car Racing (Solo)" : "Jet Fighter (Solo)";
    gameUIContainer.innerHTML = `<h3>Loading High Score... <i class="fa-solid fa-spinner fa-spin"></i></h3>`;
    
    try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const data = userDoc.data();
        // Check if highScores exists in DB
        spHighScore = (data && data.highScores && data.highScores[gameType]) ? data.highScores[gameType] : 0;
    } catch(e) { spHighScore = 0; }
    
    showSpActionMenu();
};

window.showSpActionMenu = () => {
    isPlayingActionGame = false;
    gameUIContainer.innerHTML = `
        <div class="game-turn-indicator" style="margin-bottom: 5px;">Beat your High Score!</div>
        <div style="font-size: 16px; color: var(--accent); margin-bottom: 15px; font-weight:bold;">High Score: ${spHighScore}</div>
        <div class="action-game-container">
            <div style="position: relative; width: 100%; max-width: 300px;">
                <canvas id="actionCanvas" width="300" height="400" class="action-canvas" style="margin: 0;"></canvas>
                <div id="startOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.6); border-radius:12px; z-index:10;">
                     <button class="primary-btn glow-btn" id="btnStartGame" style="width:auto; padding:15px 40px; font-size: 16px;">Play Now</button>
                </div>
            </div>
            <div class="game-btn-row" id="gameControls" style="display:none;">
                <button class="game-control-btn" id="btnLeft">⬅️</button>
                <button class="game-control-btn" id="btnRight">➡️</button>
            </div>
        </div>
    `;

    // Draw the initial preview frame so it's not a black box!
    const canvas = document.getElementById('actionCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (spGameType === 'carracing') {
            ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50); // Preview Car
        } else {
            ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill(); // Preview Jet
        }
    }
    
    document.getElementById('btnStartGame').addEventListener('click', () => {
        isPlayingActionGame = true;
        document.getElementById('startOverlay').style.display = 'none';
        document.getElementById('gameControls').style.display = 'flex';
        
        if (spGameType === 'carracing') startCarRacing(null, true);
        else startJetFighter(null, true);
    });
};

window.handleSpActionGameOver = async (score) => {
    let isNewHighScore = false;
    if (score > spHighScore) {
        spHighScore = score;
        isNewHighScore = true;
        try {
            // FIX FOR DB SAVE: SetDoc with Merge ensures it never fails if the nested field didn't exist before.
            await setDoc(doc(db, "users", auth.currentUser.uid), { 
                highScores: { [spGameType]: score } 
            }, { merge: true });
        } catch(e) { console.error("High score save failed", e); }
    }
    
    gameUIContainer.innerHTML = `
        <div class="game-turn-indicator" style="color:${isNewHighScore ? 'var(--primary)' : 'white'}">${isNewHighScore ? '🏆 NEW HIGH SCORE!' : 'GAME OVER'}</div>
        <div style="font-size: 24px; text-align: center; margin: 20px 0;">
            Your Score: <b style="color:var(--primary)">${score}</b><br>
            High Score: <b style="color:var(--accent)">${spHighScore}</b>
        </div>
        <button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="showSpActionMenu()">Play Again</button>
    `;
};


// --- MULTIPLAYER ACTION & BOARD RENDERING ---
function renderActionGame(data, gameId, gameType) {
    const isPlayer1 = data.player1 === auth.currentUser.uid;
    const myScore = isPlayer1 ? data.p1Score : data.p2Score;
    const oppScore = isPlayer1 ? data.p2Score : data.p1Score;

    if (myScore !== undefined && myScore !== null && oppScore !== undefined && oppScore !== null) {
        isPlayingActionGame = false;
        let statusText = "It's a Tie!";
        if (myScore > oppScore) statusText = "🎉 You Won!";
        else if (myScore < oppScore) statusText = "😞 You Lost!";
        
        gameUIContainer.innerHTML = `
            <div class="game-turn-indicator">${statusText}</div>
            <div style="font-size: 24px; text-align: center; margin: 20px 0;">
                Your Score: <b style="color:var(--primary)">${myScore}</b><br>
                Opponent's Score: <b style="color:var(--accent)">${oppScore}</b>
            </div>
            <button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetActionGame('${gameId}')">Play Again</button>
        `;
        return;
    }

    if (myScore !== undefined && myScore !== null) {
        isPlayingActionGame = false;
        gameUIContainer.innerHTML = `
            <div class="game-turn-indicator">Waiting for opponent to finish...</div>
            <div style="font-size: 20px; text-align: center; margin: 20px 0;">
                Your Score: <b style="color:var(--primary)">${myScore}</b>
            </div>
        `;
        return;
    }

    if (isPlayingActionGame) return;

    gameUIContainer.innerHTML = `
        <div class="game-turn-indicator" style="margin-bottom: 5px;">High Score Challenge!</div>
        <div class="action-game-container">
            <div style="position: relative; width: 100%; max-width: 300px;">
                <canvas id="actionCanvas" width="300" height="400" class="action-canvas" style="margin: 0;"></canvas>
                <div id="startOverlay" style="position: absolute; top:0; left:0; width:100%; height:100%; display:flex; justify-content:center; align-items:center; background:rgba(0,0,0,0.6); border-radius:12px; z-index:10; flex-direction:column; gap:10px;">
                     <span style="color:white; font-size:14px;">Opponent is ready!</span>
                     <button class="primary-btn glow-btn" id="btnStartGame" style="width:auto; padding:15px 40px; font-size: 16px;">Play Now</button>
                </div>
            </div>
            <div class="game-btn-row" id="gameControls" style="display:none;">
                <button class="game-control-btn" id="btnLeft">⬅️</button>
                <button class="game-control-btn" id="btnRight">➡️</button>
            </div>
        </div>
    `;

    const canvas = document.getElementById('actionCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (gameType === 'carracing') {
            ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50);
        } else {
            ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill();
        }
    }
    
    document.getElementById('btnStartGame').addEventListener('click', () => {
        isPlayingActionGame = true;
        document.getElementById('startOverlay').style.display = 'none';
        document.getElementById('gameControls').style.display = 'flex';
        
        if (gameType === 'carracing') startCarRacing(gameId, isPlayer1);
        else startJetFighter(gameId, isPlayer1);
    });
}

window.resetActionGame = async (gameId) => {
    await updateDoc(doc(db, "games", gameId), { p1Score: null, p2Score: null });
};

// --- CORE GAME LOOPS (Used by both Multi and Solo modes) ---

function startCarRacing(gameId, isPlayer1) {
    const canvas = document.getElementById('actionCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let carX = 135; 
    const carWidth = 30;
    const carHeight = 50;
    let score = 0;
    let obstacles = [];
    let gameSpeed = 3;
    let isGameOver = false;

    // DESKTOP KEYBOARD CONTROLS
    const handleKeyDown = (e) => {
        if(!isPlayingActionGame) return;
        if(e.key === 'ArrowLeft' && carX > 35) carX -= 100;
        if(e.key === 'ArrowRight' && carX < 235) carX += 100;
    };
    window.addEventListener('keydown', handleKeyDown);

    function drawCar(x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, carWidth, carHeight);
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 5, y + 5, 5, 15);
        ctx.fillRect(x + carWidth, y + 5, 5, 15);
        ctx.fillRect(x - 5, y + 30, 5, 15);
        ctx.fillRect(x + carWidth, y + 30, 5, 15);
    }

    function gameLoop() {
        if(isGameOver) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#555';
        ctx.setLineDash([20, 20]);
        ctx.beginPath(); ctx.moveTo(100, 0); ctx.lineTo(100, 400); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(200, 0); ctx.lineTo(200, 400); ctx.stroke();
        ctx.setLineDash([]);

        drawCar(carX, 330, '#8b5cf6');

        if(Math.random() < 0.02 + (score/20000)) {
            const lanes = [35, 135, 235];
            const lane = lanes[Math.floor(Math.random() * lanes.length)];
            if (!obstacles.some(o => Math.abs(o.y - (-50)) < 150 && o.x === lane)) {
                 obstacles.push({ x: lane, y: -50, width: 30, height: 50 });
            }
        }

        for(let i=0; i<obstacles.length; i++) {
            let obs = obstacles[i];
            obs.y += gameSpeed;
            drawCar(obs.x, obs.y, '#ec4899');

            if (carX < obs.x + obs.width && carX + carWidth > obs.x &&
                330 < obs.y + obs.height && 330 + carHeight > obs.y) {
                gameOver();
            }
        }
        obstacles = obstacles.filter(o => o.y < 450);

        score++;
        if(score % 500 === 0) gameSpeed += 0.5;

        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Inter';
        ctx.fillText('Score: ' + Math.floor(score/10), 10, 25);

        currentAnimationId = requestAnimationFrame(gameLoop);
    }

    function gameOver() {
        isGameOver = true;
        isPlayingActionGame = false;
        window.removeEventListener('keydown', handleKeyDown); // Cleanup keys
        if(currentAnimationId) cancelAnimationFrame(currentAnimationId);
        
        const finalScore = Math.floor(score/10);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Inter';
        ctx.fillText('CRASHED!', 100, 180);
        ctx.fillText('Score: ' + finalScore, 100, 220);

        setTimeout(() => {
            if (singlePlayerMode) {
                handleSpActionGameOver(finalScore);
            } else {
                const field = isPlayer1 ? 'p1Score' : 'p2Score';
                updateDoc(doc(db, "games", gameId), { [field]: finalScore });
            }
        }, 1500);
    }

    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); if(carX > 35) carX -= 100; };
    btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); if(carX < 235) carX += 100; };

    gameLoop();
}

function startJetFighter(gameId, isPlayer1) {
    const canvas = document.getElementById('actionCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let jetX = 135;
    const jetSize = 30;
    let bullets = [];
    let enemies = [];
    let score = 0;
    let isGameOver = false;
    let isMovingLeft = false;
    let isMovingRight = false;

    // DESKTOP KEYBOARD CONTROLS
    const handleKeyDown = (e) => {
        if(!isPlayingActionGame) return;
        if(e.key === 'ArrowLeft') isMovingLeft = true;
        if(e.key === 'ArrowRight') isMovingRight = true;
        if(e.key === ' ' || e.key === 'ArrowUp') { 
            e.preventDefault(); // Stop page scroll
            bullets.push({ x: jetX + jetSize/2 - 2, y: 350 }); 
        }
    };
    const handleKeyUp = (e) => {
        if(!isPlayingActionGame) return;
        if(e.key === 'ArrowLeft') isMovingLeft = false;
        if(e.key === 'ArrowRight') isMovingRight = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    function drawJet(x, y, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + jetSize/2, y);
        ctx.lineTo(x + jetSize, y + jetSize);
        ctx.lineTo(x, y + jetSize);
        ctx.fill();
    }

    function gameLoop() {
        if(isGameOver) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Movement
        if(isMovingLeft && jetX > 0) jetX -= 5;
        if(isMovingRight && jetX < canvas.width - jetSize) jetX += 5;

        // Stars
        ctx.fillStyle = 'white';
        for(let i=0; i<3; i++) {
            ctx.fillRect(Math.random()*canvas.width, Math.random()*canvas.height, 2, 2);
        }

        drawJet(jetX, 350, '#10b981');

        // Bullets
        ctx.fillStyle = '#f59e0b';
        for(let i=0; i<bullets.length; i++) {
            bullets[i].y -= 7;
            ctx.fillRect(bullets[i].x, bullets[i].y, 4, 10);
        }
        bullets = bullets.filter(b => b.y > 0);

        // Enemies
        if(Math.random() < 0.03 + (score/10000)) {
            enemies.push({ x: Math.random() * (canvas.width - 20), y: -20, size: 20 });
        }

        for(let i=0; i<enemies.length; i++) {
            let e = enemies[i];
            e.y += 2.5;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x, e.y, e.size, e.size);

            // Collision with bullet
            for(let j=0; j<bullets.length; j++) {
                let b = bullets[j];
                if(b.x > e.x && b.x < e.x + e.size && b.y > e.y && b.y < e.y + e.size) {
                    e.dead = true;
                    b.dead = true;
                    score += 10;
                }
            }

            // Collision with player
            if (jetX < e.x + e.size && jetX + jetSize > e.x &&
                350 < e.y + e.size && 350 + jetSize > e.y) {
                gameOver();
            }
        }
        enemies = enemies.filter(e => !e.dead && e.y < 450);
        bullets = bullets.filter(b => !b.dead);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Inter';
        ctx.fillText('Score: ' + score, 10, 25);

        currentAnimationId = requestAnimationFrame(gameLoop);
    }

    function gameOver() {
        isGameOver = true;
        isPlayingActionGame = false;
        window.removeEventListener('keydown', handleKeyDown); // Cleanup keys
        window.removeEventListener('keyup', handleKeyUp);
        if(currentAnimationId) cancelAnimationFrame(currentAnimationId);
        
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px Inter';
        ctx.fillText('DESTROYED!', 90, 180);
        ctx.fillText('Score: ' + score, 105, 220);

        setTimeout(() => {
            if (singlePlayerMode) {
                handleSpActionGameOver(score);
            } else {
                const field = isPlayer1 ? 'p1Score' : 'p2Score';
                updateDoc(doc(db, "games", gameId), { [field]: score });
            }
        }, 1500);
    }

    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    
    btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); isMovingLeft = true; };
    btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = (e) => { e.preventDefault(); isMovingLeft = false; };
    btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); isMovingRight = true; };
    btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = (e) => { e.preventDefault(); isMovingRight = false; };

    if(!document.getElementById('btnShoot')) {
        const btnShoot = document.createElement('button');
        btnShoot.id = 'btnShoot';
        btnShoot.className = 'game-control-btn';
        btnShoot.style.background = 'rgba(236, 72, 153, 0.2)';
        btnShoot.style.borderColor = 'var(--accent)';
        btnShoot.innerText = '🔥';
        document.getElementById('gameControls').appendChild(btnShoot);

        btnShoot.onmousedown = btnShoot.ontouchstart = (e) => {
            e.preventDefault();
            bullets.push({ x: jetX + jetSize/2 - 2, y: 350 });
        };
    }

    gameLoop();
}

function renderTicTacToe(data, gameId) {
    const isMyTurn = data.turn === auth.currentUser.uid;
    const mySymbol = data.player1 === auth.currentUser.uid ? "X" : "O";
    let turnText = data.winner ? 
        (data.winner === 'draw' ? "It's a Draw!" : (data.winner === auth.currentUser.uid ? "🎉 You Won!" : "😞 You Lost!")) :
        (isMyTurn ? "Your Turn" : "Opponent's Turn");

    let html = `<div class="game-turn-indicator" style="color: ${isMyTurn && !data.winner ? 'var(--primary)' : 'white'}">${turnText}</div>`;
    html += `<div class="ttt-board">`;
    data.board.forEach((cell, index) => {
        const cellClass = cell === 'X' ? 'x' : (cell === 'O' ? 'o' : '');
        html += `<div class="ttt-cell ${cellClass}" onclick="makeMoveTTT(${index}, '${data.board[index]}', ${isMyTurn}, '${mySymbol}', '${data.winner}')">${cell}</div>`;
    });
    html += `</div>`;
    if(data.winner) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetTTT('${gameId}')">Play Again</button>`;
    gameUIContainer.innerHTML = html;
}

window.makeMoveTTT = async (index, currentVal, isMyTurn, mySymbol, winner) => {
    if(!isMyTurn || currentVal !== "" || winner || !currentGameId) return;
    const docRef = doc(db, "games", currentGameId);
    const snap = await getDoc(docRef);
    const data = snap.data();
    let newBoard = [...data.board];
    newBoard[index] = mySymbol;
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    let newWinner = null;
    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) newWinner = auth.currentUser.uid;
    }
    if(!newWinner && !newBoard.includes("")) newWinner = "draw";
    const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1;
    await updateDoc(docRef, { board: newBoard, turn: nextTurn, winner: newWinner });
};

window.resetTTT = async (gameId) => {
    const docRef = doc(db, "games", gameId);
    const snap = await getDoc(docRef);
    await updateDoc(docRef, { board: ["","","","","","","","",""], winner: null, turn: snap.data().player1 });
};

function renderRPS(data, gameId) {
    const isPlayer1 = data.player1 === auth.currentUser.uid;
    const myChoice = isPlayer1 ? data.p1Choice : data.p2Choice;
    const oppChoice = isPlayer1 ? data.p2Choice : data.p1Choice;
    let statusText = "Make your choice!";
    let bothSelected = data.p1Choice && data.p2Choice;
    if (bothSelected) {
        if (myChoice === oppChoice) statusText = "It's a Tie!";
        else if ((myChoice === 'rock' && oppChoice === 'scissors') || (myChoice === 'paper' && oppChoice === 'rock') || (myChoice === 'scissors' && oppChoice === 'paper')) statusText = "🎉 You Won!";
        else statusText = "😞 You Lost!";
    } else if (myChoice) statusText = "Waiting for opponent...";
    const icons = { rock: "fa-hand-back-fist", paper: "fa-hand", scissors: "fa-hand-scissors" };
    let html = `<div class="game-turn-indicator">${statusText}</div><div class="rps-arena"><div class="rps-player"><span>You</span><div class="rps-choice-display"><i class="fa-solid ${myChoice ? icons[myChoice] : 'fa-question'}"></i></div></div><div class="vs-badge">VS</div><div class="rps-player"><span>Opponent</span><div class="rps-choice-display"><i class="fa-solid ${bothSelected ? icons[oppChoice] : (oppChoice ? 'fa-check' : 'fa-question')}" style="color: ${oppChoice && !bothSelected ? '#10b981' : 'white'}"></i></div></div></div>`;
    if (!myChoice && !bothSelected) html += `<div class="rps-controls"><button class="rps-btn" onclick="makeMoveRPS('rock')"><i class="fa-solid fa-hand-back-fist"></i></button><button class="rps-btn" onclick="makeMoveRPS('paper')"><i class="fa-solid fa-hand"></i></button><button class="rps-btn" onclick="makeMoveRPS('scissors')"><i class="fa-solid fa-hand-scissors"></i></button></div>`;
    if(bothSelected) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetRPS('${gameId}')">Play Again</button>`;
    gameUIContainer.innerHTML = html;
}

window.makeMoveRPS = async (choice) => {
    if(!currentGameId) return;
    const docRef = doc(db, "games", currentGameId);
    const snap = await getDoc(docRef);
    const isPlayer1 = snap.data().player1 === auth.currentUser.uid;
    if (isPlayer1) await updateDoc(docRef, { p1Choice: choice });
    else await updateDoc(docRef, { p2Choice: choice });
};

window.resetRPS = async (gameId) => {
    await updateDoc(doc(db, "games", gameId), { p1Choice: null, p2Choice: null });
};

// --- YOUTUBE SHORTS (REELS) ---
const shortsBtn = document.getElementById("shortsBtn");
const reelsArea = document.getElementById("reelsArea");
const closeReels = document.getElementById("closeReels");
const reelsWrapper = document.getElementById("reelsWrapper");

shortsBtn.addEventListener("click", () => {
  reelsArea.style.display = "flex";
  if(window.innerWidth <= 992) sidebar.classList.add("hidden");
  loadYoutubeReels();
});

closeReels.addEventListener("click", () => {
  reelsArea.style.display = "none"; reelsWrapper.innerHTML = ""; 
  if(window.innerWidth <= 992) sidebar.classList.remove("hidden");
});

async function loadYoutubeReels() {
  reelsWrapper.innerHTML = "<p style='color:white; padding:20px; text-align:center;'><i class='fa-solid fa-spinner fa-spin'></i> Loading Shorts...</p>";
  try {
    const apiKey = typeof YOUTUBE_KEY !== 'undefined' ? YOUTUBE_KEY : "";
    if(!apiKey || apiKey.includes("AIzaSyA_jYFuW")) throw new Error("API_LIMIT"); 
    const topics = ["tech shorts", "coding memes", "funny gadgets"];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${randomTopic}&type=video&videoDuration=short&videoEmbeddable=true&key=${apiKey}`);
    const data = await res.json();
    if (data.error) throw new Error("API_LIMIT");
    reelsWrapper.innerHTML = "";
    const validItems = data.items.filter(item => item.id && item.id.videoId);
    if (validItems && validItems.length > 0) {
      validItems.forEach(item => { reelsWrapper.innerHTML += `<div class="reel-slide"><iframe src="https://www.youtube.com/embed/${item.id.videoId}?autoplay=0&controls=0&modestbranding=1&loop=1&playlist=${item.id.videoId}" allow="autoplay" allowfullscreen></iframe></div>`; });
    }
  } catch(e) { 
    const fallbackIds = ['dQw4w9WgXcQ', '2Vv-BfVoq4g', 'jNQXAC9IVRw']; 
    reelsWrapper.innerHTML = "";
    fallbackIds.forEach(id => { reelsWrapper.innerHTML += `<div class="reel-slide"><iframe src="https://www.youtube.com/embed/${id}?autoplay=0&controls=0&modestbranding=1&loop=1&playlist=${id}" allow="autoplay" allowfullscreen></iframe></div>`; });
  }
}

// --- CLOUDINARY LOGIC ---
const CLOUD_NAME = "ddkov7oka"; 
const UPLOAD_PRESET = "chitchat_preset"; 
const fileInput = document.createElement("input");
fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
document.body.appendChild(fileInput);

document.querySelector('.fa-paperclip').parentElement.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChatId) return;
  const originalHtml = sendBtn.innerHTML;
  sendBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; sendBtn.disabled = true;
  try {
    const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message || "Upload failed");
    await addDoc(collection(db, "chats", currentChatId, "messages"), { text: "", imageUrl: data.secure_url, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false });
  } catch (err) { alert("Upload failed: " + err.message); } 
  finally { sendBtn.innerHTML = originalHtml; sendBtn.disabled = false; fileInput.value = ""; }
});

const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const profileAvatar = document.getElementById("profileAvatar");
const profileName = document.getElementById("profileName");
const profileHandle = document.getElementById("profileHandle");
const profileBioDisplay = document.getElementById("profileBioDisplay");
const profileBioEdit = document.getElementById("profileBioEdit");
const profileJoinDate = document.getElementById("profileJoinDate");
const editProfileBtn = document.getElementById("editProfileBtn");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileAvatarInput = document.getElementById("profileAvatarInput");
const editAvatarBtn = document.getElementById("editAvatarBtn");

window.openProfile = async (uid) => {
  profileModal.style.display = "flex";
  editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "none"; editAvatarBtn.style.display = "none";
  profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block"; profileBioDisplay.innerText = "Loading...";
  const isCurrentUser = auth.currentUser && uid === auth.currentUser.uid;
  if (isCurrentUser) { editProfileBtn.style.display = "block"; editAvatarBtn.style.display = "block"; }
  try {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      const dName = data.fullName || data.username;
      profileName.innerText = dName; profileHandle.innerText = `@${data.username}`;
      profileAvatar.src = generateAvatar(data, dName);
      const bioText = data.bio || "Hey there! I am using Chit-Chat.";
      profileBioDisplay.innerText = bioText; profileBioEdit.value = bioText;
      profileJoinDate.innerText = `Joined: ${new Date(data.createdAt || Date.now()).toLocaleDateString()}`;
    }
  } catch (e) { console.error("Error opening profile:", e); }
};

closeProfileBtn.addEventListener("click", () => profileModal.style.display = "none");
profileModal.addEventListener("click", (e) => { if(e.target === profileModal) profileModal.style.display = "none"; });

editProfileBtn.addEventListener("click", () => {
  profileBioDisplay.style.display = "none"; profileBioEdit.style.display = "block";
  editProfileBtn.style.display = "none"; saveProfileBtn.style.display = "block"; profileBioEdit.focus();
});

saveProfileBtn.addEventListener("click", async () => {
  const newBio = profileBioEdit.value.trim();
  saveProfileBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), { bio: newBio });
    profileBioDisplay.innerText = newBio || "Hey there! I am using Chit-Chat.";
    profileBioEdit.style.display = "none"; profileBioDisplay.style.display = "block";
    saveProfileBtn.style.display = "none"; editProfileBtn.style.display = "block";
    showToast("Profile Updated", "Your bio has been saved.", "https://ui-avatars.com/api/?name=Success&background=10b981&color=fff");
  } catch(e) { console.error("Error saving bio:", e); } 
  finally { saveProfileBtn.innerHTML = 'Save Changes'; }
});

editAvatarBtn.addEventListener("click", () => profileAvatarInput.click());
profileAvatarInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  editAvatarBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:12px;"></i>'; editAvatarBtn.disabled = true;
  try {
    const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); 
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error.message || "Upload failed");
    await updateDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url });
    profileAvatar.src = data.secure_url; document.getElementById("myAvatar").src = data.secure_url;
    showToast("Avatar Updated", "Your new profile picture looks great!", data.secure_url);
  } catch(err) { alert("Upload failed: " + err.message); } 
  finally { editAvatarBtn.innerHTML = '<i class="fa-solid fa-camera"></i>'; editAvatarBtn.disabled = false; profileAvatarInput.value = ""; }
});

document.querySelector(".current-user").addEventListener("click", () => { if(auth.currentUser) openProfile(auth.currentUser.uid); });
document.querySelector(".chat-target-info").addEventListener("click", () => { if(targetUserUid && !isCurrentChatGroup) openProfile(targetUserUid); });

// App info modal logic
const appInfoBtn = document.getElementById("appInfoBtn");
const infoModal = document.getElementById("infoModal");
const closeModalBtn = document.getElementById("closeModalBtn");
if (appInfoBtn && infoModal && closeModalBtn) {
  appInfoBtn.addEventListener("click", () => { infoModal.style.display = "flex"; });
  closeModalBtn.addEventListener("click", () => { infoModal.style.display = "none"; });
  infoModal.addEventListener("click", (e) => { if (e.target === infoModal) infoModal.style.display = "none"; });
}
