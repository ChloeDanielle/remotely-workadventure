// emailjs.js
// ─────────────────────────────────────────────────────────────────────────────
// Replace every "YOUR_*" value below with your real EmailJS credentials.
// Dashboard: https://dashboard.emailjs.com/
//
// Template variables used (must match your EmailJS template exactly):
//   {{full_name}}   — registrant's full name
//   {{department}}  — registrant's department
//   {{username}}    — generated username  (e.g. Juan4821@remotely)
//   {{password}}    — generated password  (e.g. aB3kR7mZ9x)
//   {{timestamp}}   — formatted date/time of the request
//
// Recipient is hard-coded to aesrshan@gmail.com via the EmailJS template's
// "To Email" field. No need to pass it as a variable.
// ─────────────────────────────────────────────────────────────────────────────

const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';
const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';

/**
 * Loads the EmailJS SDK and sends an account-request notification.
 * @param {Object} params
 * @param {string} params.full_name
 * @param {string} params.department
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.timestamp
 * @returns {Promise<void>}
 */
export async function sendAccountRequestEmail(params) {
    // Lazy-load the EmailJS SDK from CDN (avoids build-tool dependency)
    await loadEmailJS();

    return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        full_name:  params.full_name,
        department: params.department,
        username:   params.username,
        password:   params.password,
        timestamp:  params.timestamp,
    });
}

function loadEmailJS() {
    return new Promise((resolve, reject) => {
        if (window.emailjs) { resolve(); return; }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
        script.onload = () => {
            emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
            resolve();
        };
        script.onerror = () => reject(new Error('Failed to load EmailJS SDK'));
        document.head.appendChild(script);
    });
}
