/**
 * home2.js — PeerDrop redesigned home (2-card layout)
 *
 * Handles:
 *  - Auth guard
 *  - Profile fetch + navbar/profile card population
 *  - Create Room form → navigate to room.html
 *  - Join Room form   → navigate to room.html
 *  - Toast notifications
 *  - Loading states
 */

import { requireAuth, getProfile, logout , createRoom , joinRoom , generateRoomId} from './api.js';
import {create } from './client.js';
// ── Auth guard ────────────────────────────────────────────
requireAuth();

let myId = null;

// ── Toast ─────────────────────────────────────────────────
const toastContainer = document.getElementById('toast-container');

/**
 * Show a temporary toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='info']
 * @param {number} [duration=3500]
 */
export function showToast(message, type = 'info', duration = 3500) {
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

// ── Logout ────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => logout());

// ── Helpers ───────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function setCardMsg(msgEl, message, type) {
  msgEl.textContent = message;
  msgEl.className   = `card-msg ${type}`;
}

function clearCardMsg(msgEl) {
  msgEl.textContent = '';
  msgEl.className   = 'card-msg';
}
const user = await getProfile();
// ── Profile ───────────────────────────────────────────────
async function loadProfile() {
  try {

    // Navbar
    document.getElementById('nav-avatar').textContent   = getInitials(user.username || user.email);
    document.getElementById('nav-username').textContent = user.username || user.email;

    // Profile card
    document.getElementById('profile-avatar').textContent = getInitials(user.username || user.email);
    document.getElementById('profile-name').textContent   = user.username || '—';
    document.getElementById('profile-email').textContent  = user.email    || '—';

    const raw = user.created_at || user.member_since || user.joined_at;
    document.getElementById('profile-since').textContent = raw
      ? new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A';

    // Persist username for room page
    sessionStorage.setItem('pd_username', user.username || user.email || 'You');
    sessionStorage.setItem('pd_email',    user.email    || '');
  } catch (err) {
    if (err.status === 401) logout();
    else showToast('Could not load profile.', 'error');
  }
}

// ── Create Room ───────────────────────────────────────────
const createForm = document.getElementById('create-form');
const createBtn  = document.getElementById('create-btn');
const createMsg  = document.getElementById('create-msg');

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearCardMsg(createMsg);

  const room_name     = document.getElementById('room-name').value.trim();
  const password = document.getElementById('room-password').value.trim();

  if (!room_name) {
    setCardMsg(createMsg, 'Please enter a room name.', 'error');
    document.getElementById('room-name').focus();
    return;
  }
  createBtn.disabled = true;
  createBtn.classList.add('loading');

  try {
    // Simulate async room creation (replace with real API/WS call)
    await new Promise(r => setTimeout(r, 700));

    const roomId = await generateRoomId();

    // Pass room info to room page via sessionStorage
    sessionStorage.setItem('pd_room_id',       roomId);
    sessionStorage.setItem('pd_room_name',      room_name);
    sessionStorage.setItem('pd_room_password',  password);
    sessionStorage.setItem('pd_room_role',      'host');
    setCardMsg(createMsg, `Room created! ID: ${roomId} — entering…`, 'success');
    showToast(`Room "${room_name}" created.`, 'success', 1800);
    try {
        // goes to routers/rooms/create
        let res = await createRoom({room_name : room_name , room_id : roomId , password : password});
        myId = res.user_id;
        // goes to client.js -> websockets.py
        await create( room_name ,roomId , myId ,user.username , true);
    } catch (err) {
        console.error("create error:", err);
    }
    setTimeout(() => { window.location.href = 'room.html'; }, 700);
  } catch (_) {
    setCardMsg(createMsg, 'Failed to create room. Try again.', 'error');
    createBtn.disabled = false;
    createBtn.classList.remove('loading');
  }
});

// ── Join Room ─────────────────────────────────────────────
const joinForm = document.getElementById('join-form');
const joinBtn  = document.getElementById('join-btn');
const joinMsg  = document.getElementById('join-msg');

joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearCardMsg(joinMsg);

  const roomId   = document.getElementById('join-room-id').value.trim().toUpperCase();
  const password = document.getElementById('join-password').value.trim();

  if (!roomId) {
    setCardMsg(joinMsg, 'Please enter a Room ID.', 'error');
    document.getElementById('join-room-id').focus();
    return;
  }

  joinBtn.disabled = true;
  joinBtn.classList.add('loading');

  try {
    await new Promise(r => setTimeout(r, 700));

    sessionStorage.setItem('pd_room_id',      roomId);
    sessionStorage.setItem('pd_room_name',    `Room ${roomId}`);
    sessionStorage.setItem('pd_room_password', password);
    sessionStorage.setItem('pd_room_role',    'guest');

    setCardMsg(joinMsg, `Joining room ${roomId}…`, 'success');
    
    showToast(`Joining ${roomId}`, 'info', 1800);
    try {
        // for routers/rooms/join
        let res = await joinRoom({room_id : roomId , password : password});
        myId = res.user_id;
        // for websocket connections -> client.js -> websockets.py
        await create(name ,roomId, myId , user.username , false);
    } catch (err) {
        console.error("create error:", err);
    }
    
    setTimeout(() => { window.location.href = 'room.html'; }, 700);
  } catch (_) {
    setCardMsg(joinMsg, 'Could not join room. Check the ID and password.', 'error');
    joinBtn.disabled = false;
    joinBtn.classList.remove('loading');
  }
});

// Clear card errors on input
document.querySelectorAll('.card-input').forEach(input => {
  input.addEventListener('input', () => {
    const card = input.closest('.card');
    if (card) {
      const msg = card.querySelector('.card-msg');
      if (msg) msg.className = 'card-msg';
    }
  });
});

// ── Init ──────────────────────────────────────────────────
loadProfile();