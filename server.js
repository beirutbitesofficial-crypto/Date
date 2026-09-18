const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret-before-production";
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], projects: [] }, null, 2));
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { users: [], projects: [] };
  }
}
function writeDb(db) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function clean(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}
function slugify(value) {
  return clean(value, 80)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "portfolio";
}
function uniqueSlug(db, base, excludeId = null) {
  let candidate = base;
  let n = 2;
  while (db.users.some(u => u.id !== excludeId && u.slug === candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}
function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}
function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifyToken(token) {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !sig) return null;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return data.userId;
  } catch {
    return null;
  }
}
function setSession(res, userId) {
  res.cookie("folio_session", signToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}
function auth(req, res, next) {
  const userId = verifyToken(req.cookies.folio_session);
  if (!userId) return res.status(401).json({ error: "Please sign in." });
  const db = readDb();
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(401).json({ error: "Session expired." });
  req.user = user;
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, Date.now() + "-" + crypto.randomBytes(5).toString("hex") + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
    cb(new Error("Only image and video files are allowed."));
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "1d" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/auth/register", async (req, res) => {
  const fullName = clean(req.body.fullName, 100);
  const email = clean(req.body.email, 150).toLowerCase();
  const password = String(req.body.password || "");
  if (fullName.length < 2) return res.status(400).json({ error: "Enter your full name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

  const db = readDb();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: "Email already registered." });

  const id = crypto.randomUUID();
  const user = {
    id,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    slug: uniqueSlug(db, slugify(fullName)),
    createdAt: new Date().toISOString(),
    onboardingComplete: false,
    profile: {
      fullName,
      position: "",
      discipline: "",
      birthday: "",
      showBirthday: false,
      location: "",
      phone: "",
      bio: "",
      experienceYears: "",
      skills: [],
      services: [],
      languages: [],
      availableForWork: true,
      avatarUrl: "",
      accent: "#111111",
      social: {
        website: "", instagram: "", linkedin: "", behance: "",
        dribbble: "", github: "", youtube: ""
      }
    }
  };
  db.users.push(user);
  writeDb(db);
  setSession(res, id);
  res.status(201).json({ user: safeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = clean(req.body.email, 150).toLowerCase();
  const password = String(req.body.password || "");
  const db = readDb();
  const user = db.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  setSession(res, user.id);
  res.json({ user: safeUser(user) });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("folio_session");
  res.json({ ok: true });
});

app.get("/api/me", auth, (req, res) => {
  const db = readDb();
  const projects = db.projects.filter(p => p.ownerId === req.user.id);
  res.json({ user: safeUser(req.user), projects });
});

app.put("/api/profile", auth, upload.single("avatar"), (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });

  const profile = user.profile || {};
  profile.fullName = clean(req.body.fullName, 100) || profile.fullName;
  profile.position = clean(req.body.position, 100);
  profile.discipline = clean(req.body.discipline, 80);
  profile.birthday = clean(req.body.birthday, 20);
  profile.showBirthday = String(req.body.showBirthday) === "true";
  profile.location = clean(req.body.location, 120);
  profile.phone = clean(req.body.phone, 60);
  profile.bio = clean(req.body.bio, 1200);
  profile.experienceYears = clean(req.body.experienceYears, 30);
  profile.skills = clean(req.body.skills, 600).split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
  profile.services = clean(req.body.services, 800).split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
  profile.languages = clean(req.body.languages, 400).split(",").map(s => s.trim()).filter(Boolean).slice(0, 12);
  profile.availableForWork = String(req.body.availableForWork) !== "false";
  profile.accent = /^#[0-9a-fA-F]{6}$/.test(req.body.accent || "") ? req.body.accent : "#111111";
  profile.social = {
    website: clean(req.body.website, 250),
    instagram: clean(req.body.instagram, 250),
    linkedin: clean(req.body.linkedin, 250),
    behance: clean(req.body.behance, 250),
    dribbble: clean(req.body.dribbble, 250),
    github: clean(req.body.github, 250),
    youtube: clean(req.body.youtube, 250)
  };
  if (req.file) profile.avatarUrl = "/uploads/" + req.file.filename;

  const requestedSlug = slugify(req.body.slug || profile.fullName);
  user.slug = uniqueSlug(db, requestedSlug, user.id);
  user.profile = profile;
  user.onboardingComplete = Boolean(profile.fullName && profile.position && profile.discipline && profile.bio);
  user.updatedAt = new Date().toISOString();

  writeDb(db);
  res.json({ user: safeUser(user) });
});

app.get("/api/projects", auth, (req, res) => {
  const db = readDb();
  res.json({ projects: db.projects.filter(p => p.ownerId === req.user.id) });
});

app.post("/api/projects", auth, upload.array("media", 8), (req, res) => {
  const title = clean(req.body.title, 140);
  if (!title) return res.status(400).json({ error: "Project title is required." });

  const db = readDb();
  const project = {
    id: crypto.randomUUID(),
    ownerId: req.user.id,
    title,
    category: clean(req.body.category, 80),
    client: clean(req.body.client, 100),
    year: clean(req.body.year, 10),
    description: clean(req.body.description, 1600),
    tools: clean(req.body.tools, 500).split(",").map(s => s.trim()).filter(Boolean).slice(0, 20),
    projectUrl: clean(req.body.projectUrl, 300),
    featured: String(req.body.featured) === "true",
    media: (req.files || []).map(file => ({
      url: "/uploads/" + file.filename,
      type: file.mimetype.startsWith("video/") ? "video" : "image",
      name: file.originalname
    })),
    createdAt: new Date().toISOString()
  };
  db.projects.unshift(project);
  writeDb(db);
  res.status(201).json({ project });
});

app.delete("/api/projects/:id", auth, (req, res) => {
  const db = readDb();
  const index = db.projects.findIndex(p => p.id === req.params.id && p.ownerId === req.user.id);
  if (index === -1) return res.status(404).json({ error: "Project not found." });
  const [removed] = db.projects.splice(index, 1);
  for (const media of removed.media || []) {
    const file = path.join(__dirname, media.url.replace(/^\//, ""));
    if (file.startsWith(UPLOAD_DIR) && fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/public/:slug", (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.slug === req.params.slug && u.onboardingComplete);
  if (!user) return res.status(404).json({ error: "Portfolio not found." });
  const projects = db.projects.filter(p => p.ownerId === user.id);
  const publicUser = safeUser(user);
  delete publicUser.email;
  res.json({ user: publicUser, projects });
});

app.get("/u/:slug", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "portfolio.html"));
});
app.get("/app", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Something went wrong." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FolioOne running on port ${PORT}`);
});
