const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY || "";
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "folio-media";
const cloudEnabled = Boolean(supabaseUrl && secretKey && bucket);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function encodePath(objectPath) {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

function safeName(name) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const base = path.basename(name || "file", path.extname(name || "file"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "file";
  return base + ext;
}

function publicUrl(objectPath) {
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`;
}

function ownedMedia(storagePath, ownerId, name, type) {
  const normalized = String(storagePath || "").replace(/^\/+/, "");
  if (!normalized.startsWith(String(ownerId) + "/")) return null;
  if (!cloudEnabled) return null;
  return {
    url: publicUrl(normalized),
    type: type === "video" ? "video" : "image",
    name: String(name || "Drive file").slice(0, 240),
    storagePath: normalized
  };
}

async function uploadToCloud(file, ownerId, kind = "media") {
  const objectPath = `${ownerId}/${kind}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName(file.originalname)}`;
  const target = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`;
  const stream = fs.createReadStream(file.path);

  const response = await fetch(target, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": file.mimetype || "application/octet-stream",
      "cache-control": "31536000",
      "x-upsert": "false"
    },
    body: stream,
    duplex: "half"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Cloud upload failed (${response.status}) ${detail.slice(0, 180)}`);
  }

  try { fs.unlinkSync(file.path); } catch {}

  return {
    url: publicUrl(objectPath),
    type: String(file.mimetype || "").startsWith("video/") ? "video" : "image",
    name: file.originalname,
    storagePath: objectPath
  };
}

async function persist(file, ownerId, kind = "media") {
  if (cloudEnabled) return uploadToCloud(file, ownerId, kind);
  return {
    url: "/uploads/" + file.filename,
    type: String(file.mimetype || "").startsWith("video/") ? "video" : "image",
    name: file.originalname,
    storagePath: null
  };
}

async function remove(media) {
  if (!media) return;

  if (cloudEnabled && media.storagePath) {
    const target = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`;
    const response = await fetch(target, {
      method: "DELETE",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefixes: [media.storagePath] })
    });
    if (!response.ok && response.status !== 404) {
      console.error("Cloud media delete failed", response.status, await response.text().catch(() => ""));
    }
    return;
  }

  if (media.url && media.url.startsWith("/uploads/")) {
    const file = path.join(ROOT, media.url.replace(/^\//, ""));
    if (file.startsWith(UPLOAD_DIR) && fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

async function health() {
  if (!cloudEnabled) return { ok: true, mode: "local-disk" };
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` }
  });
  return { ok: response.ok, mode: "supabase-storage", status: response.status };
}

module.exports = {
  mode: cloudEnabled ? "supabase-storage" : "local-disk",
  cloudEnabled,
  persist,
  remove,
  health,
  ownedMedia,
  publicUrl
};
