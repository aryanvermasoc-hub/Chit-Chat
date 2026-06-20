import { db, auth, messaging } from './firebase.js';
import { CryptoE2EE } from './crypto.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";
import { collection, addDoc, onSnapshot, doc, setDoc, query, orderBy, getDoc, getDocs, deleteDoc, updateDoc, arrayUnion, arrayRemove, writeBatch, limit, where, increment, deleteField } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
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
    setTimeout(() => {
        if (window.showToast) {
            window.showToast("🎉 Update applied", "You are on the latest version.");
        }
    }, 800);
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
let messageLoadSeq = 0;

window.changeSpDifficulty = (val) => { currentSpDifficulty = val; };


// =========================================================
// CUSTOM UI MODALS (Replace prompts/confirms)
// =========================================================
window.customConfirm = (title, message, confirmText = "Confirm", confirmColor = "#ef4444") => {
    return new Promise((resolve) => {
        const modal = document.getElementById("customConfirmModal");
        document.getElementById("confirmModalTitle").innerText = title;
        document.getElementById("confirmModalMessage").innerText = message;
        const confirmBtn = document.getElementById("confirmActionBtn");
        confirmBtn.innerText = confirmText;
        confirmBtn.style.background = confirmColor;
        
        const cleanup = () => {
            document.getElementById("confirmCancelBtn").removeEventListener("click", onCancel);
            confirmBtn.removeEventListener("click", onConfirm);
            modal.style.display = "none";
        };
        
        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        
        document.getElementById("confirmCancelBtn").addEventListener("click", onCancel);
        confirmBtn.addEventListener("click", onConfirm);
        
        modal.style.display = "flex";
    });
};

window.customPrompt = (title, defaultValue = "", placeholder = "Enter value...") => {
    return new Promise((resolve) => {
        const modal = document.getElementById("customPromptModal");
        document.getElementById("promptModalTitle").innerText = title;
        const input = document.getElementById("promptModalInput");
        input.value = defaultValue;
        input.placeholder = placeholder;
        
        const cleanup = () => {
            document.getElementById("promptCancelBtn").removeEventListener("click", onCancel);
            document.getElementById("promptActionBtn").removeEventListener("click", onConfirm);
            modal.style.display = "none";
        };
        
        const onConfirm = () => { cleanup(); resolve(input.value); };
        const onCancel = () => { cleanup(); resolve(null); };
        
        document.getElementById("promptCancelBtn").addEventListener("click", onCancel);
        document.getElementById("promptActionBtn").addEventListener("click", onConfirm);
        
        modal.style.display = "flex";
        setTimeout(() => input.focus(), 100);
    });
};

window.openSelectUsersModal = (mode, existingMembers = [], pendingArr = []) => {
    return new Promise((resolve) => {
        const modal = document.getElementById("selectUsersModal");
        const titleEl = document.getElementById("selectUsersTitle");
        const groupNameContainer = document.getElementById("createGroupNameContainer");
        const groupNameInput = document.getElementById("newGroupNameInput");
        const searchInput = document.getElementById("selectUsersSearch");
        const listEl = document.getElementById("selectableUsersList");
        const chipsEl = document.getElementById("selectedUsersChips");
        const confirmBtn = document.getElementById("confirmSelectUsersBtn");
        const closeBtn = document.getElementById("closeSelectUsersBtn");

        let selectedUids = new Set();
        let selectableUsers = [];

        if (mode === 'create_group') {
            titleEl.innerText = "Create New Group";
            groupNameContainer.style.display = "block";
            groupNameInput.value = "";
            selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid);
        } else if (mode === 'add_members') {
            titleEl.innerText = "Add Members";
            groupNameContainer.style.display = "none";
            selectableUsers = allUsers.filter(u => u.id !== auth.currentUser.uid && !existingMembers.includes(u.id) && !pendingArr.includes(u.id));
            if (selectableUsers.length === 0) {
                showToast("Info", "All users are already in the group or pending.");
                resolve(null);
                return;
            }
        }
        
        const updateConfirmText = () => {
            confirmBtn.innerHTML = `${mode === 'create_group' ? 'Create Group' : 'Add Selected'} (<span id="selectedCount">${selectedUids.size}</span>)`;
        };
        updateConfirmText();

        const renderChips = () => {
            chipsEl.innerHTML = "";
            selectedUids.forEach(uid => {
                const u = allUsers.find(x => x.id === uid);
                if (!u) return;
                const chip = document.createElement("div");
                chip.className = "selected-chip";
                chip.innerHTML = `<img src="${generateAvatar(u, u.fullName || u.username)}"><span>${u.fullName || u.username}</span><i class="fa-solid fa-xmark remove-chip"></i>`;
                chip.querySelector('.remove-chip').onclick = (e) => {
                    e.stopPropagation();
                    selectedUids.delete(uid);
                    renderList(searchInput.value);
                    renderChips();
                };
                chipsEl.appendChild(chip);
            });
            updateConfirmText();
        };

        const renderList = (filterText = "") => {
            listEl.innerHTML = "";
            const filtered = selectableUsers.filter(u => (u.fullName || u.username).toLowerCase().includes(filterText.toLowerCase()));
            if (filtered.length === 0) {
                listEl.innerHTML = `<div style="padding: 10px; color: var(--text-muted); text-align: center; font-size: 13px;">No users found.</div>`;
                return;
            }
            filtered.forEach(u => {
                const isSelected = selectedUids.has(u.id);
                const row = document.createElement("div");
                row.className = `user-select-row ${isSelected ? 'selected' : ''}`;
                row.innerHTML = `<img src="${generateAvatar(u, u.fullName || u.username)}" class="avatar"><div class="name-col"><span class="name">${u.fullName || u.username}</span><span class="handle">@${u.username}</span></div><div class="custom-checkbox"></div>`;
                row.onclick = () => {
                    if (selectedUids.has(u.id)) selectedUids.delete(u.id);
                    else selectedUids.add(u.id);
                    renderList(searchInput.value);
                    renderChips();
                };
                listEl.appendChild(row);
            });
        };

        searchInput.oninput = (e) => renderList(e.target.value);

        const cleanup = () => {
            closeBtn.onclick = null;
            confirmBtn.onclick = null;
            modal.style.display = "none";
        };

        closeBtn.onclick = () => { cleanup(); resolve(null); };

        confirmBtn.onclick = () => {
            let validMembers = Array.from(selectedUids);

            if (mode === 'create_group') {
                const gName = groupNameInput.value.trim();
                if (!gName) { showToast("Error", "Group Name is required."); return; }
                if (validMembers.length === 0) { showToast("Error", "Select at least one member."); return; }
                cleanup();
                resolve({ groupName: gName, members: validMembers });
            } else {
                if (validMembers.length === 0) { showToast("Error", "Select at least one member."); return; }
                cleanup();
                resolve({ members: validMembers });
            }
        };

        selectedUids.clear();
        searchInput.value = "";
        renderChips();
        renderList();
        modal.style.display = "flex";
    });
};

const authScreen = document.getElementById("authScreen"); const appScreen = document.getElementById("appScreen");
const tabLogin = document.getElementById("tabLogin"); const tabSignup = document.getElementById("tabSignup");
const nameGroup = document.getElementById("nameGroup"); const fullNameInput = document.getElementById("fullName");
const usernameInput = document.getElementById("username"); const passwordInput = document.getElementById("password");
const authActionBtn = document.getElementById("authActionBtn"); const sidebar = document.getElementById("sidebar");
const usersList = document.getElementById("usersList"); const groupsList = document.getElementById("groupsList"); const searchInput = document.getElementById("searchInput");
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
    else if (view === 'feed') { newsFeedContainer.style.display = "flex"; chatToggleBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Feed (Active)'; chatToggleBtn.style.color = "var(--accent)"; homeGamesBtn.style.color = "var(--text-muted)"; if(openUsersListBtn) openUsersListBtn.style.color = "var(--text-muted)"; renderActiveFeed(); }
}

async function renderActiveFeed() {
    newsFeedContainer.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--primary);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px; font-size:12px; color:var(--text-muted);">Fetching Latest Tech News...</p></div>';

    try {
        const res = await fetch("https://dev.to/api/articles?tag=programming&per_page=15");
        const articles = await res.json();
        newsFeedContainer.innerHTML = "";

        const header = document.createElement("div");
        header.style.cssText = "padding: 5px 0 10px 0; font-size: 13px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px;";
        header.innerHTML = '<i class="fa-solid fa-newspaper" style="color:var(--primary); font-size:12px; margin-right:6px;"></i> LATEST TECH NEWS';
        newsFeedContainer.appendChild(header);

        articles.forEach(article => {
            const card = document.createElement("div");
            card.className = "news-feed-card";
            card.innerHTML = `
                <h4 style="font-size: 14px; margin-bottom: 5px; color: var(--text-main);">${article.title}</h4>
                <p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">By ${article.user.name} • ${article.reading_time_minutes} min read</p>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <a href="${article.url}" target="_blank" style="font-size: 11px; background: rgba(139, 92, 246, 0.15); padding: 6px 12px; border-radius: 6px; color: var(--primary); text-decoration: none;">Read Article <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 9px; margin-left: 3px;"></i></a>
                    <span style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-heart" style="color:var(--accent);"></i> ${article.public_reactions_count}</span>
                </div>
            `;
            newsFeedContainer.appendChild(card);
        });
    } catch (err) {
        newsFeedContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;"><i class="fa-solid fa-triangle-exclamation fa-2x"></i><p style="margin-top:10px; font-size:12px;">Failed to load news.</p></div>';
    }
}
// bindPointerTap must be defined here, before it is first called below
function bindPointerTap(element, handler) {
  if (!element || typeof handler !== 'function') return;
  element.style.cursor = 'pointer'; // Forces iOS to recognize the element as clickable
  element.addEventListener('click', handler);
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
    if (setting === 'friends') return !!(targetUser.chatMeta?.[auth.currentUser.uid]);
    return true;
};
const generateAvatar = (userObj, fallbackName) => { 
    const name = (userObj && (userObj.fullName || userObj.username)) || fallbackName || "User";
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&rounded=true&bold=true`;
    if (userObj && userObj.avatarUrl) { if (canSeePrivacy(userObj, 'privacyPfp')) return userObj.avatarUrl; }
    return defaultAvatar;
};
function timeAgo(ms) { if (!ms) return ""; const seconds = Math.floor((Date.now() - ms) / 1000); if (seconds < 60) return "Just now"; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} min ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} hr ago`; const days = Math.floor(hours / 24); if (days === 1) return "Yesterday"; return `${days} days ago`; }

function showChatLoadingIndicator() {
  let loader = document.getElementById("chatLoadingOverlay");
  if (!loader) {
      loader = document.createElement("div");
      loader.id = "chatLoadingOverlay";
      loader.className = "chat-loading-overlay";
      loader.innerHTML = '<i class="fa-solid fa-spinner fa-spin fa-2x"></i><span>Loading...</span>';
      activeChatState.appendChild(loader);
  }
  loader.style.display = "flex";
}

function hideChatLoadingIndicator() {
  const loader = document.getElementById("chatLoadingOverlay");
  if (loader) loader.style.display = "none";
}

window.showToast = function(title, message, avatarUrl, onClick) {
  const container = document.getElementById("toastContainer"); if(!container) return;
  const toast = document.createElement("div"); toast.className = "toast";
  if (onClick) { toast.classList.add("toast-clickable"); toast.style.cursor = "pointer"; }

  const escHtml = (str) => String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  const leftHtml = avatarUrl
    ? `<img src="${escHtml(avatarUrl)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">`
    : `<div class="toast-sys-icon"><i class="fa-solid fa-bell"></i></div>`;
  toast.innerHTML = `${leftHtml}<div class="toast-content" style="display: flex; flex-direction: column; overflow: hidden; flex:1;"><span style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${escHtml(title)}</span><span style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(message)}</span></div><button class="toast-close-btn" onclick="event.stopPropagation(); this.parentElement.remove();" title="Dismiss"><i class="fa-solid fa-xmark"></i></button>`;

  if (onClick) { toast.addEventListener("click", () => { toast.remove(); onClick(); }); }
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = "fadeOutToast 0.5s ease forwards"; setTimeout(() => { if(toast.parentElement) toast.remove(); }, 500); }, 5000);
};

// ── IN-APP MESSAGE NOTIFICATION ENGINE ───────────────────────────────────────
// Tracks the latest message time seen per chat to avoid notifying old messages
const _notifSeenTimes = {};
let _globalMsgListeners = {}; // chatId → unsubscribe fn

// Call once after login. Watches ALL chats the user is part of for new messages.
function startGlobalMessageNotifier(uid) {
  // Clean up previous listeners on re-login
  Object.values(_globalMsgListeners).forEach(unsub => unsub());
  _globalMsgListeners = {};

  // Watch the user's chatMeta — whenever a new chat appears or unread flag set,
  // ensure we have a live listener on that chat's messages collection.
  onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    const chatMeta = snap.data().chatMeta || {};

    Object.keys(chatMeta).forEach(otherUid => {
      const chatId = uid < otherUid ? `${uid}_${otherUid}` : `${otherUid}_${uid}`;
      if (_globalMsgListeners[chatId]) return; // already listening

      // Seed the "last seen" time so we don't show notifications for history
      _notifSeenTimes[chatId] = Date.now();

      const q = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("time", "desc"),
        limit(1)
      );
      const unsub = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) return;
        const msgDoc = snapshot.docs[0];
        // Suppress notifications if any game is active on screen
        const gameAreaEl = document.getElementById("activeGameArea");
        if (gameAreaEl && window.getComputedStyle(gameAreaEl).display !== "none") return;

        const msg = msgDoc.data();

        // Skip own messages, expired/deleted/system messages, and old messages
        if (msg.sender === uid) return;
        if (msg.isDeleted || msg.isExpired || msg.isGameChallenge || msg.isDoodleRequest) return;
        if (!msg.time || msg.time <= (_notifSeenTimes[chatId] || 0)) return;

        // Skip if user is already looking at this exact chat (and page is visible)
        const isViewingThisChat = (
          currentChatId === chatId &&
          document.getElementById("activeChatState")?.style.display === "flex" &&
          document.visibilityState === "visible" &&
          !(window.innerWidth <= 992 && document.getElementById("sidebar")?.style.display !== "none")
        );
        if (isViewingThisChat) {
          _notifSeenTimes[chatId] = msg.time;
          return;
        }

        _notifSeenTimes[chatId] = msg.time;

        // Build notification content
        let sName = "Someone";
        let sAvatar = null;
        if (isGroup) {
            sName = `${msg.senderName} in ${meta.groupName || "Group"}`;
            const groupData = allGroups.find(g => g.id === chatId);
            sAvatar = groupData?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(meta.groupName || "Group")}&background=8b5cf6&color=fff`;
        } else {
            const sender = allUsers.find(u => u.id === msg.sender);
            sName = sender ? (sender.fullName || sender.username) : (msg.senderName || "Someone");
            sAvatar = sender ? generateAvatar(sender, sName) : null;
        }

        let preview = msg.text || "";
        if (preview.startsWith("E2EE:")) preview = "🔒 Encrypted message";
        else if (!preview && msg.imageUrl) preview = "📷 Sent an image";
        else if (!preview) preview = "New message";
        if (preview.length > 60) preview = preview.slice(0, 60) + "…";

        // Show rich in-app notification with click-to-open
        showToast(`💬 ${sName}`, preview, sAvatar, () => {
          // Open the chat when notification is tapped
          if (isGroup) {
            const groupData = allGroups.find(g => g.id === chatId);
            if (groupData) {
                openGroupChat(groupData.id, groupData.name, groupData.members.length);
            }
          } else {
            const sender = allUsers.find(u => u.id === msg.sender);
            if (sender) {
              openChat(sender.id, sName, generateAvatar(sender, sName), sender.isOnline, sender.lastSeen, sender.publicKey);
            }
          }
          if (window.innerWidth <= 992) {
            document.getElementById("sidebar").style.display = "none";
          }
        });

        // Also fire native device notification if permission granted & app not focused
        if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted" && "serviceWorker" in navigator) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(`💬 ${sName}`, {
              body: preview,
              icon: "./icon-192.png",
              badge: "./icon-192.png",
              vibrate: [150, 80, 150],
              tag: `msg_${chatId}`,
              renotify: true
            });
          }).catch(() => {});
        }
      });

      _globalMsgListeners[chatId] = unsub;
    });
  });
}
// ─────────────────────────────────────────────────────────────────────────────

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
// --- MISSING EMAIL RECOVERY LOGIC ---
let currentUpdateOtp = null;
const sendUpdateOtpBtn = document.getElementById("sendUpdateOtpBtn");

if (sendUpdateOtpBtn) {
    sendUpdateOtpBtn.addEventListener("click", async () => {
        const emailInput = document.getElementById("updateEmailInput");
        const email = emailInput.value.trim();

        if (!email || !email.includes("@")) {
            alert("Please enter a valid email address.");
            return;
        }

        // Disable button to prevent spam clicking
        sendUpdateOtpBtn.disabled = true;
        sendUpdateOtpBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

        currentUpdateOtp = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            const response = await fetch('/api/sendOtp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to_name: document.getElementById("myName") ? document.getElementById("myName").innerText : "User",
                    to_email: email,
                    otp_code: currentUpdateOtp
                })
            });

            if (!response.ok) throw new Error("Server error.");

            // Success: Switch to Step 2 UI
            document.getElementById("updateEmailStep1").style.display = "none";
            document.getElementById("updateEmailStep2").style.display = "block";
        } catch (error) {
            alert("Error sending code. Please ensure Vercel is deployed.");
            sendUpdateOtpBtn.disabled = false;
            sendUpdateOtpBtn.innerText = "Send Verification Code";
        }
    });
}

const verifyUpdateOtpBtn = document.getElementById("verifyUpdateOtpBtn");
if (verifyUpdateOtpBtn) {
    verifyUpdateOtpBtn.addEventListener("click", async () => {
        const userEnteredOtp = document.getElementById("updateOtpInput").value.trim();
        
        if (userEnteredOtp !== currentUpdateOtp) {
            alert("Incorrect code. Please try again.");
            return;
        }

        verifyUpdateOtpBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing...';
        verifyUpdateOtpBtn.disabled = true;

        try {
            // Save the newly verified email securely to the database
            const email = document.getElementById("updateEmailInput").value.trim();
            if (auth.currentUser) {
               await updateDoc(doc(db, "users", auth.currentUser.uid), { realEmail: email });
            }
            alert("Account secured successfully!");
            document.getElementById("missingEmailModal").style.display = "none";
        } catch (err) {
            alert("Error saving email to database.");
        } finally {
            verifyUpdateOtpBtn.innerText = "Verify & Secure Account";
            verifyUpdateOtpBtn.disabled = false;
        }
    });
}
// ------------------------------------
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
                   const registration = await navigator.serviceWorker.ready;
                    
                    // YAHAN PAR MAINE AAPKI CORRECTED KEY DAAL DI HAI 👇
                    if (!messaging) return;
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

    // START THE APP: Load sidebar data and listen to this user's profile
    loadSidebarData();
    startMyProfileListener(user.uid);
    startGlobalMessageNotifier(user.uid); // ← real-time in-app notifications
    if (window.listenForIncomingCalls) window.listenForIncomingCalls(user.uid);

    function startMyProfileListener(uid) {
  if(myProfileUnsubscribe) myProfileUnsubscribe();
  
  // Ask for Android Native Notification permissions if not already granted
  if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
  }
  
  myProfileUnsubscribe = onSnapshot(doc(db, "users", uid), async (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // Use a stable previous snapshot to detect truly NEW messages
      const prevChatMeta = myUserData ? (myUserData.chatMeta || {}) : null;

      if (prevChatMeta !== null && data.chatMeta) {
        for (let otherUid in data.chatMeta) {
          let newMeta = data.chatMeta[otherUid];
          let oldMeta = prevChatMeta[otherUid] || null;

          // Only fire if: flag is unread AND time changed = genuinely new message
          const isGenuinelyNew = newMeta.unread && (!oldMeta || oldMeta.time !== newMeta.time);
          if (!isGenuinelyNew) continue;

          try {
              const activeChatEl = document.getElementById("activeChatState");
              const gameAreaEl = document.getElementById("activeGameArea");
              const exploreAreaEl = document.getElementById("exploreArea");
              const doodleAreaEl = document.getElementById("privateDoodleArea");
              const sidebarEl = document.getElementById("sidebar");

              const checkVisible = (el) => el && window.getComputedStyle(el).display !== "none";
              const isGameCovering = checkVisible(gameAreaEl);
              const isExploreCovering = checkVisible(exploreAreaEl);
              const isDoodleCovering = checkVisible(doodleAreaEl);
              const isSidebarCovering = window.innerWidth <= 992 && checkVisible(sidebarEl);
              const isChatOpen = checkVisible(activeChatEl);
              // NEW: Also checks if the phone screen is actually on and the app is in the foreground
              const isChatVisible = isChatOpen && !isGameCovering && !isExploreCovering && !isDoodleCovering && !isSidebarCovering && document.visibilityState === 'visible';

              if (currentChatId && ((!newMeta.isGroup && targetUserUid === otherUid) || (newMeta.isGroup && currentChatId === otherUid)) && isChatVisible) {
                // User is physically looking at this chat — mark as read silently
                await updateDoc(doc(db, "users", uid), { 
                    [`chatMeta.${otherUid}.unread`]: false,
                    [`chatMeta.${otherUid}.unreadCount`]: 0 
                });
              } else {
                // Suppress notifications if any game is active on screen
                const gameAreaEl = document.getElementById("activeGameArea");
                const isGameActive = gameAreaEl && window.getComputedStyle(gameAreaEl).display !== "none";
                if (isGameActive) continue;

                // Not looking at this chat — show notification
                let sName = "Someone";
                let sAvatar = null;
                if (newMeta.isGroup) {
                    sName = newMeta.groupName || "Group Chat";
                    const gData = allGroups.find(g => g.id === otherUid);
                    sAvatar = gData?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(sName)}&background=8b5cf6&color=fff`;
                } else {
                    const sender = allUsers.find(u => u.id === otherUid);
                    sName = sender ? (sender.fullName || sender.username) : "Someone";
                    sAvatar = sender ? generateAvatar(sender, sName) : null;
                }
                let preview = newMeta.text || "New message";

                // Handle special previews
                if (preview === "🎮 GAME CHALLENGE" || preview === "🎨 DOODLE REQUEST") {
                    preview = `${sName} sent you a request.`;
                } else if (preview.startsWith("E2EE:")) {
                    // Plain text is now stored; this handles legacy encrypted entries
                    preview = "🔒 Secure Message";
                }

                // 1. In-app toast notification
                showToast(`💬 ${sName}`, preview, sAvatar);

                // 2. Native device notification (when app is in background/minimized)
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then((registration) => {
                        registration.showNotification(`New message from ${sName}`, {
                            body: preview,
                            icon: './icon-192.png',
                            badge: './icon-192.png',
                            vibrate: [200, 100, 200],
                            tag: `msg_${otherUid}`,
                            renotify: true
                        });
                    }).catch(e => console.log("SW notification error:", e));
                }
              }
          } catch(err) {
              console.error("Notification handler error:", err);
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
          if (tUser) {
              document.getElementById("chatTargetAvatar").src = generateAvatar(tUser, tUser.fullName || tUser.username);
              const statusEl = document.getElementById("chatTargetStatus");
              if (statusEl && !statusEl.innerText.includes("typing")) {
                  if (canSeePrivacy(tUser, 'privacyStatus')) {
                      statusEl.style.display = "";
                      if (tUser.isOnline) { statusEl.innerText = "Online"; statusEl.classList.add("online"); } 
                      else { statusEl.innerText = `Last seen: ${timeAgo(tUser.lastSeen)}`; statusEl.classList.remove("online"); }
                  } else { 
                      statusEl.innerText = ""; 
                      statusEl.classList.remove("online");
                      statusEl.style.display = "none";
                  }
              }
          }
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

document.getElementById("showUsersTab").addEventListener("click", () => { document.getElementById("showUsersTab").classList.add("active"); document.getElementById("showGroupsTab").classList.remove("active"); document.getElementById("usersList").style.display = "block"; document.getElementById("groupsList").style.display = "none"; searchInput.dispatchEvent(new Event('input')); });
document.getElementById("showGroupsTab").addEventListener("click", () => { document.getElementById("showGroupsTab").classList.add("active"); document.getElementById("showUsersTab").classList.remove("active"); document.getElementById("groupsList").style.display = "block"; document.getElementById("usersList").style.display = "none"; searchInput.dispatchEvent(new Event('input')); });

function renderSidebar() {
  usersList.innerHTML = "";
  groupsList.innerHTML = "";

  let myInvites = [...allGroups].filter(g => g.invitedMembers && g.invitedMembers.includes(auth.currentUser.uid));
  
  myInvites.forEach(group => {
      const inviteCard = document.createElement("div");
      inviteCard.className = "user-item";
      inviteCard.style.background = "rgba(245, 158, 11, 0.1)"; 
      inviteCard.style.border = "1px solid rgba(245, 158, 11, 0.3)";
      inviteCard.style.flexDirection = "column";
      inviteCard.style.alignItems = "stretch";
      
      const avatarUrl = group.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=8b5cf6&color=fff`;
      
      inviteCard.innerHTML = `
        <div style="display:flex; align-items:center; gap: 12px; margin-bottom: 10px;">
            <div class="avatar-wrapper"><img src="${avatarUrl}" class="avatar"></div>
            <div class="user-meta" style="flex:1;">
                <span class="name" style="color:var(--text-main); font-weight: 600;">${group.name}</span>
                <span class="handle" style="color:var(--text-muted); font-size:11px;">Invited to join</span>
            </div>
        </div>
        <div style="display:flex; gap: 8px;">
            <button class="primary-btn" style="flex:1; padding: 6px; font-size: 12px; background: #10b981;" onclick="acceptGroupInvite('${group.id}')">Accept</button>
            <button class="primary-btn" style="flex:1; padding: 6px; font-size: 12px; background: rgba(255,255,255,0.1); color: var(--text-main);" onclick="rejectGroupInvite('${group.id}')">Reject</button>
        </div>
      `;
      groupsList.appendChild(inviteCard);
  });

  let sortedGroups = [...allGroups].filter(g => g.members.includes(auth.currentUser.uid));
  sortedGroups.sort((a, b) => {
    let timeA = myUserData?.chatMeta?.[a.id]?.time || 0;
    let timeB = myUserData?.chatMeta?.[b.id]?.time || 0;
    return timeB - timeA;
  });

  sortedGroups.forEach(group => {
    const groupCard = document.createElement("div");
    groupCard.className = "user-item";
    
    const meta = myUserData?.chatMeta?.[group.id] || {};
    let unreadCount = meta.unreadCount || (meta.unread ? 1 : 0);
    let isUnread = unreadCount > 0;
    let timeDisplay = meta.time ? `Last talk: ${timeAgo(meta.time)}` : 'No messages yet';
    let previewText = meta.text || `${group.members.length} members`;

    const nameStyle = isUnread ? "font-weight:700; color:var(--text-main);" : "color:var(--text-main);";
    const handleStyle = isUnread ? "font-weight:600; color:var(--text-main);" : "color:var(--text-muted);";
    const timeStyle = isUnread ? "font-weight:700; color:var(--primary);" : "color:var(--text-muted);";
    const avatarUrl = group.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=8b5cf6&color=fff`;

    groupCard.innerHTML = `
      <div class="avatar-wrapper"><img src="${avatarUrl}" class="avatar"></div>
      <div class="user-meta" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="name" style="${nameStyle} white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:55%;">${group.name}</span>
              <span class="time-meta" style="${timeStyle}; font-size:10px; white-space:nowrap; flex-shrink:0;">${timeDisplay}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
              <span class="handle" style="${handleStyle}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85%;">${previewText}</span>
              ${isUnread ? `<div class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}
          </div>
      </div>`;
      
    groupCard.onclick = () => {
      if (isUnread) updateDoc(doc(db, "users", auth.currentUser.uid), { [`chatMeta.${group.id}.unread`]: false, [`chatMeta.${group.id}.unreadCount`]: 0 });
      openGroupChat(group.id, group.name, group.members.length);
    };
    groupsList.appendChild(groupCard);
  });

  let sortedUsers = [...allUsers].filter(u => u.id !== auth.currentUser.uid);
  sortedUsers.sort((a, b) => {
    let timeA = myUserData?.chatMeta?.[a.id]?.time || 0;
    let timeB = myUserData?.chatMeta?.[b.id]?.time || 0;
    return timeB - timeA; 
  });

  sortedUsers.forEach((user) => {
    const meta = myUserData?.chatMeta?.[user.id] || {};
    if (meta.isGroup) return; // Prevent bleed over from any incorrectly saved data
    const displayName = user.fullName || user.username;
    const avatarUrl = generateAvatar(user, displayName);
    
    const canSee = canSeePrivacy(user, 'privacyStatus');
    const isOnline = (canSee && user.isOnline) ? "online" : "";
    const statusDotHtml = canSee ? `<div class="status-dot ${isOnline}"></div>` : `<div class="status-dot" style="display:none;"></div>`;
    
    let unreadCount = meta.unreadCount || (meta.unread ? 1 : 0);
    let isUnread = unreadCount > 0;
    let timeDisplay = meta.time ? `Last talk: ${timeAgo(meta.time)}` : 'No messages yet';
    
    let previewText = meta.text ? meta.text : `@${user.username}`;
    if (previewText.startsWith("U2FsdGVkX1") || previewText.startsWith("U2Fz")) {
        const pChatId = auth.currentUser.uid < user.id ? `${auth.currentUser.uid}_${user.id}` : `${user.id}_${auth.currentUser.uid}`;
        previewText = decryptMessage(previewText, pChatId) || "🔒 Encrypted Message";
    }

    const nameStyle = isUnread ? "font-weight:700; color:var(--text-main);" : "color:var(--text-main);";
    const handleStyle = isUnread ? "font-weight:600; color:var(--text-main);" : "color:var(--text-muted);";
    const timeStyle = isUnread ? "font-weight:700; color:var(--primary);" : "color:var(--text-muted);";

    const userCard = document.createElement("div");
    userCard.className = "user-item";
    userCard.innerHTML = `
      <div class="avatar-wrapper"><img src="${avatarUrl}" class="avatar">${statusDotHtml}</div>
      <div class="user-meta" style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="name" style="${nameStyle} white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:55%;">${displayName}</span>
              <span class="time-meta" style="${timeStyle}; font-size:10px; white-space:nowrap; flex-shrink:0;">${timeDisplay}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
              <span class="handle" style="${handleStyle}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85%;">${previewText}</span>
              ${isUnread ? `<div class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}
          </div>
      </div>`;

    userCard.onclick = () => {
      if(isUnread) updateDoc(doc(db, "users", auth.currentUser.uid), { [`chatMeta.${user.id}.unread`]: false, [`chatMeta.${user.id}.unreadCount`]: 0 });
      openChat(user.id, displayName, avatarUrl, user.isOnline, user.lastSeen);
    }
    usersList.appendChild(userCard);
  });
}

const createGroupBtn = document.getElementById("createGroupBtn");
if(createGroupBtn) {
  createGroupBtn.addEventListener("click", async () => {
      const result = await openSelectUsersModal('create_group');
      if (!result) return;
      const { groupName, members } = result;
      let groupMembers = [auth.currentUser.uid];
      let invitedMembers = members;
      addDoc(collection(db, "groups"), { name: groupName, members: groupMembers, invitedMembers: invitedMembers, createdAt: Date.now(), createdBy: auth.currentUser.uid }).then(docRef => {
          showToast("Group Created", `${groupName} was created successfully. Invites sent.`);
          openGroupChat(docRef.id, groupName, groupMembers.length);
          invitedMembers.forEach(uid => {
              const u = allUsers.find(x => x.id === uid);
              const pref = u ? (u.privacyGroupInvite || 'everyone') : 'everyone';
              const isFriend = u && !!(u.chatMeta && u.chatMeta[auth.currentUser.uid]);
              let shouldNotify = true;
              if (pref === 'none') shouldNotify = false;
              if (pref === 'friends' && !isFriend) shouldNotify = false;

              setDoc(doc(db, "users", uid), {
                  chatMeta: {
                      [docRef.id]: {
                          time: Date.now(),
                          text: `You were invited to join ${groupName}`,
                          unread: shouldNotify,
                          unreadCount: shouldNotify ? increment(1) : 0,
                          isGroup: true,
                          groupId: docRef.id,
                          groupName: groupName
                      }
                  }
              }, { merge: true });
          });
      });
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
            if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
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
                document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("callMenuBtn").style.display = "none"; document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none";
                if(overlay) overlay.style.display = "flex"; if(inputWrapper) inputWrapper.style.display = "none";
                if (data.initiator === auth.currentUser.uid) { overlay.innerHTML = `<p style="font-size: 14px; margin: 0; color: var(--text-muted);"><i class="fa-solid fa-clock"></i> Request sent to <b>${targetName}</b>. Waiting...</p>`; } 
                else { overlay.innerHTML = `<p style="font-size: 14px; margin-bottom: 15px;"><strong style="color:var(--primary);">${targetName}</strong> wants to connect.</p><div style="display:flex; gap: 15px; justify-content: center;"><button onclick="acceptChatRequest()" class="primary-btn glow-btn" style="width:auto; padding: 8px 25px; background:#10b981;">Accept</button><button onclick="declineChatRequest()" class="primary-btn" style="width:auto; padding: 8px 25px; background:rgba(255,255,255,0.1); color:var(--text-muted);">Decline</button></div>`; }
            } else if (data.status === 'accepted') { 
                document.getElementById("chatDoodleBtn").style.display = "block"; if (ghostModeBtn) ghostModeBtn.style.display = "block"; document.getElementById("callMenuBtn").style.display = "block"; document.getElementById("launchGameMenuBtn").style.display = "block"; document.getElementById("chatSettingsBtn").style.display = "block";
                if(overlay) overlay.style.display = "none"; if(inputWrapper) inputWrapper.style.display = "flex"; 
            }
        } else {
            currentChatStatus = 'none'; document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("callMenuBtn").style.display = "none"; document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none";
            if(overlay) overlay.style.display = "flex"; if(inputWrapper) inputWrapper.style.display = "none";
            overlay.innerHTML = `<p style="font-size: 14px; margin-bottom: 15px;">You are not connected with <b>${targetName}</b>.</p><button onclick="sendChatRequest()" class="primary-btn glow-btn" style="width:auto; padding: 8px 25px;"><i class="fa-solid fa-user-plus"></i> Send Request</button>`;
        }
    });
}
window.openChat = async (targetUid, targetName, targetAvatar, isTargetOnline, targetLastSeen, targetPublicKey) => {
  isCurrentChatGroup = false; currentChatId = auth.currentUser.uid < targetUid ? `${auth.currentUser.uid}_${targetUid}` : `${targetUid}_${auth.currentUser.uid}`; targetUserUid = targetUid;
  document.getElementById("chatSettingsBtn").style.display = "none"; document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("callMenuBtn").style.display = "none"; document.getElementById("launchGameMenuBtn").style.display = "none";
chatBox.style.transition = "none"; chatBox.style.visibility = "hidden"; chatBox.style.opacity = "0"; chatBox.innerHTML = ""; if(replyingToMsg) document.getElementById("cancelReplyBtn").click(); if (document.getElementById("privateDoodleArea")) document.getElementById("privateDoodleArea").style.display = "none";
 showChatLoadingIndicator();
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
  // Suppress viewport-locking during transition to prevent jitter
  _lockViewportSuppressed = true;
  setTimeout(() => { _lockViewportSuppressed = false; }, 350);
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
      targetStatus.style.display = "";
      if (isTargetOnline) { targetStatus.classList.add('online'); targetStatus.innerText = "Online"; } 
      else { targetStatus.classList.remove('online'); targetStatus.innerText = `Last seen: ${timeAgo(targetLastSeen)}`; }
  } else { 
      targetStatus.innerText = ""; 
      targetStatus.classList.remove("online"); 
      targetStatus.style.display = "none"; 
  }
  
  loadMessages(); 
}
window.openGroupChat = (groupId, groupName, memberCount) => {
  isCurrentChatGroup = true; currentChatId = groupId; targetUserUid = null; activeSharedKey = null; // No E2EE for groups in this version
  document.getElementById("launchGameMenuBtn").style.display = "none"; document.getElementById("chatSettingsBtn").style.display = "none"; document.getElementById("chatDoodleBtn").style.display = "none"; if (ghostModeBtn) ghostModeBtn.style.display = "none"; document.getElementById("callMenuBtn").style.display = "none";
chatBox.style.transition = "none"; chatBox.style.visibility = "hidden"; chatBox.style.opacity = "0"; chatBox.innerHTML = ""; document.getElementById("chatWallpaper").style.backgroundImage = "none"; if(replyingToMsg) document.getElementById("cancelReplyBtn").click(); if(pDoodleUnsubscribe) { pDoodleUnsubscribe(); pDoodleUnsubscribe = null; }
  showChatLoadingIndicator();
  const overlay = document.getElementById("chatStateOverlay"); if(overlay) { overlay.style.display = "none"; overlay.innerHTML = ""; }
 const groupData = allGroups.find(g => g.id === groupId); const avatarToUse = groupData && groupData.avatarUrl ? groupData.avatarUrl : `https://ui-avatars.com/api/?name=${encodeURIComponent(groupName)}&background=8b5cf6&color=fff`;
  document.getElementById("chatTargetName").innerText = groupName; document.getElementById("chatTargetAvatar").src = avatarToUse; 
  document.getElementById("chatTargetStatus").style.display = ""; document.getElementById("chatTargetStatus").innerText = `${memberCount} members`;
  emptyChatState.style.display = "none"; activeChatState.style.display = "flex";
  _lockViewportSuppressed = true;
  setTimeout(() => { _lockViewportSuppressed = false; }, 350);
  if(window.innerWidth <= 992) { sidebar.style.display = "none"; history.pushState({ page: "chat" }, ""); }
  loadMessages(); listenToChatStatus(groupName); 
}

function loadMessages() {
  if (messagesUnsubscribe) messagesUnsubscribe(); 
  const chatIdForLoad = currentChatId;
  const loadToken = ++messageLoadSeq;
  const isActiveMessageLoad = () => loadToken === messageLoadSeq && currentChatId === chatIdForLoad;
  const q = query(collection(db, "chats", chatIdForLoad, "messages"), orderBy("time", "asc"));
  
  // Clear only once when opening the chat
  showChatLoadingIndicator();
  chatBox.style.transition = "none";
  chatBox.style.visibility = "hidden";
  chatBox.style.opacity = "0";
  chatBox.innerHTML = ""; 
  if(window.msgTimeouts) window.msgTimeouts.forEach(clearTimeout); 
  window.msgTimeouts = [];
  let isFirstSnapshotForChat = true;

  const snapChatToBottom = () => {
      if (!isActiveMessageLoad()) return;
      chatBox.style.scrollBehavior = "auto";
      chatBox.scrollTop = chatBox.scrollHeight;
      requestAnimationFrame(() => {
          if (!isActiveMessageLoad()) return;
          chatBox.scrollTop = chatBox.scrollHeight;
          setTimeout(() => { if (isActiveMessageLoad()) chatBox.scrollTop = chatBox.scrollHeight; }, 80);
          setTimeout(() => { if (isActiveMessageLoad()) chatBox.scrollTop = chatBox.scrollHeight; }, 250);
      });
  };

  const waitForInitialChatLayout = () => new Promise(resolve => {
      const pendingImages = [...chatBox.querySelectorAll("img")].filter(img => !img.complete);
      let settled = false;
      const finish = () => {
          if (settled) return;
          settled = true;
          requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      if (pendingImages.length === 0) {
          finish();
          return;
      }
      let remaining = pendingImages.length;
      const done = () => {
          remaining -= 1;
          if (remaining <= 0) finish();
      };
      pendingImages.forEach(img => {
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
      });
      setTimeout(finish, 1800);
  });

messagesUnsubscribe = onSnapshot(q, async (snapshot) => {
    if (!isActiveMessageLoad()) return;
    let lastMyMsgId = null;
    let isInitialLoad = isFirstSnapshotForChat;
    let hasNewMessages = false; // Track if we need to scroll
    const pendingReadReceipts = [];

    snapshot.docs.forEach(d => { if(d.data().sender === auth.currentUser.uid) lastMyMsgId = d.id; });

    // Process ONLY the messages that were added, modified, or removed
    for (const change of snapshot.docChanges()) {
      const msg = change.doc.data(); 
      const msgId = change.doc.id; 
      const isMe = msg.sender === auth.currentUser.uid;

      if (change.type === "removed") {
          const el = document.getElementById(`msg_${msgId}`);
          if(el) el.remove();
          continue;
      }

      if (msg.expiresAt) {
          const timeLeft = msg.expiresAt - Date.now();
          const wipeMessage = async () => {
              if (msg.imagePublicId) { try { await updateDoc(doc(db, "chats", chatIdForLoad, "messages", msgId), { text: "🚫 Image Expired", imageUrl: null, isExpired: true }); } catch(e) {} } 
              else { try { await deleteDoc(doc(db, "chats", chatIdForLoad, "messages", msgId)); } catch(e) { await updateDoc(doc(db, "chats", chatIdForLoad, "messages", msgId), { text: "", expiresAt: null, isExpired: true }); } }
          };
          if (timeLeft <= 0) { wipeMessage(); continue; } else { window.msgTimeouts.push(setTimeout(wipeMessage, timeLeft)); }
      }
      if (msg.isExpired) {
          const el = document.getElementById(`msg_${msgId}`);
          if (el) el.remove();
          continue;
      }
      if (msg.deletedFor && msg.deletedFor.includes(auth.currentUser.uid)) {
          const el = document.getElementById(`msg_${msgId}`);
          if (el) el.remove();
          continue;
      }

      const pDoodleArea = document.getElementById("privateDoodleArea"); const isDoodleOpen = pDoodleArea && pDoodleArea.style.display === "flex";
      const activeGameArea = document.getElementById("activeGameArea"); const isGameOpen = activeGameArea && activeGameArea.style.display === "flex";
      const isSidebarCoveringChat = window.innerWidth <= 992 && sidebar.style.display !== "none";
      const isChatCurrentlyVisible = activeChatState.style.display === "flex" && document.visibilityState === 'visible' && !isSidebarCoveringChat;

      // Send read receipt if we're looking at the chat
      if (!isMe && !msg.seenAt && !isDoodleOpen && !isGameOpen && isChatCurrentlyVisible) { 
          const updateData = { seenAt: Date.now() }; 
          if (msg.timerDuration) { updateData.expiresAt = Date.now() + msg.timerDuration; } 
          if (isInitialLoad) pendingReadReceipts.push({ msgId, updateData });
          else updateDoc(doc(db, "chats", chatIdForLoad, "messages", msgId), updateData).catch(e=>{}); 
      }

      // Check if this message div already exists
      let div = document.getElementById(`msg_${msgId}`);
      if (!div) {
          div = document.createElement("div");
          div.id = `msg_${msgId}`;
          div.className = `message-wrapper ${isMe ? 'sent' : 'received'}`;
          chatBox.appendChild(div);
          hasNewMessages = true; // Mark that a new message was injected to the DOM
      }
      const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
      let contentHtml = "";

      if (msg.isDeleted) { contentHtml = `<div class="msg-bubble msg-deleted"><i class="fa-solid fa-ban"></i> This message was deleted</div>`; } 
      else if (msg.isDoodleRequest) {
          const encodedText = encodeURIComponent("🎨 Doodle Request"); const encodedName = encodeURIComponent(isMe ? 'You' : (msg.senderName || document.getElementById('chatTargetName').innerText));
          if (isMe) { contentHtml = `<div class="challenge-bubble" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')"><h4>🎨 Doodle Request Sent</h4><p>Waiting for opponent to accept...</p></div>`; }
          else { contentHtml = `<div class="challenge-bubble" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')"><h4>🎨 Shared Whiteboard</h4><p>Wants to draw with you!</p><div class="challenge-actions"><button class="btn-accept" onclick="event.stopPropagation(); acceptDoodle()">Accept</button></div></div>`; }
      } else if (msg.isGameChallenge) {
          const gameNames = { "ludo": "Ludo Arena", "tictactoe": "Tic Tac Toe", "rps": "Rock Paper Scissors", "jetfighter": "Jet Fighter", "carracing": "Car Racing", "cybertanks": "Cyber Tanks (1v1)" };
          const encodedText = encodeURIComponent("🎮 Game Challenge"); const encodedName = encodeURIComponent(isMe ? 'You' : (msg.senderName || document.getElementById('chatTargetName').innerText));
          if (isMe) { 
              contentHtml = `<div class="challenge-bubble" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')"><h4>🎮 Challenge Sent</h4><p>Waiting for opponent to accept ${gameNames[msg.gameType] || 'a Game'}...</p><div class="challenge-actions"><button class="btn-accept" style="background:var(--primary);" onclick="event.stopPropagation(); window.joinGameRoom('${msg.gameId}', '${msg.gameType}')">Enter Game Room</button></div></div>`; 
          } 
          else { contentHtml = `<div class="challenge-bubble" onclick="openMessageModal('${msgId}', '${encodedText}', '${encodedName}', ${isMe}, 'chat')"><h4>🎮 Game Request</h4><p>Wants to play <b>${gameNames[msg.gameType] || 'a Game'}</b></p><div class="challenge-actions"><button class="btn-accept" onclick="event.stopPropagation(); window.acceptGameChallenge('${msg.gameId}', '${msg.gameType}')">Accept</button></div></div>`; }
      } else {
        let decryptedText = msg.text;
        if (msg.text && msg.text.startsWith("E2EE:")) decryptedText = await CryptoE2EE.decrypt(msg.text, activeSharedKey);
        if (!isActiveMessageLoad()) return;
        if (!decryptedText && !msg.imageUrl) continue;
        
        let decReplyText = msg.replyToText;
        if (msg.replyToText && msg.replyToText.startsWith("E2EE:")) decReplyText = await CryptoE2EE.decrypt(msg.replyToText, activeSharedKey);
        if (!isActiveMessageLoad()) return;
        
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
      
      // WhatsApp style: Only show the tick on the absolute LAST message sent by me
      let seenTickHtml = (isMe && msgId === lastMyMsgId && msg.seenAt) ? `<i class="fa-solid fa-check-double" style="color: #3b82f6; margin-left: 5px; font-size: 11px;"></i>` : (isMe && msgId === lastMyMsgId ? `<i class="fa-solid fa-check" style="color: var(--text-muted); margin-left: 5px; font-size: 11px;"></i>` : '');
      
      div.innerHTML = `${!isMe ? `<img src="${avatarSrc}" class="msg-avatar" data-uid="${msg.sender}">` : ''}<div style="display:flex; flex-direction:column; max-width: 100%;">${contentHtml}<div class="msg-time">${timeStr}${seenTickHtml}</div></div>`;
      if (isInitialLoad) {
          div.querySelectorAll("img").forEach(img => img.addEventListener("load", snapChatToBottom, { once: true }));
      }
      
    } // <-- This brace ends the docChanges() loop
    
    // 1. ENFORCE ABSOLUTE CHRONOLOGICAL ORDER
    // This loops through the perfectly sorted Firebase docs and re-appends them in exact order.
    snapshot.docs.forEach(doc => {
        const el = document.getElementById(`msg_${doc.id}`);
        if (el) chatBox.appendChild(el); // automatically forces DOM elements into their correct sorted position
    });

    // 2. SCROLL & REVEAL LOGIC (Fixes the Jitter)
    if (isInitialLoad) {
        snapChatToBottom(); // Instant snap to the newest message when opening a chat
        await waitForInitialChatLayout();
        if (!isActiveMessageLoad()) return;
        snapChatToBottom();
        
        setTimeout(() => { 
            if (!isActiveMessageLoad()) return;
            hideChatLoadingIndicator();
            chatBox.style.visibility = "visible";
            chatBox.style.opacity = "1";
            chatBox.style.transition = "";
            pendingReadReceipts.forEach(({ msgId, updateData }) => {
                updateDoc(doc(db, "chats", chatIdForLoad, "messages", msgId), updateData).catch(e=>{});
            });
        }, 50); 
    } else if (hasNewMessages) {
        chatBox.style.scrollBehavior = "";
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' }); // Smooth scroll for live incoming messages
    }
    isFirstSnapshotForChat = false;

    // Cleanup old ticks visually
    document.querySelectorAll('.fa-check-double, .fa-check').forEach(icon => {
        const parentMsg = icon.closest('.message-wrapper');
        if (parentMsg && parentMsg.id !== `msg_${lastMyMsgId}`) {
            icon.remove();
        }
    });

  }, (error) => {
      console.error("Error loading messages:", error);
      hideChatLoadingIndicator();
      chatBox.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Unable to load messages: ${error.message}</div>`;
      chatBox.style.visibility = "visible";
      chatBox.style.opacity = "1";
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
window.triggerEdit = async () => { closeMsgOptions(); const newText = await customPrompt("Edit message", activeMsgText, "Update your message..."); if (newText !== null && newText.trim() !== "" && newText !== activeMsgText) { if (activeMsgContext === 'global') { await updateDoc(doc(db, "global_lounge", activeMsgId), { text: newText.trim(), isEdited: true }); } else { const eText = activeSharedKey ? await CryptoE2EE.encrypt(newText.trim(), activeSharedKey) : newText.trim(); await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { text: eText, isEdited: true }); } } };
window.triggerDeleteEveryone = async () => { closeMsgOptions(); const isConfirmed = await customConfirm("Delete for Everyone", "Delete this message for everyone? It cannot be restored.", "Delete", "#ef4444"); if (isConfirmed) { if (activeMsgContext === 'global') { await updateDoc(doc(db, "global_lounge", activeMsgId), { isDeleted: true, text: "" }); } else { await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { isDeleted: true, text: "" }); } } };
window.triggerDeleteMe = async () => { closeMsgOptions(); const isConfirmed = await customConfirm("Delete for Me", "Delete this message for yourself?", "Delete", "#f59e0b"); if (isConfirmed) { if (activeMsgContext === 'global') { await updateDoc(doc(db, "global_lounge", activeMsgId), { deletedFor: arrayUnion(auth.currentUser.uid) }); } else { await updateDoc(doc(db, "chats", currentChatId, "messages", activeMsgId), { deletedFor: arrayUnion(auth.currentUser.uid) }); } } };
document.getElementById("cancelReplyBtn").addEventListener("click", () => { replyingToMsg = null; const previewContainer = document.getElementById("replyPreviewContainer"); previewContainer.style.display = "none"; document.getElementById("activeChatState").insertBefore(previewContainer, document.querySelector("#activeChatState .chat-input-wrapper")); });
window.sendChatRequest = async () => { if (!currentChatId || !targetUserUid) return; try { await setDoc(doc(db, "chats", currentChatId), { status: 'pending', initiator: auth.currentUser.uid, createdAt: Date.now() }); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "👋 Connection Request", unread: true } } }, { merge: true }); showToast("Request Sent", "Waiting for approval."); } catch (error) { showToast("Error", "Failed to send request."); } };
window.acceptChatRequest = async () => { if (!currentChatId) return; try { await updateDoc(doc(db, "chats", currentChatId), { status: 'accepted' }); showToast("Connected", "You can now chat!"); } catch (error) { showToast("Error", "Failed to accept request."); } };
window.declineChatRequest = async () => { if (!currentChatId) return; try { await deleteDoc(doc(db, "chats", currentChatId)); showToast("Declined", "Request removed."); if (window.innerWidth <= 992) document.getElementById("backToUsersBtn").click(); } catch (error) { showToast("Error", "Failed to decline request."); } };
let typingUnsubscribe = null;
let presenceUnsubscribe = null;

function listenToTyping() { 
    if (typingUnsubscribe) { typingUnsubscribe(); typingUnsubscribe = null; }
    if (presenceUnsubscribe) { presenceUnsubscribe(); presenceUnsubscribe = null; }
    if (isCurrentChatGroup || !targetUserUid) return; 

    const statusEl = document.getElementById("chatTargetStatus");
    let currentlyTyping = false;
    let liveTargetUser = allUsers.find(u => u.id === targetUserUid) || {};

    const updateHeaderStatus = () => {
        if (!liveTargetUser || !liveTargetUser.id) return;
        const canSeeStatus = canSeePrivacy(liveTargetUser, 'privacyStatus');
        const canSeeTyping = canSeePrivacy(liveTargetUser, 'privacyTyping');

        if (currentlyTyping && canSeeTyping) {
            statusEl.style.display = "";
            statusEl.innerText = "typing..."; 
            statusEl.classList.remove("online");
        } else if (canSeeStatus) {
            statusEl.style.display = "";
            if (liveTargetUser.isOnline) { statusEl.innerText = "Online"; statusEl.classList.add("online"); } 
            else { statusEl.innerText = `Last seen: ${timeAgo(liveTargetUser.lastSeen)}`; statusEl.classList.remove("online"); } 
        } else { 
            statusEl.innerText = ""; 
            statusEl.classList.remove("online"); 
            statusEl.style.display = "none"; 
        }
    };

    typingUnsubscribe = onSnapshot(doc(db, "chats", currentChatId), (docSnap) => { 
        currentlyTyping = docSnap.exists() && docSnap.data()[`typing_${targetUserUid}`];
        updateHeaderStatus();
    }); 

    presenceUnsubscribe = onSnapshot(doc(db, "users", targetUserUid), (userSnap) => {
        if (userSnap.exists()) {
            liveTargetUser = { ...liveTargetUser, ...userSnap.data(), id: targetUserUid };
            updateHeaderStatus();
        }
    });
}

msgInput.addEventListener("input", async () => { 
    if(!currentChatId || isCurrentChatGroup) return; 
    if (myUserData) {
        const mySetting = myUserData.privacyTyping || 'everyone';
        if (mySetting === 'none') return;
        if (mySetting === 'friends' && !(myUserData.chatMeta && myUserData.chatMeta[targetUserUid])) return;
    }
    await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: true }, { merge: true }); 
    clearTimeout(typingTimeout); 
    typingTimeout = setTimeout(async () => { await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true }); }, 1500); 
});
let isSendingMsg = false;
async function sendMessage() {
  if (isSendingMsg) return;
  const text = msgInput.value.trim(); if (!text) return;
  isSendingMsg = true;
  const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 0;
  msgInput.value = ""; msgInput.style.height = "20px"; msgInput.focus(); 
  if (!isCurrentChatGroup && currentChatStatus !== 'accepted') {
      isSendingMsg = false;
      return;
  }
  
  // Encrypt outbound payload via Web Crypto
  let encryptedText = text;
  if (!isCurrentChatGroup && activeSharedKey) encryptedText = await CryptoE2EE.encrypt(text, activeSharedKey);
  
  if (!isCurrentChatGroup) {
    await setDoc(doc(db, "chats", currentChatId), { [`typing_${auth.currentUser.uid}`]: false }, { merge: true });
    try {
      await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { time: Date.now(), text: `You: ${text}`, unread: false, unreadCount: 0 } } }, { merge: true });
      await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: text, unread: true, unreadCount: increment(1) } } }, { merge: true });
    } catch(err) {}
  } else {
    // Group chat: notify all other members so they get an in-app toast
    try {
      const group = allGroups.find(g => g.id === currentChatId);
      if (group) {
        const myName = document.getElementById("myName").innerText;
        const batch = writeBatch(db);
        
        batch.set(doc(db, "users", auth.currentUser.uid), {
          chatMeta: { [currentChatId]: { time: Date.now(), text: `You: ${text}`, unread: false, unreadCount: 0, isGroup: true, groupId: currentChatId, groupName: document.getElementById("chatTargetName").innerText } }
        }, { merge: true });

        group.members.forEach(memberId => {
          if (memberId !== auth.currentUser.uid) {
            batch.set(doc(db, "users", memberId), {
              chatMeta: { [currentChatId]: { time: Date.now(), text: `${myName}: ${text}`, unread: true, unreadCount: increment(1), isGroup: true, groupId: currentChatId, groupName: document.getElementById("chatTargetName").innerText } }
            }, { merge: true });
          }
        });
        await batch.commit();
      }
    } catch(err) { console.log("Group meta update error:", err); }
  }
  const payload = { text: encryptedText, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false, isGameChallenge: false };
  if (window.isGhostModeActive) { payload.timerDuration = 10000; payload.isGhost = true; } else if (timerValue > 0) { payload.timerDuration = timerValue; }
  
  if (replyingToMsg && replyingToMsg.context === 'chat') { 
      payload.replyToId = replyingToMsg.id; 
      payload.replyToText = activeSharedKey ? await CryptoE2EE.encrypt(replyingToMsg.text, activeSharedKey) : replyingToMsg.text; 
      payload.replyToName = replyingToMsg.name; document.getElementById("cancelReplyBtn").click(); 
  }
  try { 
      await addDoc(collection(db, "chats", currentChatId, "messages"), payload); 
  } catch (e) { 
      showToast("Error", "Message failed to send."); 
  } finally {
      isSendingMsg = false;
  }
}
sendBtn.addEventListener("click", (e) => { if(e) { e.preventDefault(); e.stopPropagation(); } sendMessage(); }); 
msgInput.addEventListener("keypress", (e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } });
// Auto-resize textarea as user types
msgInput.addEventListener("input", () => {
    msgInput.style.height = "20px";
    msgInput.style.height = Math.min(msgInput.scrollHeight, 100) + "px";
});
searchInput.addEventListener("input", (e) => { 
    const term = e.target.value.toLowerCase(); let hasVisible = false;
    const activeList = document.getElementById("usersList").style.display !== "none" ? document.getElementById("usersList") : document.getElementById("groupsList");
    document.querySelectorAll(".user-item").forEach(item => { const match = item.innerText.toLowerCase().includes(term); item.style.display = match ? "flex" : "none"; if (match && item.parentElement === activeList) hasVisible = true; }); 
    let noResultsMsg = document.getElementById("noResultsSearch");
    if (!hasVisible && term !== "") { if (!noResultsMsg) { noResultsMsg = document.createElement("div"); noResultsMsg.id = "noResultsSearch"; noResultsMsg.style.cssText = "padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;"; noResultsMsg.innerText = "No connections match your search."; } activeList.appendChild(noResultsMsg); noResultsMsg.style.display = "block"; } else if (noResultsMsg) { noResultsMsg.style.display = "none"; }
});
const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none"; document.body.appendChild(fileInput);
document.querySelector('.fa-paperclip').parentElement.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async (e) => { 
    const file = e.target.files[0]; if (!file || !currentChatId) return; 
    if (file.size > 5000000) { 
        alert("File is too large! Please choose an image under 5MB."); 
        fileInput.value = ""; 
        return; 
    }
    const originalHtml = sendBtn.innerHTML; sendBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>"; sendBtn.disabled = true; 
    try { 
        const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); 
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); 
        const data = await response.json(); 
        const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 0; 
        const optimizedUrl = data.secure_url.replace('/upload/', '/upload/q_auto,f_auto,w_600/'); 
        const payload = { text: "", imageUrl: optimizedUrl, imagePublicId: data.public_id, sender: auth.currentUser.uid, senderName: document.getElementById("myName").innerText, time: Date.now(), isEdited: false, isDeleted: false }; 
        if (timerValue > 0) payload.timerDuration = timerValue; 
        
        // 1. Save the actual message
        await addDoc(collection(db, "chats", currentChatId, "messages"), payload); 

      // 2. NEW: Update the metadata so the notification actually triggers!
        if (!isCurrentChatGroup) {
            try {
                await setDoc(doc(db, "users", auth.currentUser.uid), { chatMeta: { [targetUserUid]: { time: Date.now(), text: `You sent an image 📷`, unread: false, unreadCount: 0 } } }, { merge: true });
                await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: `Sent an image 📷`, unread: true, unreadCount: increment(1) } } }, { merge: true });
            } catch(err) {}
        }
    } catch (err) { 
        alert("Upload failed: " + err.message); 
    } finally { 
        sendBtn.innerHTML = originalHtml; sendBtn.disabled = false; fileInput.value = ""; 
    } 
});
document.querySelector(".chat-header").addEventListener("click", (e) => {
    if (e.target.closest('.mobile-back-btn') || e.target.closest('#launchGameMenuBtn') || e.target.closest('#chatSettingsBtn') || e.target.closest('#chatDoodleBtn') || e.target.closest('#ghostModeBtn') || e.target.closest('#callMenuBtn')) return;
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
            const leaveBtn = document.getElementById("leaveGroupBtn");
            if (addMemberBtn) { addMemberBtn.style.display = "flex"; addMemberBtn.innerHTML = isAdmin ? '<i class="fa-solid fa-user-plus"></i> Add New Member' : '<i class="fa-solid fa-user-plus"></i> Request to Add'; }
            if (leaveBtn) {
                leaveBtn.style.display = "flex";
                leaveBtn.onclick = async () => {
                    const isConfirmed = await customConfirm("Leave Group", `Are you sure you want to leave ${group.name}? You will lose access to all messages.`, "Leave", "#f59e0b");
                    if (isConfirmed) {
                        leaveBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Leaving...";
                        if (isAdmin) {
                            const otherMembers = group.members.filter(m => m !== auth.currentUser.uid);
                            if (otherMembers.length > 0) {
                                await updateDoc(doc(db, "groups", currentChatId), { createdBy: otherMembers[0], members: arrayRemove(auth.currentUser.uid) });
                                showToast("Left Group", "You have left the group and ownership was transferred.");
                            } else {
                                const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages"))); const batch = writeBatch(db); msgsSnap.docs.forEach(msgDoc => batch.delete(msgDoc.ref)); await batch.commit(); await deleteDoc(doc(db, "groups", currentChatId));
                                showToast("Group Deleted", "You were the last member. Group deleted.");
                            }
                        } else {
                            await updateDoc(doc(db, "groups", currentChatId), { members: arrayRemove(auth.currentUser.uid) });
                            showToast("Left Group", "You have left the group.");
                        }
                        document.getElementById("groupSettingsModal").style.display = "none"; 
                        document.getElementById("backToUsersBtn").click();
                    }
                };
            }
            if (isAdmin) { 
                deleteBtn.style.display = "flex"; 
                if (group.pendingMembers && group.pendingMembers.length > 0) {
                    pendingReqDiv.style.display = "block"; pendingReqDiv.innerHTML = "<h4 style='font-size:12px; color:var(--primary); margin-bottom:8px;'>Pending Approvals:</h4>";
                    group.pendingMembers.forEach(pendingId => {
                        const pUser = allUsers.find(u => u.id === pendingId); const pName = pUser ? (pUser.fullName || pUser.username) : "Unknown User";
                        pendingReqDiv.innerHTML += `<div style="font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;"><span>${pName}</span><div><button onclick="approveMember('${group.id}', '${pendingId}')" style="background:#10b981; border:none; color:white; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; margin-right:5px;">Approve</button><button onclick="rejectMember('${group.id}', '${pendingId}')" style="background:#ef4444; border:none; color:white; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Reject</button></div></div>`;
                    });
                } else { pendingReqDiv.style.display = "none"; }
                deleteBtn.onclick = async () => { const isConfirmed = await customConfirm("Delete Group", `Are you sure you want to delete ${group.name}? This action cannot be undone.`, "Delete", "#ef4444"); if (isConfirmed) { deleteBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Deleting..."; const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages"))); const batch = writeBatch(db); msgsSnap.docs.forEach(msgDoc => batch.delete(msgDoc.ref)); await batch.commit(); await deleteDoc(doc(db, "groups", currentChatId)); document.getElementById("groupSettingsModal").style.display = "none"; document.getElementById("backToUsersBtn").click(); showToast("Group Deleted", "Group permanently wiped."); } }; 
            } else { deleteBtn.style.display = "none"; if (pendingReqDiv) pendingReqDiv.style.display = "none"; }
            document.getElementById("groupSettingsModal").style.display = "flex";
        }
    }
});
window.triggerAddGroupMember = async () => { const group = allGroups.find(g => g.id === currentChatId); if(!group) return; const isAdmin = group.createdBy === auth.currentUser.uid; const pendingArr = group.pendingMembers || []; const result = await openSelectUsersModal('add_members', group.members, pendingArr); if (!result) return; const selectedMembers = result.members; if (isAdmin) { await updateDoc(doc(db, "groups", currentChatId), { members: arrayUnion(...selectedMembers) }); showToast("Members Added", `${selectedMembers.length} member(s) added.`); } else { await updateDoc(doc(db, "groups", currentChatId), { pendingMembers: arrayUnion(...selectedMembers) }); showToast("Request Sent", "Admin must approve these requests."); } document.getElementById("groupSettingsModal").style.display = "none"; };
window.triggerAddGroupMember = async () => { 
    const group = allGroups.find(g => g.id === currentChatId); 
    if(!group) return; 
    const isAdmin = group.createdBy === auth.currentUser.uid; 
    const pendingArr = group.pendingMembers || []; 
    const invitedArr = group.invitedMembers || [];
    const result = await openSelectUsersModal('add_members', group.members, [...pendingArr, ...invitedArr]); 
    if (!result) return; 
    const selectedMembers = result.members; 
    if (isAdmin) { 
        await updateDoc(doc(db, "groups", currentChatId), { invitedMembers: arrayUnion(...selectedMembers) }); 
        showToast("Invites Sent", `Invitations sent to ${selectedMembers.length} user(s).`); 
        selectedMembers.forEach(uid => {
            const u = allUsers.find(x => x.id === uid);
            const pref = u ? (u.privacyGroupInvite || 'everyone') : 'everyone';
            const isFriend = u && !!(u.chatMeta && u.chatMeta[auth.currentUser.uid]);
            let shouldNotify = true;
            if (pref === 'none') shouldNotify = false;
            if (pref === 'friends' && !isFriend) shouldNotify = false;

            setDoc(doc(db, "users", uid), {
                chatMeta: {
                    [currentChatId]: {
                        time: Date.now(),
                        text: `You were invited to join ${group.name}`,
                        unread: shouldNotify,
                        unreadCount: shouldNotify ? increment(1) : 0,
                        isGroup: true,
                        groupId: currentChatId,
                        groupName: group.name
                    }
                }
            }, { merge: true });
        });
    } else { 
        await updateDoc(doc(db, "groups", currentChatId), { pendingMembers: arrayUnion(...selectedMembers) }); 
        showToast("Request Sent", "Admin must approve these requests."); 
    } 
    document.getElementById("groupSettingsModal").style.display = "none"; 
};
window.triggerRemoveMember = async (groupId, memberId) => { const isConfirmed = await customConfirm("Remove Member", "Are you sure you want to kick this user from the group?", "Remove", "#ef4444"); if(isConfirmed) { try { await updateDoc(doc(db, "groups", groupId), { members: arrayRemove(memberId) }); showToast("Member Removed", "User was kicked from the group."); } catch(e) { showToast("Error", "Failed to remove member."); } } };
window.triggerGroupAvatarUpload = () => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.onchange = async (e) => { const file = e.target.files[0]; if(!file) return;if (file.size > 5000000) { 
            alert("File is too large! Please choose an image under 5MB."); 
            return; 
        } try { showToast("Uploading...", "Updating group icon"); const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); const data = await response.json(); await updateDoc(doc(db, "groups", currentChatId), { avatarUrl: data.secure_url }); document.getElementById("groupSettingsAvatar").src = data.secure_url; document.getElementById("chatTargetAvatar").src = data.secure_url; showToast("Success", "Group icon updated!"); } catch(err) { alert("Failed to update group image."); } }; input.click(); };

bindPointerTap(launchGameMenuBtn, () => { gameSelectionModal.style.display = "flex"; });
bindPointerTap(closeGameSelectBtn, () => { gameSelectionModal.style.display = "none"; });

let isSendingChallenge = false;
document.querySelectorAll(".game-select-btn").forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    bindPointerTap(newBtn, async (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (isSendingChallenge) return;
        isSendingChallenge = true;
        newBtn.classList.add("loading");
        try {
            const gameType = newBtn.getAttribute("data-game"); gameSelectionModal.style.display = "none"; const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 0;
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
        } catch (error) {
            console.error(error);
        } finally {
            newBtn.classList.remove("loading");
            setTimeout(() => { isSendingChallenge = false; }, 500);
        }
    });
});
window.acceptGameChallenge = async (gameId, gameType) => { await updateDoc(doc(db, "games", gameId), { status: "playing" }); joinGameRoom(gameId, gameType); };
closeGameBtn.addEventListener("click", () => { if(currentAnimationId) cancelAnimationFrame(currentAnimationId); if (singlePlayerMode) { singlePlayerMode = false; spTttActive = false; if (window.innerWidth <= 992) sidebar.style.display = "flex"; } else { if(gameUnsubscribe) gameUnsubscribe(); if(currentGameId) { updateDoc(doc(db, "games", currentGameId), { status: "abandoned" }); } } activeGameArea.style.display = "none"; currentGameId = null; isPlayingActionGame = false; if (currentChatId) { loadMessages(); } });
window.joinGameRoom = function(gameId, gameType) {
    currentGameId = gameId; isPlayingActionGame = false; singlePlayerMode = false; activeGameArea.style.display = "flex";
    if (window.innerWidth <= 992) sidebar.style.display = "none";
    let gTitle = "Game"; if (gameType === 'tictactoe') gTitle = "Tic Tac Toe"; if (gameType === 'rps') gTitle = "Rock Paper Scissors"; if (gameType === 'jetfighter') gTitle = "Jet Fighter"; if (gameType === 'carracing') gTitle = "Car Racing"; if (gameType === 'ludo') gTitle = "Ludo Arena"; if (gameType === 'cybertanks') gTitle = "Cyber Tanks (1v1)"; document.getElementById("activeGameTitle").innerText = gTitle;
    if(gameUnsubscribe) gameUnsubscribe();
    gameUnsubscribe = onSnapshot(doc(db, "games", gameId), (docSnap) => {
        if(!docSnap.exists()) return; const data = docSnap.data();
        if(data.status === "abandoned") { gameUIContainer.innerHTML = `<h3 style="color:var(--accent);">Opponent left the game.</h3>`; isPlayingActionGame = false; return; }
        if(data.status === "waiting") { gameUIContainer.innerHTML = `<h3>Waiting for opponent... <i class="fa-solid fa-spinner fa-spin"></i></h3>`; isPlayingActionGame = false; return; }
        if (data.status === "playing" && !isPlayingActionGame && (data.type === 'jetfighter' || data.type === 'carracing' || data.type === 'cybertanks')) {
            const myScore = data.player1 === auth.currentUser.uid ? data.p1Score : data.p2Score;
            if (myScore === null || myScore === undefined) isPlayingActionGame = false;
        }
        if (data.type === 'tictactoe') renderTicTacToe(data, gameId); if (data.type === 'rps') renderRPS(data, gameId); if (data.type === 'jetfighter') renderActionGame(data, gameId, 'jetfighter'); if (data.type === 'carracing') renderActionGame(data, gameId, 'carracing'); if (data.type === 'ludo') renderLudo(data, gameId);
        if (data.type === 'cybertanks') renderActionGame(data, gameId, 'cybertanks');
    });
};
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
window.rollLudoDice = async (gameId, myRole) => { const diceBtn = document.getElementById("ludoDiceBtn"); diceBtn.classList.add("dice-rolling"); diceBtn.classList.remove("pulse"); diceBtn.disabled = true; setTimeout(async () => { const roll = Math.floor(Math.random() * 6) + 1; await updateDoc(doc(db, "games", gameId), { diceValue: roll }); const docSnap = await getDoc(doc(db, "games", gameId)); const data = docSnap.data(); let canMove = false; data.ludoTokens[myRole].forEach(pos => { if (pos === -1 && roll === 6) canMove = true; if (pos !== -1) { if (myRole === 'p1' && pos + roll <= 57) canMove = true; if (myRole === 'p2') { let absoluteProgress = pos >= 26 ? (pos - 26) : (pos + 26); if (absoluteProgress + roll <= 57) canMove = true; } } }); if (!canMove) { setTimeout(async () => { const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; await updateDoc(doc(db, "games", gameId), { turn: nextTurn, diceValue: null }); }, 1000); } }, 500); };
window.moveLudoToken = async (gameId, data, tokenIndex, role) => { let tokens = { ...data.ludoTokens }; let roll = data.diceValue; let currPos = tokens[role][tokenIndex]; let newPos = currPos; if (currPos === -1) { if (roll !== 6) return; newPos = role === 'p1' ? 0 : 26; } else { if (role === 'p1') { newPos = currPos + roll; if (newPos > 51 && currPos <= 51) newPos = 51 + (newPos - 51); if (newPos > 57) return; } else { newPos = currPos + roll; if (currPos <= 24 && newPos >= 25) { newPos = 56 + (newPos - 24); } else if (newPos > 51 && currPos > 24 && currPos <= 51) { newPos = newPos - 52; } if (newPos > 62) return; } } tokens[role][tokenIndex] = newPos; const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; let hasKilled = false; let oppRole = role === 'p1' ? 'p2' : 'p1'; if (!safeZones.includes(newPos) && newPos <= 51) { tokens[oppRole].forEach((oppPos, idx) => { if (oppPos === newPos) { tokens[oppRole][idx] = -1; hasKilled = true; } }); } let hasWon = false; if (role === 'p1' && tokens.p1.every(p => p === 57)) hasWon = true; if (role === 'p2' && tokens.p2.every(p => p === 62)) hasWon = true; let nextTurn = data.turn; let nextDice = null; if (roll !== 6 && !hasKilled && !hasWon) { nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; } await updateDoc(doc(db, "games", gameId), { ludoTokens: tokens, turn: nextTurn, diceValue: nextDice, winner: hasWon ? auth.currentUser.uid : null }); };
window.resetLudo = async (gameId) => { const docSnap = await getDoc(doc(db, "games", gameId)); await updateDoc(doc(db, "games", gameId), { ludoTokens: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }, winner: null, turn: docSnap.data().player1, diceValue: null }); };
window.startSinglePlayer = (gameType) => { singlePlayerMode = true; currentGameId = null; if (window.innerWidth <= 992) sidebar.style.display = "none"; activeGameArea.style.display = "flex"; if (gameType === 'tictactoe') { spTttReset(); } else if (gameType === 'rps') { renderSinglePlayerRPS(); } else if (gameType === 'jetfighter' || gameType === 'carracing' || gameType === 'flappybird') { renderSinglePlayerAction(gameType); } else if (gameType === 'ludo') { spLudoReset(); } };

let spLudoTokens = { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }; let spLudoTurn = 'p1'; let spLudoDice = null; let spLudoActive = true; let spLudoWinner = null; let isComputerThinking = false;
function getSpLudoProgress(player, pos) { if (pos === -1) return -1; if (player === 'p1') { if (pos >= 52) return 51 + (pos - 51); return pos; } else { if (pos >= 57) return 51 + (pos - 56); return (pos - 26 + 52) % 52; } }
function isSpLudoMoveValid(player, tokenIndex, dice) { const pos = spLudoTokens[player][tokenIndex]; const winPos = player === 'p1' ? 57 : 62; if (pos === winPos) return false; if (pos === -1) return dice === 6; const progress = getSpLudoProgress(player, pos); return progress + dice <= 57; }
window.spLudoReset = () => { spLudoTokens = { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }; spLudoTurn = 'p1'; spLudoDice = null; spLudoActive = true; spLudoWinner = null; isComputerThinking = false; renderSinglePlayerLudo(); };
function renderSinglePlayerLudo() {
    document.getElementById("activeGameTitle").innerText = "Ludo Arena (Solo)"; const isMyTurn = spLudoTurn === 'p1'; const diceIcons = ['🎲', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']; let currentDice = spLudoDice ? diceIcons[spLudoDice] : '🎲';
    let statusText = spLudoWinner ? (spLudoWinner === 'p1' ? "🎉 You Won!" : "😞 Computer Won!") : (isMyTurn ? "Your Turn" : "Computer's Turn...");
    let html = `<div class="ludo-header-info"><div class="ludo-player-badge red-badge ${isMyTurn && !spLudoWinner ? 'active' : ''}">You</div><div class="ludo-vs">VS</div><div class="ludo-player-badge blue-badge ${!isMyTurn && !spLudoWinner ? 'active' : ''}">Computer</div></div><div class="game-turn-indicator" style="color: ${isMyTurn && !spLudoWinner ? '#ef4444' : 'white'}; font-weight:bold; margin-top: 10px;">${statusText}</div><div class="ludo-container"><div class="ludo-board-wrapper" id="ludoBoard"></div><div class="ludo-controls"><button id="ludoDiceBtn" class="dice-btn ${!spLudoDice && isMyTurn ? 'pulse' : ''}" ${!isMyTurn || spLudoWinner || isComputerThinking ? 'disabled' : ''} onclick="spLudoRollDice()">${currentDice}</button></div>${spLudoWinner ? `<button class="primary-btn glow-btn" style="max-width:200px;" onclick="spLudoReset()">Play Again</button>` : ''}</div>`;
    gameUIContainer.innerHTML = html; const board = document.getElementById("ludoBoard"); board.innerHTML += `<div class="ludo-base red-base"><div class="base-inner"></div></div><div class="ludo-base blue-base"><div class="base-inner"></div></div>`;
    ludoPath.forEach((pos, i) => { let extraClass = ''; if (i >= 52 && i < 57) extraClass = 'path-red'; if (i >= 57 && i < 62) extraClass = 'path-blue'; const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; if (safeZones.includes(i)) extraClass += ' safe-zone'; if (i === 0) extraClass += ' start-red'; if (i === 26) extraClass += ' start-blue'; board.innerHTML += `<div class="ludo-cell ${extraClass}" style="left:${pos.x - 10}px; top:${pos.y - 10}px;">${safeZones.includes(i) ? '<i class="fa-solid fa-star" style="font-size:8px; opacity:0.5; color:white;"></i>' : ''}</div>`; });
    ['p1', 'p2'].forEach(player => {
        spLudoTokens[player].forEach((pos, index) => {
            const winPos = player === 'p1' ? 57 : 62; if (pos === winPos) return;
            let coords = pos === -1 ? ludoBases[player][index] : ludoPath[pos]; let token = document.createElement("div"); token.className = `ludo-token token-${player === 'p1' ? 'red' : 'blue'}`;
            if (isMyTurn && player === 'p1' && spLudoDice && !spLudoWinner && isSpLudoMoveValid('p1', index, spLudoDice)) { token.classList.add('token-playable'); token.onclick = () => spLudoMoveToken(index); }
            token.style.left = `${coords.x}px`; token.style.top = `${coords.y}px`; board.appendChild(token);
        });
    });
}
window.spLudoRollDice = () => {
    if (spLudoTurn !== 'p1' || spLudoDice) return; const diceBtn = document.getElementById("ludoDiceBtn"); diceBtn.classList.add("dice-rolling"); diceBtn.classList.remove("pulse"); diceBtn.disabled = true;
    setTimeout(() => {
        const roll = Math.floor(Math.random() * 6) + 1; spLudoDice = roll; let canMove = false;
        for (let i = 0; i < 4; i++) { if (isSpLudoMoveValid('p1', i, spLudoDice)) { canMove = true; break; } }
            renderSinglePlayerLudo();
            if (!canMove) { setTimeout(() => { spLudoTurn = 'p2'; spLudoDice = null; renderSinglePlayerLudo(); setTimeout(triggerComputerLudoTurn, 1000); }, 1000); }
    }, 500);
};
window.spLudoMoveToken = (tokenIndex) => {
    if (spLudoTurn !== 'p1' || !spLudoDice || !isSpLudoMoveValid('p1', tokenIndex, spLudoDice)) return;
    let roll = spLudoDice; let currPos = spLudoTokens.p1[tokenIndex]; let newPos;
    if (currPos === -1) { newPos = 0; } else { let progress = getSpLudoProgress('p1', currPos); let newProgress = progress + roll; if (newProgress === 57) newPos = 57; else if (newProgress > 51) newPos = 52 + (newProgress - 52); else newPos = newProgress; }
    spLudoTokens.p1[tokenIndex] = newPos;
    const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; let hasKilled = false;
        if (!safeZones.includes(newPos) && newPos <= 51) { for (let i = 0; i < 4; i++) { if (spLudoTokens.p2[i] === newPos) { spLudoTokens.p2[i] = -1; hasKilled = true; break; } } }
    if (spLudoTokens.p1.every(p => p === 57)) { spLudoWinner = 'p1'; spLudoActive = false; }
    if (roll !== 6 && !hasKilled && !spLudoWinner) { spLudoTurn = 'p2'; }
    spLudoDice = null; renderSinglePlayerLudo();
    if (spLudoTurn === 'p2' && spLudoActive) { setTimeout(triggerComputerLudoTurn, 1000); }
};
function triggerComputerLudoTurn() {
    if (spLudoTurn !== 'p2' || !spLudoActive) return; isComputerThinking = true; renderSinglePlayerLudo();
    setTimeout(() => {
        const roll = Math.floor(Math.random() * 6) + 1; spLudoDice = roll; const move = getComputerLudoMove(roll);
            renderSinglePlayerLudo();
            setTimeout(() => {
                if (move.tokenIndex === -1) { spLudoTurn = 'p1'; spLudoDice = null; isComputerThinking = false; renderSinglePlayerLudo(); return; }
                let currPos = spLudoTokens.p2[move.tokenIndex]; let newPos;
                if (currPos === -1) { newPos = 26; } else { let progress = getSpLudoProgress('p2', currPos); let newProgress = progress + roll; if (newProgress === 57) newPos = 62; else if (newProgress > 51) newPos = 57 + (newProgress - 52); else newPos = (26 + newProgress) % 52; }
                spLudoTokens.p2[move.tokenIndex] = newPos;
                const safeZones = [0, 8, 13, 21, 26, 34, 39, 47]; let hasKilled = false;
                if (!safeZones.includes(newPos) && newPos <= 51) { for (let i = 0; i < 4; i++) { if (spLudoTokens.p1[i] === newPos) { spLudoTokens.p1[i] = -1; hasKilled = true; break; } } }
                if (spLudoTokens.p2.every(p => p === 62)) { spLudoWinner = 'p2'; spLudoActive = false; }
                if (roll !== 6 && !hasKilled && !spLudoWinner) { spLudoTurn = 'p1'; }
                spLudoDice = null; isComputerThinking = false; renderSinglePlayerLudo();
                if (spLudoTurn === 'p2' && spLudoActive) { setTimeout(triggerComputerLudoTurn, 1000); }
            }, 1000);
        }, 1000);
}
function getComputerLudoMove(dice) {
    let moves = [];
    for (let i = 0; i < 4; i++) {
        if (isSpLudoMoveValid('p2', i, dice)) {
            let score = 0; const currPos = spLudoTokens.p2[i]; let newPos;
            if (currPos === -1) {
                newPos = 26;
            } else {
                const progress = getSpLudoProgress('p2', currPos);
                const newProgress = progress + dice;
                if (newProgress === 57) newPos = 62;
                else if (newProgress > 51) newPos = 57 + (newProgress - 52);
                else newPos = (26 + newProgress) % 52;
            }
            if (newPos === 62) score += 1000;
            const safeZones = [0, 8, 13, 21, 26, 34, 39, 47];
            if (!safeZones.includes(newPos) && newPos <= 51 && spLudoTokens.p1.includes(newPos)) { score += 500; }
            if (currPos === -1 && dice === 6) score += 200;
            if (safeZones.includes(newPos) && !safeZones.includes(currPos)) score += 50;
            score += getSpLudoProgress('p2', newPos);
            moves.push({ tokenIndex: i, score: score });
        }
    }
    if (moves.length === 0) return { tokenIndex: -1, score: 0 };
    moves.sort((a, b) => b.score - a.score);
    return moves[0];
}

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
    if (canvas) { const ctx = canvas.getContext('2d'); if (gameType === 'carracing') { ctx.fillStyle = '#8b5cf6'; ctx.fillRect(135, 330, 30, 50); } else if (gameType === 'cybertanks') { ctx.fillStyle = '#3b82f6'; ctx.fillRect(135, 350, 30, 30); ctx.fillStyle = 'white'; ctx.fillRect(135 + 12, 340, 6, 14); } else { ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.moveTo(150, 350); ctx.lineTo(165, 380); ctx.lineTo(135, 380); ctx.fill(); } } 
    document.getElementById('btnStartGame').addEventListener('click', () => { isPlayingActionGame = true; document.getElementById('startOverlay').style.display = 'none'; document.getElementById('gameControls').style.display = 'flex'; if (gameType === 'carracing') startCarRacing(gameId, isPlayer1); else if (gameType === 'cybertanks') startCyberTanks(gameId, isPlayer1); else startJetFighter(gameId, isPlayer1); }); 
}
window.resetActionGame = async (gameId) => { await updateDoc(doc(db, "games", gameId), { p1Score: null, p2Score: null, currentP1Score: 0, currentP2Score: 0, p1Shots: 0, p2Shots: 0 }); };
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
    
    const isP1 = isPlayer1;
    const tankW = 30; const tankH = 30;
    let myX = 135; let oppX = 135;
    let myShots = 0; let oppShots = 0; let lastOppShots = 0;
    let bullets = []; 
    let myScore = 0; let oppScore = 0;
    let isGameOver = false;
    let lastShotTime = 0;
    
    const keys = { Left: false, Right: false };
    
    const handleShoot = (e) => { 
        if(e) e.preventDefault(); 
        if(!isPlayingActionGame || isGameOver) return; 
        const now = Date.now();
        if (now - lastShotTime < 400) return; // Prevent network flooding
        lastShotTime = now;
        myShots++;
        bullets.push({ x: myX + tankW/2 - 3, y: 350 - 12, isMine: true });
    };
    
    const handleKeyDown = (e) => { 
        if(!isPlayingActionGame) return; 
        if(e.key === 'ArrowLeft') { e.preventDefault(); keys.Left = true; } 
        if(e.key === 'ArrowRight') { e.preventDefault(); keys.Right = true; } 
        if(e.key === ' ' || e.key === 'ArrowUp') handleShoot(e); 
    };
    
    const handleKeyUp = (e) => { 
        if(e.key === 'ArrowLeft') keys.Left = false; 
        if(e.key === 'ArrowRight') keys.Right = false; 
    };
    
    window.addEventListener('keydown', handleKeyDown); 
    window.addEventListener('keyup', handleKeyUp);
    
    const btnLeft = document.getElementById('btnLeft'); const btnRight = document.getElementById('btnRight');
    if (btnLeft) { btnLeft.onmousedown = btnLeft.ontouchstart = (e) => { e.preventDefault(); keys.Left = true; }; btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = (e) => { e.preventDefault(); keys.Left = false; }; }
    if (btnRight) { btnRight.onmousedown = btnRight.ontouchstart = (e) => { e.preventDefault(); keys.Right = true; }; btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = (e) => { e.preventDefault(); keys.Right = false; }; }
    
    if(!document.getElementById('btnShoot')) { 
        const btnShoot = document.createElement('button'); btnShoot.id = 'btnShoot'; btnShoot.className = 'game-control-btn'; 
        btnShoot.style.background = 'rgba(236, 72, 153, 0.2)'; btnShoot.style.borderColor = 'var(--accent)'; btnShoot.innerText = '🔥'; 
        document.getElementById('gameControls').appendChild(btnShoot); 
    }
    const btnShoot = document.getElementById('btnShoot'); 
    if (btnShoot) { 
        btnShoot.onmousedown = btnShoot.ontouchstart = handleShoot; 
    }
    
    const syncInterval = setInterval(async () => { 
        if(isGameOver) return; 
        try { 
            const payload = isP1 
                ? { p1X: myX, p1Shots: myShots, currentP1Score: myScore, currentP2Score: oppScore } 
                : { p2X: myX, p2Shots: myShots }; 
            await updateDoc(doc(db, "games", gameId), payload); 
        } catch(e) {} 
    }, 60); 
    
    const unsub = onSnapshot(doc(db, "games", gameId), (docSnap) => { 
        if(!docSnap.exists() || isGameOver) return; 
        const data = docSnap.data(); 
        
        let rawOppX = isP1 ? data.p2X : data.p1X;
        if (rawOppX !== undefined) oppX = canvas.width - tankW - rawOppX; // Mirroring Logic
        
        let currentOppShots = isP1 ? data.p2Shots : data.p1Shots;
        if (currentOppShots !== undefined && currentOppShots > lastOppShots) {
            let newShots = currentOppShots - lastOppShots;
            for (let i=0; i<newShots; i++) {
                bullets.push({ x: oppX + tankW/2 - 3, y: 20 + tankH + 2, isMine: false });
            }
            lastOppShots = currentOppShots;
        }
        
        // P1 manages score locally. P2 reads the score updates via P1's sync.
        if (!isP1) {
            myScore = data.currentP2Score || 0;
            oppScore = data.currentP1Score || 0;
            if (myScore >= 5 || oppScore >= 5) gameOver();
        }
    });
    
    function gameLoop() { 
        if(isGameOver) return; 
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        
        if(keys.Left && myX > 0) myX -= 4; 
        if(keys.Right && myX < canvas.width - tankW) myX += 4; 
        
        ctx.fillStyle = '#101015'; 
        ctx.fillRect(0,0,canvas.width,canvas.height); 
        
        const obstacles = [ { x: 50, y: 190, w: 60, h: 20 }, { x: 190, y: 190, w: 60, h: 20 } ];
        ctx.fillStyle = '#475569'; 
        obstacles.forEach(o => ctx.fillRect(o.x, o.y, o.w, o.h)); 
        
        // Draw My Tank (Blue, Bottom)
        ctx.fillStyle = '#3b82f6'; 
        ctx.fillRect(myX, 350, tankW, tankH); 
        ctx.fillStyle = 'white'; ctx.fillRect(myX + tankW/2 - 3, 350 - 10, 6, 14); 
        
        // Draw Opp Tank (Red, Top)
        ctx.fillStyle = '#ef4444'; 
        ctx.fillRect(oppX, 20, tankW, tankH); 
        ctx.fillStyle = 'white'; ctx.fillRect(oppX + tankW/2 - 3, 20 + tankH - 4, 6, 14); 
        
        ctx.fillStyle = '#f59e0b'; 
        for (let i = bullets.length - 1; i >= 0; i--) { 
            let b = bullets[i]; 
            b.y += b.isMine ? -6 : 6; 
            ctx.fillRect(b.x, b.y, 6, 12); 
            
            let hitObstacle = false;
            obstacles.forEach(o => { if (b.x < o.x + o.w && b.x + 6 > o.x && b.y < o.y + o.h && b.y + 12 > o.y) hitObstacle = true; });
            if (hitObstacle) { bullets.splice(i, 1); continue; }
            
            if (isP1) {
                if (b.isMine) {
                    if (b.x < oppX + tankW && b.x + 6 > oppX && b.y < 20 + tankH && b.y + 12 > 20) {
                        myScore++; bullets.splice(i, 1); if (myScore >= 5) gameOver(); continue;
                    }
                } else {
                    if (b.x < myX + tankW && b.x + 6 > myX && b.y < 350 + tankH && b.y + 12 > 350) {
                        oppScore++; bullets.splice(i, 1); if (oppScore >= 5) gameOver(); continue;
                    }
                }
            } else {
                if (b.isMine) {
                    if (b.x < oppX + tankW && b.x + 6 > oppX && b.y < 20 + tankH && b.y + 12 > 20) { bullets.splice(i, 1); continue; }
                } else {
                    if (b.x < myX + tankW && b.x + 6 > myX && b.y < 350 + tankH && b.y + 12 > 350) { bullets.splice(i, 1); continue; }
                }
            }
            
            if(b.y < -20 || b.y > canvas.height + 20) bullets.splice(i, 1); 
        } 
        
        ctx.fillStyle = 'white'; ctx.font = 'bold 16px Inter'; 
        ctx.fillText(`You: ${myScore}`, 15, 390); ctx.fillText(`Opp: ${oppScore}`, canvas.width - 80, 390); 
        
        currentAnimationId = requestAnimationFrame(gameLoop); 
    } 
    
    function gameOver() { 
        isGameOver = true; isPlayingActionGame = false; 
        clearInterval(syncInterval); unsub(); 
        window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); 
        if (btnLeft) { btnLeft.onmousedown = btnLeft.ontouchstart = null; btnLeft.onmouseup = btnLeft.ontouchend = btnLeft.onmouseleave = null; } 
        if (btnRight) { btnRight.onmousedown = btnRight.ontouchstart = null; btnRight.onmouseup = btnRight.ontouchend = btnRight.onmouseleave = null; } 
        if (btnShoot) { btnShoot.onmousedown = btnShoot.ontouchstart = null; } 
        if(currentAnimationId) cancelAnimationFrame(currentAnimationId); 
        
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height); 
        ctx.fillStyle = 'white'; ctx.font = 'bold 24px Inter'; 
        let winText = myScore >= 5 ? "YOU WIN!" : "YOU LOSE!"; 
        ctx.fillText(winText, 85, 200); 
        
        setTimeout(() => { 
            if (isP1) updateDoc(doc(db, "games", gameId), { p1Score: myScore, p2Score: oppScore }); 
        }, 1500); 
    } 
    
    gameLoop();
}
window.makeMoveTTT = async (index, currentVal, isMyTurn, mySymbol) => { if(!isMyTurn || currentVal !== "" || !currentGameId) return; const docRef = doc(db, "games", currentGameId); const snap = await getDoc(docRef); const data = snap.data(); if(data.winner) return; let newBoard = [...data.board]; newBoard[index] = mySymbol; const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; let newWinner = null; for (let i = 0; i < lines.length; i++) { const [a, b, c] = lines[i]; if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) newWinner = auth.currentUser.uid; } if(!newWinner && !newBoard.includes("")) newWinner = "draw"; const nextTurn = data.player1 === auth.currentUser.uid ? data.player2 : data.player1; await updateDoc(docRef, { board: newBoard, turn: nextTurn, winner: newWinner }); };
window.resetTTT = async (gameId) => { const docRef = doc(db, "games", gameId); const snap = await getDoc(docRef); await updateDoc(docRef, { board: ["","","","","","","","",""], winner: null, turn: snap.data().player1 }); };
function renderRPS(data, gameId) { const isPlayer1 = data.player1 === auth.currentUser.uid; const myChoice = isPlayer1 ? data.p1Choice : data.p2Choice; const oppChoice = isPlayer1 ? data.p2Choice : data.p1Choice; let statusText = "Make your choice!"; let bothSelected = data.p1Choice && data.p2Choice; if (bothSelected) { if (myChoice === oppChoice) statusText = "It's a Tie!"; else if ((myChoice === 'rock' && oppChoice === 'scissors') || (myChoice === 'paper' && oppChoice === 'rock') || (myChoice === 'scissors' && oppChoice === 'paper')) statusText = "🎉 You Won!"; else statusText = "😞 You Lost!"; } else if (myChoice) statusText = "Waiting for opponent..."; const icons = { rock: "fa-hand-back-fist", paper: "fa-hand", scissors: "fa-hand-scissors" }; let html = `<div class="game-turn-indicator">${statusText}</div><div class="rps-arena"><div class="rps-player"><span>You</span><div class="rps-choice-display"><i class="fa-solid ${myChoice ? icons[myChoice] : 'fa-question'}"></i></div></div><div class="vs-badge">VS</div><div class="rps-player"><span>Opponent</span><div class="rps-choice-display"><i class="fa-solid ${bothSelected ? icons[oppChoice] : (oppChoice ? 'fa-check' : 'fa-question')}" style="color: ${oppChoice && !bothSelected ? '#10b981' : 'white'}"></i></div></div></div>`; if (!myChoice && !bothSelected) html += `<div class="rps-controls"><button class="rps-btn" onclick="makeMoveRPS('rock')"><i class="fa-solid fa-hand-back-fist"></i></button><button class="rps-btn" onclick="makeMoveRPS('paper')"><i class="fa-solid fa-hand"></i></button><button class="rps-btn" onclick="makeMoveRPS('scissors')"><i class="fa-solid fa-hand-scissors"></i></button></div>`; if(bothSelected) html += `<button class="primary-btn glow-btn" style="max-width:200px; margin-top:20px;" onclick="resetRPS('${gameId}')">Play Again</button>`; gameUIContainer.innerHTML = html; }
window.makeMoveRPS = async (choice) => { if(!currentGameId) return; const docRef = doc(db, "games", currentGameId); const snap = await getDoc(docRef); const isPlayer1 = snap.data().player1 === auth.currentUser.uid; if (isPlayer1) await updateDoc(docRef, { p1Choice: choice }); else await updateDoc(docRef, { p2Choice: choice }); };
window.resetRPS = async (gameId) => { await updateDoc(doc(db, "games", gameId), { p1Choice: null, p2Choice: null }); };

window.acceptGroupInvite = async (groupId) => {
    try {
        await updateDoc(doc(db, "groups", groupId), {
            members: arrayUnion(auth.currentUser.uid),
            invitedMembers: arrayRemove(auth.currentUser.uid)
        });
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            [`chatMeta.${groupId}.unread`]: false,
            [`chatMeta.${groupId}.unreadCount`]: 0
        });
        showToast("Joined Group", "You have joined the group.");
        const group = allGroups.find(g => g.id === groupId);
        if (group) {
            openGroupChat(groupId, group.name, group.members.length + 1);
        }
    } catch(e) {
        showToast("Error", "Failed to join group.");
    }
};

window.rejectGroupInvite = async (groupId) => {
    try {
        await updateDoc(doc(db, "groups", groupId), {
            invitedMembers: arrayRemove(auth.currentUser.uid)
        });
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            [`chatMeta.${groupId}`]: deleteField()
        });
        showToast("Rejected", "Group invitation rejected.");
    } catch(e) {
        showToast("Error", "Failed to reject invite.");
    }
};

// --- DOODLE LOGIC ---
const pDoodleArea = document.getElementById("privateDoodleArea"); const pDoodleCanvas = document.getElementById("pDoodleCanvas"); const pDoodleCtx = pDoodleCanvas.getContext("2d"); const pDoodleColor = document.getElementById("pDoodleColor"); const pDoodleSize = document.getElementById("pDoodleSize"); const undoPDoodleBtn = document.getElementById("undoPDoodleBtn");
let isPDrawing = false; let currentPStroke = [];

let isSendingDoodle = false;
chatDoodleBtn.addEventListener("click", async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if(isSendingDoodle) return;
    isSendingDoodle = true;
    chatDoodleBtn.style.opacity = "0.5";
    chatDoodleBtn.style.pointerEvents = "none";
    try {
        if(currentChatStatus !== 'accepted') { alert("Connection request not accepted yet."); return; }
        const chatSnap = await getDoc(doc(db, "chats", currentChatId));
        if(chatSnap.exists() && chatSnap.data().doodleActive) { pDoodleArea.style.display = "flex"; document.getElementById("doodleBadge").style.display = "none"; window.dispatchEvent(new Event('resize')); } 
        else {
            if (isCurrentChatGroup) { alert("Doodle is for 1v1 only!"); return; }
            await updateDoc(doc(db, "chats", currentChatId), { doodleReq: auth.currentUser.uid });
            const timerValue = modalMsgTimerSelect ? parseInt(modalMsgTimerSelect.value) : 0;
            const payload = { sender: auth.currentUser.uid, time: Date.now(), isDoodleRequest: true, isDeleted: false }; if (timerValue > 0) payload.timerDuration = timerValue;
            await addDoc(collection(db, "chats", currentChatId, "messages"), payload); await setDoc(doc(db, "users", targetUserUid), { chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: "🎨 DOODLE REQUEST", unread: true } } }, { merge: true });
            showToast("Request Sent", "Doodle request sent to friend.");
        }
    } catch (error) {
        console.error(error);
    } finally {
        chatDoodleBtn.style.opacity = "1";
        chatDoodleBtn.style.pointerEvents = "auto";
        setTimeout(() => { isSendingDoodle = false; }, 500);
    }
});
document.getElementById("hideDoodleBtn").addEventListener("click", () => { pDoodleArea.style.display = "none"; if (currentChatId) { loadMessages(); } });
window.acceptDoodle = async () => { await updateDoc(doc(db, "chats", currentChatId), { doodleActive: true, doodleReq: null }); pDoodleArea.style.display = "flex"; window.dispatchEvent(new Event('resize')); };
document.getElementById("disconnectDoodleBtn").addEventListener("click", async () => { const isConfirmed = await customConfirm("Stop Doodling", "Stop doodling and wipe the board for both of you?", "Disconnect", "#ef4444"); if(isConfirmed) { await updateDoc(doc(db, "chats", currentChatId), { doodleActive: false }); const snaps = await getDocs(collection(db, "chats", currentChatId, "doodle")); const batch = writeBatch(db); snaps.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); pDoodleArea.style.display = "none"; } });
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
document.getElementById("clearPDoodleBtn").addEventListener("click", async () => { const isConfirmed = await customConfirm("Clear Board", "Are you sure you want to clear the whiteboard?", "Clear", "#ef4444"); if(isConfirmed) { const snaps = await getDocs(collection(db, "chats", currentChatId, "doodle")); const batch = writeBatch(db); snaps.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); await addDoc(collection(db, "chats", currentChatId, "doodle"), { type: 'clear', time: Date.now() }); } });
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
        if (target === "exploreMemes") {
            // Clean up lounge listener when leaving it
            if (globalChatUnsubscribe) { globalChatUnsubscribe(); globalChatUnsubscribe = null; }
            initMemesFeed();
        }
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
let leaderboardInitialized = false;
async function initLeaderboard() { 
    if (!leaderboardInitialized) {
        lbGameSelect.addEventListener("change", fetchLeaderboard);
        leaderboardInitialized = true;
    }
    fetchLeaderboard(); 
}
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
if (clearChatMeBtn) { clearChatMeBtn.addEventListener("click", async () => { if (!currentChatId) return; const isConfirmed = await customConfirm("Clear Chat", "Are you sure you want to clear this chat for yourself? Messages will be hidden for you but remain for the other person.", "Clear for Me", "#f59e0b"); if (isConfirmed) { clearChatMeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...'; try { const msgsSnap = await getDocs(query(collection(db, "chats", currentChatId, "messages"))); const batch = writeBatch(db); msgsSnap.docs.forEach(docSnap => { batch.update(docSnap.ref, { deletedFor: arrayUnion(auth.currentUser.uid) }); }); await batch.commit(); document.getElementById("chatSettingsModal").style.display = "none"; showToast("Chat Cleared", "Messages have been hidden from your screen."); } catch (e) { showToast("Error", "Error clearing chat."); } finally { clearChatMeBtn.innerHTML = '<i class="fa-solid fa-eraser"></i> Clear Chat for Me'; } } }); }

window.triggerClearChatEveryone = async () => {
    if (!currentChatId) return; 

    const isConfirmed = await customConfirm("DEVELOPER ACTION", "Permanently wipe this entire chat history for BOTH users? This cannot be undone.", "Wipe Everyone", "#ef4444");
    if (isConfirmed) {
        const clearBtn = document.getElementById("clearChatEveryoneBtn");
        if (clearBtn) clearBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Wiping...';
        
        try {
            const msgsQuery = query(collection(db, "chats", currentChatId, "messages"));
            const msgsSnap = await getDocs(msgsQuery);
            
            const batch = writeBatch(db);
            
            msgsSnap.docs.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });
            
            await batch.commit();
            
            showToast("Wiped", "Chat history permanently deleted for everyone.");
            
            const settingsModal = document.getElementById("chatSettingsModal");
            if (settingsModal) settingsModal.style.display = "none";
            
        } catch (error) {
            alert("Failed to wipe chat: " + error.message);
        } finally {
            if (clearBtn) clearBtn.innerHTML = '<i class="fa-solid fa-fire"></i> Clear for Everyone';
        }
    }
};

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

const appSettingsBtnEl = document.getElementById("appSettingsBtn");
if (appSettingsBtnEl) {
    appSettingsBtnEl.onclick = () => {
        if(myUserData) {
            document.getElementById("settingsFullName").value = myUserData.fullName || "";
            document.getElementById("settingsUsername").value = myUserData.username || "";
            document.getElementById("settingsBio").value = myUserData.bio || "";
            document.getElementById("settingsStatusPrivacy").value = myUserData.privacyStatus || "everyone";
            if (document.getElementById("settingsTypingPrivacy")) document.getElementById("settingsTypingPrivacy").value = myUserData.privacyTyping || "everyone";
            document.getElementById("settingsPfpPrivacy").value = myUserData.privacyPfp || "everyone";
            document.getElementById("settingsGroupInvitePrivacy").value = myUserData.privacyGroupInvite || "everyone";
        }
        document.getElementById("appSettingsModal").style.display = "flex";
    };
}
const settingsSaveProfileBtnEl = document.getElementById("settingsSaveProfileBtn");
if (settingsSaveProfileBtnEl) {
    settingsSaveProfileBtnEl.onclick = async () => {
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
           await updateDoc(doc(db, "users", auth.currentUser.uid), { 
                fullName: newName, 
                username: newUsername, 
                bio: newBio, 
                privacyStatus: document.getElementById("settingsStatusPrivacy").value, 
                privacyTyping: document.getElementById("settingsTypingPrivacy") ? document.getElementById("settingsTypingPrivacy").value : "everyone",
                privacyPfp: document.getElementById("settingsPfpPrivacy").value,
                privacyGroupInvite: document.getElementById("settingsGroupInvitePrivacy").value 
            });
            showToast("Profile Updated", "Your details were saved successfully.");
            document.getElementById("appSettingsModal").style.display = "none";
        } catch(e) { showToast("Error", "Failed to update profile."); } finally { btn.innerHTML = 'Save Profile'; }
    };
}
const settingsPfpInput = document.getElementById("settingsPfpInput");
const settingsChangePfpBtnEl = document.getElementById("settingsChangePfpBtn");
if (settingsChangePfpBtnEl) {
    settingsChangePfpBtnEl.onclick = () => settingsPfpInput.click();
}
if (settingsPfpInput) {
    settingsPfpInput.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;if (file.size > 5000000) { 
            alert("File is too large! Please choose an image under 5MB."); 
            settingsPfpInput.value = ""; 
            return; 
        }
         const btn = document.getElementById("settingsChangePfpBtn");
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; btn.disabled = true;
        try {
            const formData = new FormData(); formData.append("file", file); formData.append("upload_preset", UPLOAD_PRESET); 
            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData }); 
            const data = await response.json(); await updateDoc(doc(db, "users", auth.currentUser.uid), { avatarUrl: data.secure_url }); 
            showToast("Avatar Updated", "New profile picture set!");
        } catch(err) { showToast("Error", "Failed to upload avatar."); } finally { btn.innerHTML = '<i class="fa-solid fa-camera"></i> Update Avatar'; btn.disabled = false; settingsPfpInput.value = ""; }
    };
}

window.approveMember = async (groupId, memberId) => { 
    try { 
        await updateDoc(doc(db, "groups", groupId), { 
            invitedMembers: arrayUnion(memberId), 
            pendingMembers: arrayRemove(memberId) 
        }); 
        const group = allGroups.find(g => g.id === groupId);
        if (group) {
            const u = allUsers.find(x => x.id === memberId);
            const pref = u ? (u.privacyGroupInvite || 'everyone') : 'everyone';
            const isFriend = u && !!(u.chatMeta && u.chatMeta[auth.currentUser.uid]);
            let shouldNotify = true;
            if (pref === 'none') shouldNotify = false;
            if (pref === 'friends' && !isFriend) shouldNotify = false;

            await setDoc(doc(db, "users", memberId), {
                chatMeta: {
                    [groupId]: {
                        time: Date.now(),
                        text: `You were invited to join ${group.name}`,
                        unread: shouldNotify,
                        unreadCount: shouldNotify ? increment(1) : 0,
                        isGroup: true,
                        groupId: groupId,
                        groupName: group.name
                    }
                }
            }, { merge: true });
        }
        showToast("Approved", "Invitation sent to the user."); 
        document.getElementById("groupSettingsModal").style.display = "none"; 
    } catch (e) { 
        alert("Error approving member."); 
    } 
};
window.rejectMember = async (groupId, memberId) => { try { await updateDoc(doc(db, "groups", groupId), { pendingMembers: arrayRemove(memberId) }); showToast("Rejected", "Request deleted."); document.getElementById("groupSettingsModal").style.display = "none"; } catch (e) { alert("Error rejecting member."); } };

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.style.zIndex = "1000"; 
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display = 'none'; } });
});
document.getElementById('toastContainer').style.zIndex = "9999";
  } else {
    // User is signed out — show auth screen
    authScreen.style.display = "flex";
    appScreen.style.display = "none";
    if(myProfileUnsubscribe) { myProfileUnsubscribe(); myProfileUnsubscribe = null; }
    if(messagesUnsubscribe) { messagesUnsubscribe(); messagesUnsubscribe = null; }
    // Clean up all global message notification listeners
    Object.values(_globalMsgListeners).forEach(unsub => unsub());
    Object.keys(_globalMsgListeners).forEach(k => delete _globalMsgListeners[k]);
    myUserData = null; currentChatId = null; targetUserUid = null;
  }
});
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

async function getLatestAppVersion() {
    try {
        // Fetch the main document headers, bypassing all caches
        const res = await fetch(window.location.href.split('?')[0] + '?_no_cache=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
        return res.headers.get('etag') || res.headers.get('last-modified') || "unknown";
    } catch (e) {
        return null;
    }
}

window.addEventListener('load', async () => {
    if (!localStorage.getItem('app_version_etag')) {
        const ver = await getLatestAppVersion();
        if (ver && ver !== "unknown") localStorage.setItem('app_version_etag', ver);
    }
});

// Fires ONLY when a new Service Worker has successfully taken over — reload to apply it
// Guard: navigator.serviceWorker may not exist on some browsers/iOS
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (!refreshing) {
    refreshing = true;
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
      const currentVersion = localStorage.getItem('app_version_etag');
      const latestVersion = await getLatestAppVersion();

      if (!latestVersion) {
        showToast("Error", "Could not check for updates. Check connection.");
        resetBtn();
        return;
      }

      if (currentVersion && latestVersion !== "unknown" && currentVersion !== latestVersion) {
        // We found a legitimate deployed update
        updateAppBtn.innerHTML = '<i class="fa-solid fa-download fa-fade"></i> Update found...';
        
        // 1. Clear the Cache API to ensure we don't serve old CSS/JS/HTML
        if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(key => caches.delete(key)));
        }
        
        // 2. Unregister service workers so they don't block the next page load
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        
        localStorage.setItem('app_version_etag', latestVersion);
        updateAppBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
        refreshing = true;
        
        setTimeout(() => {
            window.location.href = window.location.href.split('?')[0] + '?updated=' + Date.now();
        }, 1000);
      } else {
        // If the old store was null, save it now to compare next time
        if (!currentVersion && latestVersion !== "unknown") {
            localStorage.setItem('app_version_etag', latestVersion);
        }
        
        // Also ask SW to check its internal updates seamlessly in the background
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) await reg.update();
        }
        
        resetBtn("You are already on the latest version.");
      }
    } catch (err) {
      console.error("PWA Update Error:", err);
      showToast("Error", "Could not reach the server. Try again.");
      resetBtn();
    }
  });
}
// =========================================================
// MOBILE KEYBOARD VIEWPORT FIX (ANDROID & IOS)
// =========================================================

let _lockViewportSuppressed = false;
let _lockViewportTimer = null;
function lockViewport() {
    if (_lockViewportSuppressed) return;
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

// ==========================================
// PRESENCE / VISIBILITY SYNC
// ==========================================
document.addEventListener("visibilitychange", () => {
    if (auth && auth.currentUser) {
        if (document.visibilityState === "visible") {
            updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: true }).catch(() => {});
        } else {
            updateDoc(doc(db, "users", auth.currentUser.uid), { isOnline: false, lastSeen: Date.now() }).catch(() => {});
        }
    }
});
// ==========================================
// WEBRTC AUDIO/VIDEO CALLING SYSTEM
// ==========================================
let currentCallDoc = null;
let callUnsubscribe = null;
let callTimerInterval = null;
let isAudioOnlyCall = false;
let currentPingMsg = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

let ringtoneAudio = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ringing.ogg');
ringtoneAudio.loop = true;
let vibrateInterval = null;

window.stopRinging = () => {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
    clearInterval(vibrateInterval);
    if (navigator.vibrate) navigator.vibrate(0);
    clearCallNotification();
};

function clearCallNotification() {
    if (typeof Notification !== 'undefined') {
        navigator.serviceWorker.ready.then(reg => {
            reg.getNotifications({tag: 'incoming_call'}).then(notifications => {
                notifications.forEach(n => n.close());
            });
        });
    }
}

window.listenForIncomingCalls = (uid) => {
    const callsQuery = query(collection(db, "users", uid, "calls"), where("status", "==", "ringing"));
    onSnapshot(callsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" || change.type === "modified") {
                const callData = change.doc.data();
                const callId = change.doc.id;
                
                if (callData.status !== "ringing") return;

                if (document.getElementById("activeCallOverlay").style.display === "flex") {
                    updateDoc(doc(db, "users", uid, "calls", callId), { status: "declined" });
                    return;
                }

                currentCallDoc = doc(db, "users", uid, "calls", callId);
                isAudioOnlyCall = callData.audioOnly;
                
                document.getElementById("callerName").innerText = callData.callerName;
                document.getElementById("callerAvatar").src = callData.callerAvatar;
                document.getElementById("callTypeText").innerText = callData.audioOnly ? "Chit-Chat Voice Call" : "Chit-Chat Video Call";
                
                document.getElementById("incomingCallModal").style.display = "flex";
                
                ringtoneAudio.play().catch(e => console.log("Audio autoplay blocked:", e));
                if (navigator.vibrate) {
                    navigator.vibrate([500, 500]);
                    vibrateInterval = setInterval(() => navigator.vibrate([500, 500]), 1500);
                }

                if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== "visible") {
                    navigator.serviceWorker.ready.then(reg => reg.showNotification(`📞 ${callData.callerName} is calling...`, { 
                        body: callData.audioOnly ? "Tap to view incoming voice call" : "Tap to view incoming video call", 
                        icon: callData.callerAvatar || "./icon-192.png", 
                        vibrate: [500, 500, 500, 500, 500], 
                        tag: "incoming_call",
                        renotify: true, 
                        requireInteraction: true 
                    }));
                }

                const ringUnsub = onSnapshot(currentCallDoc, (snap) => {
                    const data = snap.data();
                    if (!data || data.status === "ended" || data.status === "declined" || data.status === "answered") {
                        document.getElementById("incomingCallModal").style.display = "none";
                        window.stopRinging();
                        if (data.status !== "answered" && data.pingChatId && data.pingMsgId) {
                            deleteDoc(doc(db, "chats", data.pingChatId, "messages", data.pingMsgId)).catch(()=>{});
                        }
                        currentCallDoc = null;
                        ringUnsub();
                    }
                });

                document.getElementById("acceptCallBtn").onclick = () => { 
                    ringUnsub(); 
                    window.stopRinging();
                    if (callData.pingChatId && callData.pingMsgId) deleteDoc(doc(db, "chats", callData.pingChatId, "messages", callData.pingMsgId)).catch(()=>{});
                    acceptCall(callData); 
                };
                document.getElementById("declineCallBtn").onclick = () => { 
                    ringUnsub(); 
                    window.stopRinging();
                    if (callData.pingChatId && callData.pingMsgId) deleteDoc(doc(db, "chats", callData.pingChatId, "messages", callData.pingMsgId)).catch(()=>{});
                    updateDoc(currentCallDoc, { status: "declined" }); 
                    document.getElementById("incomingCallModal").style.display = "none"; 
                    currentCallDoc = null;
                };
            }
        });
    });
};

async function getMedia(audioOnly) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: !audioOnly, audio: true });
        localStream = stream;
        document.getElementById("localVideo").srcObject = stream;
        
        if (audioOnly) {
            document.getElementById("remoteVideo").style.display = "none";
            document.getElementById("localVideo").style.display = "none";
            document.getElementById("audioOnlyAvatar").style.display = "block";
            document.getElementById("toggleVideoBtn").style.display = "none";
        } else {
            document.getElementById("remoteVideo").style.display = "block";
            document.getElementById("localVideo").style.display = "block";
            document.getElementById("audioOnlyAvatar").style.display = "none";
            document.getElementById("toggleVideoBtn").style.display = "block";
        }
    } catch(err) {
        showToast("Hardware Error", "Camera or Mic permissions denied.");
        throw err;
    }
}

window.startCall = async (audioOnly) => {
    if(!currentChatId || isCurrentChatGroup) return;
    isAudioOnlyCall = audioOnly;
    
    document.getElementById("activeCallAvatar").src = document.getElementById("chatTargetAvatar").src;
    document.getElementById("activeCallName").innerText = document.getElementById("chatTargetName").innerText;

    await getMedia(audioOnly);
    document.getElementById("activeCallOverlay").style.display = "flex";
    document.getElementById("callDuration").innerText = "Ringing...";
    
    currentCallDoc = doc(collection(db, "users", targetUserUid, "calls"));
    
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;
    
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    
    const offerCandidates = collection(currentCallDoc, "offerCandidates");
    const answerCandidates = collection(currentCallDoc, "answerCandidates");
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) addDoc(offerCandidates, event.candidate.toJSON());
    };
    
    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);
    
    let pingMsgId = null;
    try {
        const pingRef = await addDoc(collection(db, "chats", currentChatId, "messages"), {
            text: audioOnly ? "📞 Incoming Voice Call..." : "📹 Incoming Video Call...",
            sender: auth.currentUser.uid,
            senderName: document.getElementById("myName").innerText,
            time: Date.now(),
            isDeleted: false,
            isCallLog: true
        });
        pingMsgId = pingRef.id;
        currentPingMsg = { chatId: currentChatId, msgId: pingMsgId };
        
        await setDoc(doc(db, "users", targetUserUid), {
            chatMeta: { [auth.currentUser.uid]: { time: Date.now(), text: audioOnly ? "📞 Voice Call" : "📹 Video Call", unread: true, unreadCount: increment(1) } }
        }, { merge: true });
    } catch(e) { console.error("Failed to send wakeup ping", e); }

    await setDoc(currentCallDoc, {
        offer: { type: offerDescription.type, sdp: offerDescription.sdp },
        callerId: auth.currentUser.uid,
        callerName: document.getElementById("myName").innerText,
        callerAvatar: document.getElementById("myAvatar").src,
        audioOnly: audioOnly,
        status: "ringing",
        timestamp: Date.now(),
        pingChatId: currentChatId || null,
        pingMsgId: pingMsgId || null
    });
    
    callUnsubscribe = onSnapshot(currentCallDoc, (snapshot) => {
        const data = snapshot.data();
        if (!data || data.status === "ended" || data.status === "declined") {
            window.hangUpCall();
            if(data && data.status === "declined") showToast("Call Declined", "The user is busy.");
            return;
        }
        if (!peerConnection.currentRemoteDescription && data.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            peerConnection.setRemoteDescription(answerDescription);
            startCallTimer();
        }
    });
    
    onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    });
};

async function acceptCall(callData) {
    document.getElementById("incomingCallModal").style.display = "none";
    
    document.getElementById("activeCallAvatar").src = callData.callerAvatar;
    document.getElementById("activeCallName").innerText = callData.callerName;

    await getMedia(callData.audioOnly);
    document.getElementById("activeCallOverlay").style.display = "flex";
    document.getElementById("callDuration").innerText = "Connecting...";
    
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;
    
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    
    const offerCandidates = collection(currentCallDoc, "offerCandidates");
    const answerCandidates = collection(currentCallDoc, "answerCandidates");
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) addDoc(answerCandidates, event.candidate.toJSON());
    };
    
    const offerDescription = new RTCSessionDescription(callData.offer);
    await peerConnection.setRemoteDescription(offerDescription);
    
    const answerDescription = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answerDescription);
    
    await updateDoc(currentCallDoc, { answer: { type: answerDescription.type, sdp: answerDescription.sdp }, status: "answered" });
    
    onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const candidate = new RTCIceCandidate(change.doc.data());
                peerConnection.addIceCandidate(candidate);
            }
        });
    });

    startCallTimer();
    
    callUnsubscribe = onSnapshot(currentCallDoc, (snapshot) => {
        const data = snapshot.data();
        if (!data || data.status === "ended") {
            window.hangUpCall();
        }
    });
}

window.hangUpCall = () => {
    window.stopRinging();
    if (currentPingMsg) {
        deleteDoc(doc(db, "chats", currentPingMsg.chatId, "messages", currentPingMsg.msgId)).catch(()=>{});
        currentPingMsg = null;
    }

    if (currentCallDoc) { updateDoc(currentCallDoc, { status: "ended" }).catch(()=>{}); }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
    remoteStream = null;
    
    document.getElementById("remoteVideo").srcObject = null;
    document.getElementById("localVideo").srcObject = null;
    
    if (callUnsubscribe) { callUnsubscribe(); callUnsubscribe = null; }
    
    document.getElementById("activeCallOverlay").style.display = "none";
    document.getElementById("incomingCallModal").style.display = "none";
    currentCallDoc = null;
    
    clearInterval(callTimerInterval);
    document.getElementById("callDuration").innerText = "00:00";
};

function startCallTimer() {
    let seconds = 0;
    document.getElementById("callDuration").innerText = "00:00";
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        seconds++;
        const m = String(Math.floor(seconds / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        document.getElementById("callDuration").innerText = `${m}:${s}`;
    }, 1000);
}

let isMicOn = true;
let isCamOn = true;

document.getElementById("endCallBtn").addEventListener("click", window.hangUpCall);

document.getElementById("toggleAudioBtn").addEventListener("click", () => {
    if(localStream) {
        isMicOn = !isMicOn;
        localStream.getAudioTracks()[0].enabled = isMicOn;
        document.getElementById("toggleAudioBtn").style.background = isMicOn ? "rgba(255,255,255,0.15)" : "#ef4444";
        document.getElementById("toggleAudioBtn").innerHTML = isMicOn ? '<i class="fa-solid fa-microphone"></i>' : '<i class="fa-solid fa-microphone-slash"></i>';
    }
});

document.getElementById("toggleVideoBtn").addEventListener("click", () => {
    if(localStream && !isAudioOnlyCall) {
        isCamOn = !isCamOn;
        localStream.getVideoTracks()[0].enabled = isCamOn;
        document.getElementById("toggleVideoBtn").style.background = isCamOn ? "rgba(255,255,255,0.15)" : "#ef4444";
        document.getElementById("toggleVideoBtn").innerHTML = isCamOn ? '<i class="fa-solid fa-video"></i>' : '<i class="fa-solid fa-video-slash"></i>';
    }
});

document.getElementById("callMenuBtn").addEventListener("click", () => {
    document.getElementById("callSelectionModal").style.display = "flex";
});