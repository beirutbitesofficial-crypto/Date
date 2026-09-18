const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const compression = require("compression");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const store = require("./lib/store");
const mediaStore = require("./lib/media");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === "production";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const APP_URL = String(process.env.APP_URL || "").replace(/\/$/, "");
const MAX_UPLOAD_MB = Math.min(Math.max(Number(process.env.MAX_UPLOAD_MB || 250), 1), 500);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function validateProductionEnv() {
  if (!IS_PROD) return;
  const missing = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (32+ chars)");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SECRET_KEY) missing.push("SUPABASE_SECRET_KEY");
  if (!process.env.SUPABASE_STORAGE_BUCKET) missing.push("SUPABASE_STORAGE_BUCKET");
  if (!APP_URL || !/^https:\/\//i.test(APP_URL)) missing.push("APP_URL (https://...)");
  if (missing.length) throw new Error("Production configuration incomplete: " + missing.join(", "));
}
validateProductionEnv();

if (IS_PROD || process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));

app.disable("x-powered-by");
app.use(compression());
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://apis.google.com", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://www.googleapis.com", "https://*.supabase.co"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://drive.google.com", "https://www.youtube.com", "https://player.vimeo.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 350,
  standardHeaders: "draft-8",
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true
});
app.use("/api", apiLimiter);

function verifyOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next();
  const allowed = new Set([
    APP_URL,
    `${req.protocol}://${req.get("host")}`
  ].filter(Boolean));
  if (!allowed.has(origin.replace(/\/$/, ""))) return res.status(403).json({ error: "Invalid request origin." });
  next();
}
app.use("/api", verifyOrigin);

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: IS_PROD ? "7d" : 0, immutable: IS_PROD }));
app.use(express.static(path.join(ROOT, "public"), {
  etag: true,
  maxAge: IS_PROD ? "1h" : 0
}));

function clean(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}
function safeHttpUrl(value) {
  const raw = clean(value, 1000);
  try {
    const u = new URL(raw);
    return ["http:", "https:"].includes(u.protocol) ? u.toString() : "";
  } catch {
    return "";
  }
}
function slugify(value) {
  return clean(value, 80)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "portfolio";
}
async function uniqueSlug(base, excludeId = null) {
  let candidate = base;
  let n = 2;
  while (await store.slugExists(candidate, excludeId)) candidate = `${base}-${n++}`;
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
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
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
    secure: IS_PROD,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}
async function auth(req, res, next) {
  try {
    const userId = verifyToken(req.cookies.folio_session);
    if (!userId) return res.status(401).json({ error: "Please sign in." });
    const user = await store.findUserById(userId);
    if (!user) return res.status(401).json({ error: "Session expired." });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
function detectPlatform(url) {
  const value = String(url || "").toLowerCase();
  if (value.includes("drive.google.com")) return "Google Drive";
  if (value.includes("dropbox.com")) return "Dropbox";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YouTube";
  if (value.includes("vimeo.com")) return "Vimeo";
  if (value.includes("behance.net")) return "Behance";
  if (value.includes("dribbble.com")) return "Dribbble";
  if (value.includes("github.com")) return "GitHub";
  if (value.includes("figma.com")) return "Figma";
  if (value.includes("canva.com")) return "Canva";
  if (value.includes("notion.so") || value.includes("notion.site")) return "Notion";
  if (value.includes("instagram.com")) return "Instagram";
  if (value.includes("tiktok.com")) return "TikTok";
  return "External";
}
function externalSource(rawUrl) {
  const url = safeHttpUrl(rawUrl);
  if (!url) return null;
  const platform = detectPlatform(url);
  let embedUrl = "";
  let kind = "link";

  if (platform === "YouTube") {
    try {
      const u = new URL(url);
      let id = u.hostname.includes("youtu.be") ? u.pathname.split("/").filter(Boolean)[0] : u.searchParams.get("v");
      if (!id) {
        const parts = u.pathname.split("/").filter(Boolean);
        if (["shorts", "embed"].includes(parts[0])) id = parts[1];
      }
      if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        embedUrl = "https://www.youtube.com/embed/" + id;
        kind = "video";
      }
    } catch {}
  } else if (platform === "Vimeo") {
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (match) {
      embedUrl = "https://player.vimeo.com/video/" + match[1];
      kind = "video";
    }
  } else if (platform === "Google Drive") {
    const pathMatch = url.match(/\/file\/d\/([^/]+)/);
    const idMatch = url.match(/[?&]id=([^&]+)/);
    const id = (pathMatch && pathMatch[1]) || (idMatch && idMatch[1]) || "";
    if (id) {
      embedUrl = "https://drive.google.com/file/d/" + id + "/preview";
      kind = "drive";
    }
  } else if (platform === "Dropbox") {
    try {
      const u = new URL(url);
      const pathname = u.pathname.toLowerCase();
      u.searchParams.set("raw", "1");
      embedUrl = u.toString();
      if (/\.(mp4|mov|m4v|webm)$/.test(pathname)) kind = "video-file";
      else if (/\.(jpg|jpeg|png|gif|webp|avif)$/.test(pathname)) kind = "image-file";
      else kind = "file";
    } catch {}
  }

  return { url, platform, embedUrl, kind };
}
function parseSourceLinks(value) {
  return clean(value, 10000)
    .split(/\r?\n/)
    .map(v => externalSource(v.trim()))
    .filter(Boolean)
    .slice(0, 15);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
    cb(null, Date.now() + "-" + crypto.randomBytes(8).toString("hex") + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
    cb(new Error("Only image and video files are allowed."));
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "folioone" }));
app.get("/readyz", async (_req, res, next) => {
  try {
    await store.ping();
    const storageHealth = await mediaStore.health();
    const ok = storageHealth.ok !== false;
    res.status(ok ? 200 : 503).json({
      ok,
      database: store.mode,
      storage: storageHealth.mode
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    googleDrive: {
      enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_API_KEY && process.env.GOOGLE_APP_ID),
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      apiKey: process.env.GOOGLE_API_KEY || "",
      appId: process.env.GOOGLE_APP_ID || ""
    },
    maxUploadMb: MAX_UPLOAD_MB
  });
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const fullName = clean(req.body.fullName, 100);
    const email = clean(req.body.email, 150).toLowerCase();
    const password = String(req.body.password || "");
    if (fullName.length < 2) return res.status(400).json({ error: "Enter your full name." });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
    if (password.length < 10) return res.status(400).json({ error: "Password must be at least 10 characters." });
    if (await store.findUserByEmail(email)) return res.status(409).json({ error: "Email already registered." });

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const user = {
      id,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      slug: await uniqueSlug(slugify(fullName)),
      createdAt: now,
      updatedAt: now,
      onboardingComplete: false,
      profile: {
        fullName,
        position: "",
        discipline: "",
        birthday: "",
        showBirthday: false,
        location: "",
        phone: "",
        contactEmail: email,
        showContactEmail: true,
        bio: "",
        experienceYears: "",
        skills: [],
        services: [],
        languages: [],
        availableForWork: true,
        portfolioPublic: true,
        avatarUrl: "",
        accent: "#111111",
        social: {
          website: "", instagram: "", linkedin: "", behance: "",
          dribbble: "", github: "", youtube: "", vimeo: "",
          figma: "", canva: "", notion: "", tiktok: ""
        }
      }
    };
    const created = await store.createUser(user);
    setSession(res, id);
    res.status(201).json({ user: safeUser(created) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body.email, 150).toLowerCase();
    const password = String(req.body.password || "");
    const user = await store.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    setSession(res, user.id);
    res.json({ user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("folio_session", { path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", auth, async (req, res, next) => {
  try {
    const projects = await store.getProjects(req.user.id);
    res.json({ user: safeUser(req.user), projects });
  } catch (error) {
    next(error);
  }
});

app.put("/api/profile", auth, upload.single("avatar"), async (req, res, next) => {
  try {
    const user = await store.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const p = user.profile || {};
    p.fullName = clean(req.body.fullName, 100) || p.fullName;
    p.position = clean(req.body.position, 100);
    p.discipline = clean(req.body.discipline, 80);
    p.birthday = clean(req.body.birthday, 20);
    p.showBirthday = String(req.body.showBirthday) === "true";
    p.location = clean(req.body.location, 120);
    p.phone = clean(req.body.phone, 60);
    p.contactEmail = clean(req.body.contactEmail, 150).toLowerCase();
    p.showContactEmail = String(req.body.showContactEmail) !== "false";
    p.bio = clean(req.body.bio, 1200);
    p.experienceYears = clean(req.body.experienceYears, 30);
    p.skills = clean(req.body.skills, 700).split(",").map(s => s.trim()).filter(Boolean).slice(0, 24);
    p.services = clean(req.body.services, 900).split(",").map(s => s.trim()).filter(Boolean).slice(0, 24);
    p.languages = clean(req.body.languages, 400).split(",").map(s => s.trim()).filter(Boolean).slice(0, 12);
    p.availableForWork = String(req.body.availableForWork) !== "false";
    p.portfolioPublic = String(req.body.portfolioPublic) !== "false";
    p.accent = /^#[0-9a-fA-F]{6}$/.test(req.body.accent || "") ? req.body.accent : "#111111";
    p.social = {
      website: clean(req.body.website, 250),
      instagram: clean(req.body.instagram, 250),
      linkedin: clean(req.body.linkedin, 250),
      behance: clean(req.body.behance, 250),
      dribbble: clean(req.body.dribbble, 250),
      github: clean(req.body.github, 250),
      youtube: clean(req.body.youtube, 250),
      vimeo: clean(req.body.vimeo, 250),
      figma: clean(req.body.figma, 250),
      canva: clean(req.body.canva, 250),
      notion: clean(req.body.notion, 250),
      tiktok: clean(req.body.tiktok, 250)
    };

    if (req.file) {
      const previous = p.avatarStoragePath ? { url: p.avatarUrl, storagePath: p.avatarStoragePath } : null;
      const saved = await mediaStore.persist(req.file, user.id, "avatar");
      p.avatarUrl = saved.url;
      p.avatarStoragePath = saved.storagePath || null;
      if (previous) await mediaStore.remove(previous);
    }

    user.slug = await uniqueSlug(slugify(req.body.slug || p.fullName), user.id);
    user.profile = p;
    user.onboardingComplete = Boolean(p.fullName && p.position && p.discipline && p.bio);
    user.updatedAt = new Date().toISOString();

    const savedUser = await store.saveUser(user);
    res.json({ user: safeUser(savedUser) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", auth, async (req, res, next) => {
  try {
    res.json({ projects: await store.getProjects(req.user.id) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", auth, upload.array("media", 8), async (req, res, next) => {
  try {
    const title = clean(req.body.title, 140);
    if (!title) return res.status(400).json({ error: "Project title is required." });

    const savedMedia = [];
    for (const file of req.files || []) {
      savedMedia.push(await mediaStore.persist(file, req.user.id, "projects"));
    }

    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      ownerId: req.user.id,
      title,
      category: clean(req.body.category, 80),
      client: clean(req.body.client, 100),
      year: clean(req.body.year, 10),
      description: clean(req.body.description, 1800),
      tools: clean(req.body.tools, 600).split(",").map(s => s.trim()).filter(Boolean).slice(0, 24),
      projectUrl: safeHttpUrl(req.body.projectUrl),
      externalSources: parseSourceLinks(req.body.sourceLinks),
      featured: String(req.body.featured) === "true",
      published: String(req.body.published) !== "false",
      media: savedMedia,
      createdAt: now,
      updatedAt: now
    };
    res.status(201).json({ project: await store.createProject(project) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:id", auth, upload.array("media", 8), async (req, res, next) => {
  try {
    const project = await store.findProject(req.user.id, req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });

    const title = clean(req.body.title, 140);
    if (!title) return res.status(400).json({ error: "Project title is required." });

    const newMedia = [];
    for (const file of req.files || []) {
      newMedia.push(await mediaStore.persist(file, req.user.id, "projects"));
    }

    project.title = title;
    project.category = clean(req.body.category, 80);
    project.client = clean(req.body.client, 100);
    project.year = clean(req.body.year, 10);
    project.description = clean(req.body.description, 1800);
    project.tools = clean(req.body.tools, 600).split(",").map(s => s.trim()).filter(Boolean).slice(0, 24);
    project.projectUrl = safeHttpUrl(req.body.projectUrl);
    project.externalSources = parseSourceLinks(req.body.sourceLinks);
    project.featured = String(req.body.featured) === "true";
    project.published = String(req.body.published) !== "false";
    project.media = [...(project.media || []), ...newMedia].slice(0, 12);
    project.updatedAt = new Date().toISOString();

    res.json({ project: await store.saveProject(project) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:id", auth, async (req, res, next) => {
  try {
    const removed = await store.deleteProject(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: "Project not found." });
    for (const item of removed.media || []) await mediaStore.remove(item);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/:slug", async (req, res, next) => {
  try {
    const user = await store.findUserBySlug(req.params.slug);
    if (!user || !user.onboardingComplete || user.profile?.portfolioPublic === false) {
      return res.status(404).json({ error: "Portfolio not found." });
    }
    const projects = (await store.getProjects(user.id)).filter(p => p.published !== false);
    const publicUser = safeUser(user);
    delete publicUser.email;
    res.json({ user: publicUser, projects });
  } catch (error) {
    next(error);
  }
});

app.get("/u/:slug", async (req, res, next) => {
  try {
    const user = await store.findUserBySlug(req.params.slug);
    if (!user || !user.onboardingComplete || user.profile?.portfolioPublic === false) {
      return res.status(404).sendFile(path.join(ROOT, "public", "404.html"));
    }
    const template = fs.readFileSync(path.join(ROOT, "public", "portfolio.html"), "utf8");
    const name = clean(user.profile?.fullName || "Portfolio", 100).replace(/[<>&"]/g, "");
    const role = clean(user.profile?.position || user.profile?.discipline || "Freelancer", 140).replace(/[<>&"]/g, "");
    const description = clean(user.profile?.bio || `${name} — ${role}`, 180).replace(/[<>&"]/g, "");
    const canonical = (APP_URL || `${req.protocol}://${req.get("host")}`) + "/u/" + encodeURIComponent(user.slug);
    const html = template
      .replace("<title>Portfolio</title>", `<title>${name} — ${role}</title>`)
      .replace("</head>", `<meta name="description" content="${description}"><meta property="og:title" content="${name} — ${role}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${canonical}"><link rel="canonical" href="${canonical}"></head>`);
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

app.get("/app", (_req, res) => res.sendFile(path.join(ROOT, "public", "app.html")));

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
app.use((_req, res) => res.status(404).sendFile(path.join(ROOT, "public", "404.html")));

app.use((err, req, res, _next) => {
  console.error("[error]", req.method, req.originalUrl, err);
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: `Each file must be ${MAX_UPLOAD_MB}MB or smaller.` });
  if (err?.code === "LIMIT_FILE_COUNT") return res.status(413).json({ error: "Too many files. Maximum is 8." });
  res.status(500).json({ error: IS_PROD ? "Something went wrong. Please try again." : (err.message || "Something went wrong.") });
});

let server;
async function start() {
  await store.init();
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`FolioOne running on port ${PORT} · DB=${store.mode} · Storage=${mediaStore.mode}`);
  });
}
async function shutdown(signal) {
  console.log(signal + " received, shutting down...");
  if (server) server.close(async () => {
    await store.close().catch(() => {});
    process.exit(0);
  });
  else process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});
