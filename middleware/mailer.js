const nodemailer = require('nodemailer');
const fs   = require('fs');
const path = require('path');

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../data/settings.json'), 'utf8'));
  } catch (_) { return {}; }
}

/**
 * Send an OTP email.
 * If SMTP is not configured, logs the OTP to console (dev mode).
 */
async function sendOTP(to, otp, purpose, siteName) {
  const s = getSettings();
  const site = siteName || s.siteName || 'Investment Platform';

  const subjects = {
    verify:  `[${site}] Email Verification Code`,
    reset:   `[${site}] Password Reset Code`,
  };
  const headings = {
    verify: 'Verify Your Email Address',
    reset:  'Reset Your Password',
  };
  const bodies = {
    verify: `You're almost there! Enter the code below to verify your email address and activate your account.`,
    reset:  `We received a request to reset your password. Enter the code below to continue.`,
  };

  const subject = subjects[purpose] || `[${site}] Verification Code`;
  const heading = headings[purpose] || 'Your Verification Code';
  const body    = bodies[purpose]   || 'Use the code below to continue.';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#161b22;border-radius:16px;overflow:hidden;border:1px solid #30363d;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#f5a623,#e8910a);padding:28px 36px;text-align:center;">
          <h1 style="margin:0;color:#000;font-size:1.5rem;font-weight:900;letter-spacing:.02em;">${site}</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 36px 24px;">
          <h2 style="margin:0 0 12px;color:#e6edf3;font-size:1.2rem;font-weight:700;">${heading}</h2>
          <p style="margin:0 0 28px;color:#8b949e;font-size:.9rem;line-height:1.6;">${body}</p>
          <!-- OTP box -->
          <div style="background:#0d1117;border:2px dashed #f5a623;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 6px;color:#8b949e;font-size:.75rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">Your Code</p>
            <div style="font-size:2.5rem;font-weight:900;letter-spacing:.3em;color:#f5a623;font-family:monospace;">${otp}</div>
            <p style="margin:8px 0 0;color:#6e7681;font-size:.75rem;">Expires in 15 minutes</p>
          </div>
          <p style="margin:0;color:#6e7681;font-size:.8rem;line-height:1.5;">
            If you did not request this, you can safely ignore this email.
            Do not share this code with anyone.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#0d1117;padding:16px 36px;text-align:center;border-top:1px solid #21262d;">
          <p style="margin:0;color:#484f58;font-size:.75rem;">&copy; ${new Date().getFullYear()} ${site}. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // If SMTP not configured → just log (useful for local dev / before admin sets up SMTP)
  if (!s.smtpHost || !s.smtpUser || !s.smtpPass) {
    console.log(`\n[MAILER – no SMTP configured] OTP for ${to} (${purpose}): ${otp}\n`);
    return { preview: true, otp };
  }

  const transporter = nodemailer.createTransport({
    host: s.smtpHost,
    port: parseInt(s.smtpPort) || 587,
    secure: parseInt(s.smtpPort) === 465,
    auth: { user: s.smtpUser, pass: s.smtpPass },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: s.smtpFrom || `"${site}" <${s.smtpUser}>`,
    to,
    subject,
    html,
  });

  return { preview: false };
}

module.exports = { sendOTP };
