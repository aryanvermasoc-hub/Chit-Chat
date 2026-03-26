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

// --- 4. UTILS & HELPERS ---
const getFakeEmail = (username) => `${username.toLowerCase().trim()}@chitchat.app`;
const generateAvatar = (name) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&rounded=true&bold=true`;

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

// --- 5. AUTHENTICATION UI LOGIC ---
const toggleAuthMode = (signup) => {
  isSignupMode = signup;
  if (signup) {
    tabSignup.classList.add("active");
    tabLogin.classList.remove("active");
    nameGroup.style.display = "block";
    authActionBtn.innerText = "Create Account";
  } else {
    tabLogin.classList.add("active");
    tabSignup.classList.remove("active");
    nameGroup.style.display = "none";
    authActionBtn.innerText = "Enter Chit-Chat";
  }
};

tabLogin.addEventListener("click", () => toggleAuthMode(false));
tabSignup.addEventListener("click", () => toggleAuthMode(true));

authActionBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();
  const fullName = fullNameInput.value.trim();

  if (!username || !password || (isSignupMode && !fullName)) {
    alert("Please fill in all required fields."); return;
  }
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
    await updateDoc(doc(db, "users", auth.currentUser.uid), { 
      isOnline: false, 
      lastSeen: Date.now() 
    });
    signOut(auth);
  }
});

// --- 6. AUTH STATE OBSERVER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authScreen.style.display = "none";
    appScreen.style.display = "flex";
    history.pushState({ page: "home" }, ""); // <-- SET INITIAL HISTORY STATE
    await updateDoc(doc(db, "users", user.uid), { isOnline: true });

    window.addEventListener("beforeunload", () => {
      updateDoc(doc(db, "users", user.uid), { isOnline: false, lastSeen: Date.now() });
    });

    loadUserProfile(user.uid);
    loadSidebarData(); 
    listenForIncomingCalls(user.uid); 
  } else {
    authScreen.style.display = "flex";
    appScreen.style.display = "none";
    emptyChatState.style.display = "flex";
    activeChatState.style.display = "none";
    usernameInput.value = ""; passwordInput.value = "";
    authActionBtn.innerText = isSignupMode ? "Create Account" : "Enter Chit-Chat";
  }
});

async function loadUserProfile(uid) {
  const docSnap = await getDoc(doc(db, "users", uid));
  if (docSnap.exists()) {
    const data = docSnap.data();
    const displayName = data.fullName || data.username;
    document.getElementById("myName").innerText = displayName;
    document.getElementById("myUsername").innerText = `@${data.username}`;
    document.getElementById("myAvatar").src = generateAvatar(displayName);
  }
}

// --- 7. SIDEBAR (USERS & GROUPS) ---
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
  
  // Render Groups
  allGroups.forEach(group => {
    if (!group.members.includes(auth.currentUser.uid)) return; 
    
    const groupCard = document.createElement("div");
    groupCard.className = "user-item";
    groupCard.innerHTML = `
      <div class="avatar-wrapper">
        <div class="avatar" style="background:var(--primary); display:flex; justify-content:center; align-items:center; color:white; font-weight:bold; font-size:18px;">${group.name.charAt(0)}</div>
      </div>
      <div class="user-meta">
        <span class="name">${group.name}</span>
        <span class="handle">${group.members.length} members</span>
      </div>
    `;
    groupCard.onclick = () => openGroupChat(group.id, group.name, group.members.length);
    usersList.appendChild(groupCard);
  });

  // Render Users
  allUsers.forEach((user) => {
    if (user.id === auth.currentUser.uid) return;
    const displayName = user.fullName || user.username;
    const avatarUrl = generateAvatar(displayName);
    const isOnline = user.isOnline ? "online" : "";

    const userCard = document.createElement("div");
    userCard.className = "user-item";
    userCard.innerHTML = `
      <div class="avatar-wrapper">
        <img src="${avatarUrl}" class="avatar">
        <div class="status-dot ${isOnline}"></div>
      </div>
      <div class="user-meta">
        <span class="name">${displayName}</span>
        <span class="handle">@${user.username}</span>
      </div>
    `;
    userCard.onclick = () => openChat(user.id, displayName, avatarUrl, user.isOnline, user.lastSeen);
    usersList.appendChild(userCard);
  });
}

// Group Creation
document.getElementById("createGroupBtn").addEventListener("click", () => {
  const groupName = prompt("Enter a name for the new Group:");
  if (!groupName) return;

  let promptText = "Select members by typing their numbers (comma separated):\n\n";
  const selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid);
  selectableUsers.forEach((u, index) => {
    promptText += `${index + 1}. ${u.fullName || u.username}\n`;
  });

  const selections = prompt(promptText);
  if (!selections) return;

  let members = [auth.currentUser.uid]; 
  selections.split(',').forEach(numText => {
    const idx = parseInt(numText.trim()) - 1;
    if (selectableUsers[idx]) members.push(selectableUsers[idx].id);
  });

  if (members.length > 1) {
    addDoc(collection(db, "groups"), {
      name: groupName,
      members: members,
      createdAt: Date.now(),
      createdBy: auth.currentUser.uid
    });
    alert("Group created successfully!");
  } else {
    alert("You must add at least one other person.");
  }
});

// --- SMART MOBILE ROUTING & BACK BUTTON FIX ---
backToUsersBtn.addEventListener("click", () => {
  if (window.innerWidth <= 768) {
    // Hide Chat, Show Sidebar (Users list)
    sidebar.classList.remove("hidden");
    document.getElementById("activeChatState").style.display = "none";
    document.getElementById("emptyChatState").style.display = "flex";
  }
});

// Physical back button handle
window.addEventListener("popstate", (e) => {
  if (window.innerWidth <= 768) {
    if (sidebar.classList.contains("hidden")) {
      // If inside a chat, go back to users list without logging out
      sidebar.classList.remove("hidden");
      document.getElementById("activeChatState").style.display = "none";
      document.getElementById("emptyChatState").style.display = "flex";
      // Push history state so the next back button press exits the app normally
      history.pushState({ page: "home" }, ""); 
    } 
    // Notice: NO alert/confirm box here. Natural app exit behavior allowed!
  }
});


// --- 8. CHAT ENGINE & ROUTING ---
function openChat(targetUid, targetName, targetAvatar, isTargetOnline, targetLastSeen) {
  isCurrentChatGroup = false;
  const myUid = auth.currentUser.uid;
  currentChatId = myUid < targetUid ? `${myUid}_${targetUid}` : `${targetUid}_${myUid}`;
  targetUserUid = targetUid;

  document.getElementById("chatBox").innerHTML = ""; 
  document.getElementById("chatBox").style.background = ""; 
  if(replyingToMsg) document.getElementById("cancelReplyBtn").click();

  document.getElementById("chatTargetName").innerText = targetName;
  document.getElementById("chatTargetAvatar").src = targetAvatar;
  const targetStatus = document.getElementById("chatTargetStatus");
  const lastSeenLabel = document.getElementById("lastSeenText");

  if (isTargetOnline) {
    targetStatus.classList.add('online');
    lastSeenLabel.style.display = "none";
  } else {
    targetStatus.classList.remove('online');
    lastSeenLabel.style.display = "block";
    lastSeenLabel.innerText = `Last seen: ${timeAgo(targetLastSeen)}`;
  }
  
  emptyChatState.style.display = "none";
  activeChatState.style.display = "flex";
  
  if(window.innerWidth <= 768) {
    sidebar.classList.add("hidden");
    history.pushState({ page: "chat" }, ""); // Tells phone we entered a chat
  }
  loadMessages();
  listenToTyping();
}

function openGroupChat(groupId, groupName, memberCount) {
  isCurrentChatGroup = true;
  currentChatId = groupId; 
  targetUserUid = null;

  document.getElementById("chatBox").innerHTML = "";
  document.getElementById("chatBox").style.background = "";
  if(replyingToMsg) document.getElementById("cancelReplyBtn").click();

  document.getElementById("chatTargetName").innerText = groupName;
  document.getElementById("chatTargetAvatar").src = `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=8b5cf6&color=fff`;
  document.getElementById("chatTargetStatus").classList.add('online');
  
  const lastSeenLabel = document.getElementById("lastSeenText");
  lastSeenLabel.style.display = "block";
  lastSeenLabel.innerText = `${memberCount} members`;
  
  emptyChatState.style.display = "none";
  activeChatState.style.display = "flex";
  
  if(window.innerWidth <= 768) {
    sidebar.classList.add("hidden");
    history.pushState({ page: "chat" }, ""); // Tells phone we entered a chat
  }

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
      if (msg.isDeleted) {
        contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`;
      } else {
        let replyHtml = msg.replyToText ? `<div class="replied-msg-box"><b>${msg.replyToName}</b><br>${msg.replyToText}</div>` : "";
        let imgHtml = msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width:100%; border-radius:12px; margin-bottom:8px; cursor:pointer;" onclick="window.open('${msg.imageUrl}')" />` : "";
        let groupSenderHtml = (isCurrentChatGroup && !isMe) ? `<div style="font-size:11px; color:var(--primary); font-weight:600; margin-bottom:4px;">${msg.senderName}</div>` : "";
        
        let safeText = msg.text ? msg.text.replace(/'/g, "\\'") : 'Image';
        let safeName = isMe ? 'You' : (msg.senderName ? msg.senderName.replace(/'/g, "\\'") : document.getElementById('chatTargetName').innerText.replace(/'/g, "\\'"));

        contentHtml = `
          <div class="msg-bubble" ondblclick="initReply('${msgId}', '${safeText}', '${safeName}')">
            ${groupSenderHtml}
            ${replyHtml}
            ${imgHtml}
            ${msg.text} ${msg.isEdited ? '<span style="font-size:10px; opacity:0.5;"> (edited)</span>' : ''}
            <i class="fa-solid fa-ellipsis-vertical msg-options" title="Options" onclick="openMessageOptions('${msgId}', '${safeText}', ${isMe})"></i>
          </div>
        `;
      }
      
      let avatarSrc = isCurrentChatGroup && !isMe ? generateAvatar(msg.senderName || 'U') : document.getElementById('chatTargetAvatar').src;
      
      div.innerHTML = `
        ${!isMe ? `<img src="${avatarSrc}" class="msg-avatar">` : ''}
        <div style="display:flex; flex-direction:column;">
          ${contentHtml}
          <div class="msg-time">${timeStr}</div>
        </div>
        ${isMe ? `<img src="${document.getElementById('myAvatar').src}" class="msg-avatar">` : ''}
      `;
      chatBox.appendChild(div);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

// --- 9. MESSAGE ACTIONS (Replies, Edits, Deletes) ---
window.initReply = (msgId, text, name) => {
  replyingToMsg = { id: msgId, text: text, name: name };
  document.getElementById("replyPreviewName").innerText = `Replying to ${name}`;
  document.getElementById("replyPreviewText").innerText = text;
  document.getElementById("replyPreviewContainer").style.display = "flex";
  msgInput.focus();
};

document.getElementById("cancelReplyBtn").addEventListener("click", () => {
  replyingToMsg = null;
  document.getElementById("replyPreviewContainer").style.display = "none";
});

window.openMessageOptions = async (msgId, currentText, isMe) => {
  const msgRef = doc(db, "chats", currentChatId, "messages", msgId);
  
  if (isMe) {
    const action = prompt("Message Options:\n1. Edit\n2. Delete for Everyone\n3. Delete for Me", "1");
    if (action === "1") {
      const newText = prompt("Edit message:", currentText);
      if (newText && newText !== currentText) await updateDoc(msgRef, { text: newText, isEdited: true });
    } else if (action === "2") {
      if(confirm("Delete for everyone?")) await updateDoc(msgRef, { isDeleted: true, text: "" });
    } else if (action === "3") {
      await updateDoc(msgRef, { deletedFor: arrayUnion(auth.currentUser.uid) });
    }
  } else {
    if(confirm("Delete this message for yourself?")) {
      await updateDoc(msgRef, { deletedFor: arrayUnion(auth.currentUser.uid) });
    }
  }
};

// --- 10. TYPING INDICATOR & SENDING ---
function listenToTyping() {
  if (chatMetaUnsubscribe) chatMetaUnsubscribe();
  if (isCurrentChatGroup) return; // Basic typing indicator disabled for groups to prevent spam
  
  chatMetaUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (docSnap) => {
    if (docSnap.exists() && docSnap.data()[`typing_${targetUserUid}`]) {
      document.getElementById("typingIndicator").style.display = "inline";
      document.getElementById("lastSeenText").style.display = "none";
    } else {
      document.getElementById("typingIndicator").style.display = "none";
      if(!document.getElementById("chatTargetStatus").classList.contains('online')){
         document.getElementById("lastSeenText").style.display = "block";
      }
    }
  });
}

msgInput.addEventListener("input", async () => {
  if(!currentChatId || isCurrentChatGroup) return;
  
  await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: true }, { merge: true });
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => {
    await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true });
  }, 1500);
});

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text && !replyingToMsg) return; 
  if(!text) return;
  
  msgInput.value = "";
  msgInput.focus(); 
  
  if (!isCurrentChatGroup) {
    await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true });
  }

  const payload = {
    text: text, 
    sender: auth.currentUser.uid, 
    senderName: document.getElementById("myName").innerText, 
    time: Date.now(), 
    isEdited: false, 
    isDeleted: false
  };
  
  if (replyingToMsg) {
    payload.replyToId = replyingToMsg.id;
    payload.replyToText = replyingToMsg.text;
    payload.replyToName = replyingToMsg.name;
    document.getElementById("cancelReplyBtn").click(); 
  }
  
  await addDoc(collection(db, "chats", currentChatId, "messages"), payload);
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

searchInput.addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll(".user-item").forEach(item => {
    item.style.display = item.innerText.toLowerCase().includes(term) ? "flex" : "none";
  });
});

// --- 11. MEDIA UPLOAD LOGIC (CLOUDINARY) ---
const CLOUD_NAME = "ddkov7oka"; 
const UPLOAD_PRESET = "chitchat_preset"; 

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

document.querySelector('.fa-paperclip').parentElement.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !currentChatId) return;

  const sendBtn = document.getElementById("sendBtn");
  const originalHtml = sendBtn.innerHTML;
  sendBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
  sendBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
    const response = await fetch(cloudinaryUrl, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error.message || "Cloudinary upload failed");
    }

    const downloadURL = data.secure_url; 

    await addDoc(collection(db, "chats", currentChatId, "messages"), {
      text: "", 
      imageUrl: downloadURL,
      sender: auth.currentUser.uid,
      senderName: document.getElementById("myName").innerText,
      time: Date.now(),
      isEdited: false,
      isDeleted: false
    });

  } catch (err) {
    alert("Image upload failed: " + err.message);
    console.error("Upload error:", err);
  } finally {
    sendBtn.innerHTML = originalHtml;
    sendBtn.disabled = false;
    fileInput.value = ""; 
  }
});

// --- 12. SIMULATED CALLING LOGIC ---
const phoneBtn = document.querySelector('.fa-phone').parentElement;
const videoBtn = document.querySelector('.fa-video').parentElement;

function triggerCallSimulation(type) {
  if (isCurrentChatGroup) {
    alert("Group calls are coming in a future update!");
    return;
  }
  
  const callScreen = document.createElement('div');
  callScreen.style.cssText = "position:absolute; top:0; left:0; width:100vw; height:100vh; background:var(--bg-base); z-index:9999; display:flex; flex-direction:column; align-items:center; justify-content:center; backdrop-filter:blur(20px);";
  
  callScreen.innerHTML = `
    <div class="avatar-wrapper" style="margin-bottom: 20px;">
      <img src="${document.getElementById('chatTargetAvatar').src}" class="avatar" style="width:120px; height:120px; border: 4px solid var(--primary); animation: pulse 1.5s infinite;">
    </div>
    <h2 style="font-size: 24px; margin-bottom: 10px;">${document.getElementById('chatTargetName').innerText}</h2>
    <p style="color: var(--text-muted); margin-bottom: 40px;">Ringing... (${type} call)</p>
    
    <div style="display: flex; gap: 20px;">
      <button id="endCallBtnSim" style="background: var(--danger); width: 60px; height: 60px; border-radius: 50%; color: white; font-size: 24px; cursor: pointer; border: none; box-shadow: 0 10px 20px rgba(239, 68, 68, 0.4);">
        <i class="fa-solid fa-phone-slash"></i>
      </button>
    </div>
  `;
  document.body.appendChild(callScreen);

  setDoc(doc(db, "calls", targetUserUid), {
    callerId: auth.currentUser.uid,
    callerName: document.getElementById("myName").innerText,
    type: type,
    status: "ringing",
    time: Date.now()
  });

  document.getElementById("endCallBtnSim").onclick = async () => {
    document.body.removeChild(callScreen);
    await deleteDoc(doc(db, "calls", targetUserUid)); 
  };
}

phoneBtn.addEventListener("click", () => triggerCallSimulation('Audio'));
videoBtn.addEventListener("click", () => triggerCallSimulation('Video'));

function listenForIncomingCalls(uid) {
  onSnapshot(doc(db, "calls", uid), (docSnap) => {
    if (docSnap.exists() && docSnap.data().status === 'ringing') {
      const callData = docSnap.data();
      if(confirm(`Incoming ${callData.type} call from ${callData.callerName}.\nAccept?`)) {
        alert("Call connected! (Simulated)");
        deleteDoc(doc(db, "calls", uid));
      } else {
        deleteDoc(doc(db, "calls", uid));
      }
    }
  });
}

// --- 13. APP INFO MODAL LOGIC ---
const appInfoBtn = document.getElementById("appInfoBtn");
const infoModal = document.getElementById("infoModal");
const closeModalBtn = document.getElementById("closeModalBtn");

if (appInfoBtn && infoModal && closeModalBtn) {
  appInfoBtn.addEventListener("click", () => {
    infoModal.style.display = "flex";
  });

  closeModalBtn.addEventListener("click", () => {
    infoModal.style.display = "none";
  });

  infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) {
      infoModal.style.display = "none";
    }
  });
}
