/**
 * login.js — PeerDrop login page logic
 *
 * Handles:
 *  - Redirect if already authenticated
 *  - Show/hide password toggle
 *  - Form validation
 *  - JWT login via api.js
 *  - Loading and error states
 */

import { login, redirectIfAuthenticated } from './api.js';

// ── Guard: bounce logged-in users to home ─────────────────
redirectIfAuthenticated();

// ── DOM references ────────────────────────────────────────
const form        = document.getElementById('login-form');
const emailInput  = document.getElementById('email');
const pwInput     = document.getElementById('password');
const pwToggle    = document.getElementById('pw-toggle');
const submitBtn   = document.getElementById('submit-btn');
const errorBanner = document.getElementById('auth-error');
const errorText   = document.getElementById('error-text');

// ── Password show/hide ────────────────────────────────────
pwToggle.addEventListener('click', () => {
  const isHidden = pwInput.type === 'password';
  pwInput.type = isHidden ? 'text' : 'password';
  pwToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

  // Swap icon
  pwToggle.querySelector('.icon-show').style.display = isHidden ? 'none'  : 'block';
  pwToggle.querySelector('.icon-hide').style.display = isHidden ? 'block' : 'none';
});

// ── Error display ─────────────────────────────────────────
function showError(message) {
  errorText.textContent = message;
  errorBanner.classList.add('visible');
  errorBanner.setAttribute('role', 'alert');
}

function clearError() {
  errorBanner.classList.remove('visible');
  errorText.textContent = '';
}

// ── Loading state ─────────────────────────────────────────
function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.classList.toggle('loading', loading);
}

// ── Validate inputs ───────────────────────────────────────
function validate() {
  const email    = emailInput.value.trim();
  const password = pwInput.value;

  if (!email) {
    showError('Email address is required.');
    emailInput.focus();
    return false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('Please enter a valid email address.');
    emailInput.focus();
    return false;
  }

  if (!password) {
    showError('Password is required.');
    pwInput.focus();
    return false;
  }

  return true;
}

// ── Form submit ───────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  if (!validate()) return;

  setLoading(true);

  try {
    await login({
      email:    emailInput.value.trim(),
      password: pwInput.value,
    });

    // Success: token stored by api.js — navigate home
    window.location.href = 'index.html';
  } catch (err) {
    showError(err.message || 'Login failed. Please try again.');
  } finally {
    setLoading(false);
  }
});

// Clear error when user starts typing
[emailInput, pwInput].forEach((el) => {
  el.addEventListener('input', clearError);
});
