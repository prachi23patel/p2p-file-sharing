/**
 * api.js — PeerDrop API client
 *
 * Centralises all HTTP communication with the FastAPI backend.
 * All methods automatically attach the JWT Bearer token from
 * localStorage, and throw a structured ApiError on failures.
 */

// ── Config ────────────────────────────────────────────────
export const BASE_URL = 'https://peer-to-peer-file-sharing-production-d1a0.up.railway.app';
export const TOKEN_KEY = 'peerdrop_access_token';

// ── Error class ───────────────────────────────────────────
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status  HTTP status code
   * @param {object} [data]  Parsed response body
   */
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ── Token helpers ─────────────────────────────────────────

/** Retrieve the stored JWT access token. */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** Persist a JWT access token. */
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Remove the stored JWT access token (logout). */
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Returns true when a token is present (not validated). */
export function isAuthenticated() {
  return Boolean(getToken());
}
// ── Core request helper ───────────────────────────────────

/**
 * Low-level fetch wrapper.
 *
 * @param {string} path         API path, e.g. '/login'
 * @param {RequestInit} [opts]  Standard fetch options
 * @returns {Promise<any>}      Parsed JSON response body
 * @throws {ApiError}
 */
async function request(path, opts = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...opts,
      headers,
    });
  } catch (networkErr) {
    throw new ApiError('Unable to reach the server. Check your connection.', 0);
  }

  // Parse body regardless of status so we can surface detail messages.
  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch (_) {
      // Non-JSON body – leave as null.
    }
  }

  if (!response.ok) {
    // FastAPI typically puts detail in body.detail
    const detail =
      (body && body.detail) ||
      (body && body.message) ||
      response.statusText ||
      'An unexpected error occurred.';
    throw new ApiError(detail, response.status, body);
  }

  return body;
}

export async function generateRoomId() {
    const room = await request(
        '/rooms/generateRoomId',
        {
            method: 'GET'
        }
    );
    // console.log("response:", room);
    return room.room_id;
}
// ── Auth endpoints ────────────────────────────────────────

/**
 * Register a new user account.
 *
 * POST /register
 * Body: { username, email, password }
 *
 * @param {{ username: string, email: string, password: string }} data
 */
export async function register(data) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Authenticate and retrieve a JWT access token.
 *
 * POST /login
 * Body: { email, password }
 *
 * The returned access_token is persisted automatically.
 *
 * @param {{ email: string, password: string }} data
 * @returns {Promise<{ access_token: string, token_type: string }>}
 */
export async function login(data) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (result && result.access_token) {
    setToken(result.access_token);
  }

  // return result;
}

/**
 * Fetch the authenticated user's profile.
 *
 * GET /profile
 * Requires valid Bearer token.
 *
 * @returns {Promise<{ username: string, email: string, created_at: string }>}
 */
export async function getProfile() {
  return request('/users/me');
}

// ── Session helpers ───────────────────────────────────────

/**
 * Log the current user out:
 * clears the stored token and redirects to login.html.
 */
export function logout() {
  clearToken();
  window.location.href = 'login.html';
}

/**
 * Guard for protected pages.
 * Call at the top of any page that requires authentication.
 * Redirects to login.html if no token is present.
 */
export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.href = 'login.html';
  }
}

/**
 * Guard for auth pages (login / register).
 * Redirects to home2.html if the user is already logged in.
 */
export function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    window.location.href = 'home2.html';
  }
}

// ── room endpoints ───────────────────────────────────────

//POST/room/create
// Body : {roomId , roomPassword}
/**
 * @param {{ room_name : string , room_id: string,  password: string }} data
 */
export async function createRoom(data) {
  return request('/rooms/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

//POST/room/join
// Body : {roomId , roomPassword}
/**
 * @param {{ room_id: string,  password: string }} data
 */
export async function joinRoom(data) {
  return  request('/rooms/join', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteRoom(roomId) {
    return request(`/rooms/${roomId}`, {
        method: "DELETE"
    });
}