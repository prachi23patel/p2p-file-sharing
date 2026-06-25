/**
 * register.js — PeerDrop registration page logic
 *
 * Handles:
 *  - Redirect if already authenticated
 *  - Show/hide password toggles
 *  - Real-time password strength indicator
 *  - Form validation (all fields + confirm password match)
 *  - Account creation via api.js
 *  - Loading and error states
 */

import { register, redirectIfAuthenticated } from './api.js';

// ── Guard ─────────────────────────────────────────────────
redirectIfAuthenticated();

// ── DOM references ────────────────────────────────────────
const form            = document.getElementById('register-form');
const usernameInput   = document.getElementById('username');
const emailInput      = document.getElementById('email');
const pwInput         = document.getElementById('password');
const pwConfirmInput  = document.getElementById('confirm-password');
const pwToggle        = document.getElementById('pw-toggle');
const pwConfirmToggle = document.getElementById('pw-confirm-toggle');
const submitBtn       = document.getElementById('submit-btn');
const errorBanner     = document.getElementById('auth-error');
const errorText       = document.getElementById('error-text');

// Strength meter elements
const strengthBars    = document.querySelectorAll('.strength-bar');
const strengthLabel   = document.getElementById('strength-label');

// ── Password show/hide ────────────────────────────────────
function makeToggle(toggleBtn, inputEl) {
  toggleBtn.addEventListener('click', () => {
    const hidden = inputEl.type === 'password';
    inputEl.type = hidden ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    toggleBtn.querySelector('.icon-show').style.display = hidden ? 'none'  : 'block';
    toggleBtn.querySelector('.icon-hide').style.display = hidden ? 'block' : 'none';
  });
}

makeToggle(pwToggle,        pwInput);
makeToggle(pwConfirmToggle, pwConfirmInput);

// ── Password strength ─────────────────────────────────────
const LEVELS = ['', 'weak', 'fair', 'good', 'strong'];
const LABELS = {
  weak:   'Weak',
  fair:   'Fair',
  good:   'Good',
  strong: 'Strong',
};

/**
 * Score password from 0–4:
 * +1 length ≥ 8
 * +1 contains uppercase
 * +1 contains number
 * +1 contains symbol
 */
function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)                   score++;
  if (/[A-Z]/.test(pw))                 score++;
  if (/[0-9]/.test(pw))                 score++;
  if (/[^A-Za-z0-9]/.test(pw))         score++;
  return score;
}

function updateStrengthMeter(pw) {
  const score = scorePassword(pw);
  const level = LEVELS[score] || '';

  // Reset bars
  strengthBars.forEach((bar) => {
    bar.className = 'strength-bar';
  });

  if (!pw) {
    strengthLabel.textContent = '';
    strengthLabel.className = 'strength-label';
    return;
  }

  // Activate bars up to score
  for (let i = 0; i < score; i++) {
    strengthBars[i].classList.add(`active-${level}`);
  }

  strengthLabel.textContent = LABELS[level] || '';
  strengthLabel.className = `strength-label ${level}`;
}

pwInput.addEventListener('input', () => {
  updateStrengthMeter(pwInput.value);
  clearError();
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

// ── Validate ──────────────────────────────────────────────
function validate() {
  const username   = usernameInput.value.trim();
  const email      = emailInput.value.trim();
  const password   = pwInput.value;
  const confirm    = pwConfirmInput.value;

  if (!username) {
    showError('Username is required.');
    usernameInput.focus();
    return false;
  }

  if (username.length < 3) {
    showError('Username must be at least 3 characters.');
    usernameInput.focus();
    return false;
  }

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

  if (scorePassword(password) < 2) {
    showError('Password is too weak. Add uppercase letters, numbers, or symbols.');
    pwInput.focus();
    return false;
  }

  if (password !== confirm) {
    showError('Passwords do not match.');
    pwConfirmInput.focus();
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
    await register({
      username: usernameInput.value.trim(),
      email:    emailInput.value.trim(),
      password: pwInput.value,
    });

    // Registration success — redirect to login with a flag
    sessionStorage.setItem('register_success', '1');
    window.location.href = 'login.html';
  } catch (err) {
    showError(err.message || 'Registration failed. Please try again.');
  } finally {
    setLoading(false);
  }
});

// Clear error on typing
[usernameInput, emailInput, pwConfirmInput].forEach((el) => {
  el.addEventListener('input', clearError);
});
