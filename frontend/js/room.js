/**
 * room.js — PeerDrop transfer room page
 *
 * Handles:
 *  - Auth guard
 *  - Room info (from sessionStorage, set by home2.js)
 *  - User profile in navbar + sidebar
 *  - Simulated peer list
 *  - Chat: send messages, display bubbles, typing indicator
 *  - File attach: preview bar, remove
 *  - File send: shows file bubble in chat + adds to sidebar file list
 *  - Shared files sidebar: list with download buttons
 *  - Copy Room ID on click
 *  - Leave room → back to home
 *  - Toast notifications
 */

import { requireAuth, getProfile, logout } from './api.js';
import { sendMsg  , websocket_messages} from './client.js';
// ── Auth guard ────────────────────────────────────────────
requireAuth();
window.onload = function() {
    const roomId = sessionStorage.getItem('currentRoomId');
    const myId = sessionStorage.getItem('myId');
    
    if (roomId &&  myId) {
        // Auto-reconnect
        const wsUrl = `wss://p2p-file-sharing-production-770f.up.railway.app/ws/${roomId}`;
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            // Send rejoin message
            ws.send(JSON.stringify({
                type: "rejoin",
                userId: myId,
                roomId: roomId
            }));
        };
        ws.onmessage = async (event) => await websocket_messages(ws , JSON.parse(event.data));
    }
};
// ── State ─────────────────────────────────────────────────
let currentUser   = { username: 'You', email: '' };
let selectedFile  = null;         // File object awaiting send
const sharedFiles = [];           // { name, size, sender, url? }

// Room info from sessionStorage (set by home2.js)
const roomId   = sessionStorage.getItem('pd_room_id')   || 'UNKNOWN';
const roomName = sessionStorage.getItem('pd_room_name') || 'Transfer Room';

// ── DOM refs ──────────────────────────────────────────────
const chatArea        = document.getElementById('chat-area');
const msgInput        = document.getElementById('msg-input');
const sendBtn         = document.getElementById('send-btn');
const attachBtn       = document.getElementById('attach-btn');
const fileInput       = document.getElementById('file-input');
const filePreviewBar  = document.getElementById('file-preview-bar');
const filePreviewName = document.getElementById('file-preview-name');
const filePreviewSize = document.getElementById('file-preview-size');
const filePreviewRm   = document.getElementById('file-preview-remove');
const typingIndicator = document.getElementById('typing-indicator');
const toastContainer  = document.getElementById('toast-container');

// ── Toast ─────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const icons = {
    success: `<svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 4L6 11l-3-3"/></svg>`,
    error:   `<svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path stroke-linecap="round" d="M8 5v3.5M8 11v.5"/></svg>`,
    info:    `<svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="6"/><path stroke-linecap="round" d="M8 11V8M8 5v.5"/></svg>`,
  };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.28s ease forwards';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Helpers ───────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Navbar room info ──────────────────────────────────────
function initNavRoom() {
  document.title = `${roomName} — PeerDrop`;
  document.getElementById('nav-room-name').textContent = roomName;

  const roomIdEl = document.getElementById('nav-room-id');
  roomIdEl.textContent = roomId;
  roomIdEl.addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => {
      showToast('Room ID copied!', 'success', 2000);
    });
  });
  roomIdEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') roomIdEl.click();
  });

  // System message in chat
  const dateLabel = document.getElementById('chat-date-label');
  dateLabel.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Profile ───────────────────────────────────────────────
async function loadProfile() {
  try {
    const user = await getProfile();
    currentUser = { username: user.username || user.email || 'You', email: user.email || '' };

    const initials = getInitials(currentUser.username);

    // Navbar
    document.getElementById('nav-avatar').textContent   = initials;
    document.getElementById('nav-username').textContent = currentUser.username;

    // Sidebar profile block
    document.getElementById('sb-avatar').textContent = initials;
    document.getElementById('sb-name').textContent   = currentUser.username;
    document.getElementById('sb-email').textContent  = currentUser.email;

    // Add self to peers list
    renderPeers();
  } catch (err) {
    if (err.status === 401) logout();
    else {
      // Fallback to sessionStorage values
      const name = sessionStorage.getItem('pd_username') || 'You';
      currentUser = { username: name, email: sessionStorage.getItem('pd_email') || '' };
      document.getElementById('nav-avatar').textContent   = getInitials(name);
      document.getElementById('nav-username').textContent = name;
      document.getElementById('sb-avatar').textContent    = getInitials(name);
      document.getElementById('sb-name').textContent      = name;
      document.getElementById('sb-email').textContent     = currentUser.email;
      renderPeers();
    }
  }
}

// ── Peers ─────────────────────────────────────────────────
export function renderPeers(other_peers = []) {
  // Always include self
  const peers = other_peers.map(peer => ({
    name : peer,
    self : false
  }));
  const self = { name: currentUser.username, self: true };
  const all  = [self, ...peers];

  document.getElementById('peers-count').textContent = all.length;

  const list = document.getElementById('peers-list');
  list.innerHTML = '';

  all.forEach(peer => {
    const li = document.createElement('li');
    li.className = 'peer-item';
    li.innerHTML = `
      <div class="peer-avatar">${escapeHtml(getInitials(peer.name))}</div>
      <span class="peer-name">${escapeHtml(peer.name)}</span>
      ${peer.self ? '<span class="peer-you-tag">You</span>' : ''}`;
    list.appendChild(li);
  });
}

// ── Shared files sidebar ──────────────────────────────────
function renderFileSidebar() {
  const list  = document.getElementById('file-list');
  const empty = document.getElementById('files-empty');

  if (!sharedFiles.length) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = '';

  sharedFiles.forEach((f, idx) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <div class="file-icon">
        <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/>
          <path stroke-linecap="round" d="M9 2v4h4"/>
        </svg>
      </div>
      <div class="file-info">
        <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
        <div class="file-meta">${f.size} · ${escapeHtml(f.sender)}</div>
      </div>
      <button class="file-dl-btn" aria-label="Download ${escapeHtml(f.name)}" data-idx="${idx}">
        <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 3v8M5 8l3 3 3-3M3 13h10"/>
        </svg>
      </button>`;
    list.appendChild(li);
  });
  // Download button handler (triggers real download if URL is available)
  list.querySelectorAll('.file-dl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = sharedFiles[parseInt(btn.dataset.idx)];
      if (f && f.url) {
        const a = document.createElement('a');
        a.href     = f.url;
        a.download = f.name;
        a.click();
      } else {
        showToast('Download not available in demo mode.', 'info');
      }
    });
  });
}

// ── Chat rendering ────────────────────────────────────────

/**
 * Append a text message bubble to the chat area.
 * @param {{type : string , text: string, sender: string, self: boolean, time?: string }} msg
 */
export function appendTextMessage(msg) {
  const group = document.createElement('div');
  group.className = `msg-group${msg.self ? ' self' : ''}`;

  const initials = getInitials(msg.sender);
  const time     = msg.time || nowTime();

  group.innerHTML = `
    <div class="msg-group-avatar${msg.self ? ' self-avatar' : ''}" aria-hidden="true">${escapeHtml(initials)}</div>
    <div class="msg-stack">
      <div class="msg-meta">
        <span class="msg-sender">${escapeHtml(msg.sender)}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-bubble">${escapeHtml(msg.text).replace(/\n/g, '<br/>')}</div>
    </div>`;

  chatArea.appendChild(group);
  scrollToBottom();
}

export function showDownloadButton(blob,fileName , senders){
    const url =URL.createObjectURL(blob);
    appendFileMessage({
        type : "file" ,
        name: fileName,
        sender : senders,
        size: formatBytes(blob.size),
        downloadUrl: url,
        self: false,
        time: "",
    });
}
/**
 * Append a file message bubble to the chat area.
 * @param {{ type : string , name: string, size: string, sender: string,size : string , downloadUrl : string , self: boolean, time?: string }} f
 */
export function appendFileMessage(f) {
  const group = document.createElement('div');
  group.className = `msg-group${f.self ? ' self' : ''}`;

  const initials = getInitials(f.sender);
  const time     = f.time || nowTime();

  group.innerHTML = `
    <div class="msg-group-avatar${f.self ? ' self-avatar' : ''}" aria-hidden="true">${escapeHtml(initials)}</div>
    <div class="msg-stack">
      <div class="msg-meta">
        <span class="msg-sender">${escapeHtml(f.sender)}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-file">
        <div class="msg-file-icon">
          <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/>
            <path stroke-linecap="round" d="M9 2v4h4"/>
          </svg>
        </div>
        <div class="msg-file-info">
          <div class="msg-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
          <div class="msg-file-size">${f.size}</div>
        </div>
        <button class="msg-file-dl" aria-label="Download ${escapeHtml(f.name)}">
          <svg fill="none" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 3v8M5 8l3 3 3-3M3 13h10"/>
          </svg>
        </button>
      </div>
    </div>`;

  sharedFiles.unshift({ ...f, url: f.downloadUrl });
  renderFileSidebar();

  // Download click
  group.querySelector('.msg-file-dl').addEventListener('click', () => {
    const a =document.createElement("a");
    a.href = f.downloadUrl;
    a.download =f.name;
    a.click();
  });

  chatArea.appendChild(group);
  scrollToBottom();
}

/** Append a system event line. */
function appendSystemMsg(text) {
  const div = document.createElement('div');
  div.className   = 'msg-system';
  div.textContent = text;
  chatArea.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ── Send message ──────────────────────────────────────────
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text && !selectedFile) return;
  
  
  if (selectedFile) {
    // Send file
    const sizeStr = formatBytes(selectedFile.size);
    const fileObj = {
      type : "file",
      name:   selectedFile.name,
      sender: currentUser.username,
      size:   sizeStr,
      downloadUrl: URL.createObjectURL(selectedFile),
      self:   true,
      time : "",
    };
    await sendMsg(fileObj,true ,  selectedFile);
    appendFileMessage(fileObj);

    showToast(`"${selectedFile.name}" shared (${sizeStr})`, 'success');
    clearFileSelection();
  }

  if (text) {
    await sendMsg(text , false , null);
    appendTextMessage({ text, sender: currentUser.username, self: true });
    msgInput.value = '';
    msgInput.style.height = '';
    updateSendBtn();
  }
}

// ── Input & send btn ──────────────────────────────────────
function updateSendBtn() {
  sendBtn.disabled = !msgInput.value.trim() && !selectedFile;
}
if(msgInput){
  msgInput.addEventListener('input', () => {
    // Auto-resize textarea
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    updateSendBtn();
  });
  msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  });
}

if(sendBtn)sendBtn.addEventListener('click', sendMessage);

// ── File selection ────────────────────────────────────────
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  // 100 MB guard
  if (file.size > 100 * 1024 * 1024) {
    showToast('File too large. Max size is 100 MB.', 'error');
    fileInput.value = '';
    return;
  }

  selectedFile = file;
  filePreviewName.textContent = file.name;
  filePreviewSize.textContent = formatBytes(file.size);
  filePreviewBar.classList.add('visible');
  updateSendBtn();
  fileInput.value = '';
});

function clearFileSelection() {
  selectedFile = null;
  filePreviewBar.classList.remove('visible');
  filePreviewName.textContent = '';
  filePreviewSize.textContent = '';
  updateSendBtn();
}

filePreviewRm.addEventListener('click', clearFileSelection);

// ── Typing indicator (demo) ───────────────────────────────
// In a real app, drive this from WebSocket events.
// Here we just hide it — connect your WS peer events to show/hide it.
typingIndicator.classList.remove('visible');

// ── Leave room ────────────────────────────────────────────
document.getElementById('leave-btn').addEventListener('click', () => {
  // Clear room session data
  sessionStorage.removeItem('pd_room_id');
  sessionStorage.removeItem('pd_room_name');
  sessionStorage.removeItem('pd_room_password');
  sessionStorage.removeItem('pd_room_role');
  window.location.href = 'index.html';
});

// ── Init ──────────────────────────────────────────────────
initNavRoom();
loadProfile();
renderFileSidebar();