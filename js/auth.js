// auth.js — all authentication logic
// ─────────────────────────────────────────────────────────────────────────────

import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc, setDoc, getDoc,
    collection, query, where, getDocs,
    serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sendAccountRequestEmail } from './emailjs.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generates a username like "FirstName4821@remotely" */
function generateUsername(fullName) {
    const firstName = fullName.trim().split(/\s+/)[0];
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `${firstName}${digits}@remotely`;
}

/** Generates a random 10-char alphanumeric password */
function generatePassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 10; i++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
}

/** Converts a username to the dummy Firebase email */
function usernameToEmail(username) {
    // "Juan4821@remotely"  →  "Juan4821@remotely.app"
    return username + '.app';
}

/** Formats a date for display in the email notification */
function formatTimestamp(date = new Date()) {
    return date.toLocaleString('en-PH', {
        year:  'numeric', month:  'long',  day:    'numeric',
        hour:  '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Manila',
    });
}

// ── Sign Up ───────────────────────────────────────────────────────────────────

/**
 * Handles the full account-request flow.
 * @param {string} fullName
 * @param {string} department
 * @returns {Promise<void>}
 * @throws {Error} with a human-readable message
 */
export async function requestAccount(fullName, department) {
    const username = generateUsername(fullName);
    const password = generatePassword();
    const email    = usernameToEmail(username);

    // 1. Create Firebase Auth account
    let userCredential;
    try {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
            // Rare collision — retry with a new username
            return requestAccount(fullName, department);
        }
        throw new Error('Failed to create account. Please try again.');
    }

    const uid = userCredential.user.uid;

    // 2. Save user document to Firestore (approved: false)
    try {
        await setDoc(doc(db, 'users', uid), {
            fullName:   fullName.trim(),
            department: department.trim(),
            username,
            email,
            createdAt:  serverTimestamp(),
            approved:   false,
        });
    } catch (err) {
        // Clean up the auth account if Firestore fails
        await userCredential.user.delete().catch(() => {});
        throw new Error('Failed to save account data. Please try again.');
    }

    // 3. Sign out immediately (account is pending approval)
    await signOut(auth).catch(() => {});

    // 4. Send email notification via EmailJS (non-blocking on failure)
    try {
        await sendAccountRequestEmail({
            full_name:  fullName.trim(),
            department: department.trim(),
            username,
            password,
            timestamp:  formatTimestamp(),
        });
    } catch (err) {
        // Email failure is non-critical — account was already created
        console.warn('EmailJS notification failed:', err);
    }
}

// ── Sign In ───────────────────────────────────────────────────────────────────

/**
 * Signs a user in by username.
 * @param {string} username   — the @remotely username
 * @param {string} password
 * @returns {Promise<void>}
 * @throws {Error} with a human-readable message
 */
export async function signInWithUsername(username, password) {
    // 1. Look up user document by username field
    const q = query(collection(db, 'users'), where('username', '==', username));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        throw new Error('Incorrect username or password.');
    }

    const userDoc  = snapshot.docs[0];
    const userData = userDoc.data();
    const email    = userData.email;

    // 2. Sign in via Firebase Auth
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        throw new Error('Incorrect username or password.');
    }

    // 3. Re-fetch Firestore document to check approval status
    const freshDoc = await getDoc(doc(db, 'users', userDoc.id));
    const freshData = freshDoc.data();

    if (!freshData.approved) {
        await signOut(auth);
        throw new Error('pending');   // caller shows the pending-approval message
    }

    // 4. Approved → caller should redirect to index.html
}

// ── Sign Out ──────────────────────────────────────────────────────────────────

export async function signOutUser(loginPath = './auth/login.html') {
    await signOut(auth);
    window.location.href = loginPath;
}

// ── Route Guard ───────────────────────────────────────────────────────────────

/**
 * Call at the top of any protected page.
 * Redirects to login if the user is not authenticated + approved.
 *
 * Usage (in a <script type="module"> block):
 *   import { requireAuth } from '../js/auth.js';
 *   requireAuth();
 */
export function requireAuth(loginPath = './auth/login.html') {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = loginPath;
            return;
        }

        // Check approval status
        try {
            const snap = await getDoc(doc(db, 'users', user.uid));
            if (!snap.exists() || !snap.data().approved) {
                await signOut(auth);
                window.location.href = loginPath;
            }
            // Approved — stay on the page
        } catch {
            await signOut(auth);
            window.location.href = loginPath;
        }
    });
}

// ── Auth State Observer for login.html ───────────────────────────────────────

/**
 * If a user is already logged-in and approved when they open login.html,
 * skip straight to the app.  Call this only from login.html.
 */
export function redirectIfLoggedIn() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) return;

        try {
            const snap = await getDoc(doc(db, 'users', user.uid));
            if (snap.exists() && snap.data().approved) {
                window.location.href = '../index.html';
            }
        } catch { /* stay on login page */ }
    });
}
