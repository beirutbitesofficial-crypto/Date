const nodemailer = require("nodemailer");

const APP_URL = String(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const configured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM
);

let transporter = null;

function getTransporter() {
  if (!configured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      pool: true,
      maxConnections: 4,
      maxMessages: 100
    });
  }
  return transporter;
}

async function send(to, subject, text, html) {
  const client = getTransporter();
  if (!client) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[mail-dev]", subject, to, text);
      return { dev: true };
    }
    throw new Error("Transactional email is not configured.");
  }

  return client.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html
  });
}

function emailHtml(title, body, buttonText, url) {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ed;font-family:Arial,sans-serif;color:#111">
  <div style="max-width:560px;margin:0 auto;padding:48px 20px">
    <div style="font-size:20px;font-weight:800;margin-bottom:32px">FolioOne</div>
    <div style="background:#fff;border-radius:18px;padding:32px">
      <h1 style="font-size:28px;margin:0 0 16px">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#666;margin:0 0 26px">${body}</p>
      <a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:13px 20px;font-weight:700">${buttonText}</a>
      <p style="font-size:11px;line-height:1.5;color:#999;margin:28px 0 0;word-break:break-all">If the button does not work, copy this link:<br>${url}</p>
    </div>
  </div></body></html>`;
}

async function sendVerification(user, token) {
  const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return send(
    user.email,
    "Verify your FolioOne email",
    `Verify your FolioOne email: ${url}\nThis link expires in 24 hours.`,
    emailHtml(
      "Verify your email",
      "Confirm this email address to publish your portfolio and protect your account. This link expires in 24 hours.",
      "Verify email",
      url
    )
  );
}

async function sendPasswordReset(user, token) {
  const url = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return send(
    user.email,
    "Reset your FolioOne password",
    `Reset your FolioOne password: ${url}\nThis link expires in 60 minutes.`,
    emailHtml(
      "Reset your password",
      "Use this secure link to choose a new password. If you did not request this, you can ignore this email.",
      "Reset password",
      url
    )
  );
}

async function verifyConnection() {
  const client = getTransporter();
  if (!client) return { ok: false, configured: false };
  try {
    await client.verify();
    return { ok: true, configured: true };
  } catch (error) {
    return { ok: false, configured: true, error: error.message };
  }
}

module.exports = { configured, sendVerification, sendPasswordReset, verifyConnection };
