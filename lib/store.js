const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const usePostgres = Boolean(process.env.DATABASE_URL);

let pool = null;

function ensureLocalFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], projects: [] }, null, 2));
  }
}

function readLocal() {
  ensureLocalFile();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      users: Array.isArray(data.users) ? data.users : [],
      projects: Array.isArray(data.projects) ? data.projects : []
    };
  } catch {
    return { users: [], projects: [] };
  }
}

function writeLocal(db) {
  ensureLocalFile();
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function dbUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    slug: row.slug,
    onboardingComplete: row.onboarding_complete,
    emailVerified: row.email_verified,
    emailVerificationTokenHash: row.email_verification_token_hash,
    emailVerificationExpires: row.email_verification_expires instanceof Date ? row.email_verification_expires.toISOString() : row.email_verification_expires,
    passwordResetTokenHash: row.password_reset_token_hash,
    passwordResetExpires: row.password_reset_expires instanceof Date ? row.password_reset_expires.toISOString() : row.password_reset_expires,
    sessionVersion: row.session_version || 1,
    lastLoginAt: row.last_login_at instanceof Date ? row.last_login_at.toISOString() : row.last_login_at,
    profile: row.profile || {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function dbProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    ...(row.payload || {}),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

async function init() {
  if (!usePostgres) {
    ensureLocalFile();
    return;
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === "false" ? false : undefined
  });

  await pool.query("select 1");
}

async function close() {
  if (pool) await pool.end();
}

async function ping() {
  if (!usePostgres) {
    readLocal();
    return true;
  }
  await pool.query("select 1");
  return true;
}

async function findUserByEmail(email) {
  if (!usePostgres) return readLocal().users.find(u => u.email === email) || null;
  const { rows } = await pool.query(
    "select * from folio_private.users where lower(email)=lower($1) limit 1",
    [email]
  );
  return dbUser(rows[0]);
}

async function findUserById(id) {
  if (!usePostgres) return readLocal().users.find(u => u.id === id) || null;
  const { rows } = await pool.query(
    "select * from folio_private.users where id=$1 limit 1",
    [id]
  );
  return dbUser(rows[0]);
}

async function findUserBySlug(slug) {
  if (!usePostgres) return readLocal().users.find(u => u.slug === slug) || null;
  const { rows } = await pool.query(
    "select * from folio_private.users where slug=$1 limit 1",
    [slug]
  );
  return dbUser(rows[0]);
}

async function slugExists(slug, excludeId = null) {
  if (!usePostgres) {
    return readLocal().users.some(u => u.slug === slug && u.id !== excludeId);
  }
  const { rows } = await pool.query(
    "select exists(select 1 from folio_private.users where slug=$1 and ($2::uuid is null or id<>$2::uuid)) as exists",
    [slug, excludeId]
  );
  return Boolean(rows[0]?.exists);
}

async function createUser(user) {
  if (!usePostgres) {
    const db = readLocal();
    db.users.push(user);
    writeLocal(db);
    return user;
  }

  const { rows } = await pool.query(
    `insert into folio_private.users
      (id,email,password_hash,slug,onboarding_complete,email_verified,
       email_verification_token_hash,email_verification_expires,
       password_reset_token_hash,password_reset_expires,session_version,last_login_at,
       profile,created_at,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)
     returning *`,
    [
      user.id, user.email, user.passwordHash, user.slug,
      user.onboardingComplete, Boolean(user.emailVerified),
      user.emailVerificationTokenHash || null, user.emailVerificationExpires || null,
      user.passwordResetTokenHash || null, user.passwordResetExpires || null,
      user.sessionVersion || 1, user.lastLoginAt || null,
      JSON.stringify(user.profile || {}),
      user.createdAt, user.updatedAt || user.createdAt
    ]
  );
  return dbUser(rows[0]);
}

async function saveUser(user) {
  if (!usePostgres) {
    const db = readLocal();
    const i = db.users.findIndex(u => u.id === user.id);
    if (i === -1) throw new Error("User not found.");
    db.users[i] = user;
    writeLocal(db);
    return user;
  }

  const { rows } = await pool.query(
    `update folio_private.users
       set email=$2,password_hash=$3,slug=$4,onboarding_complete=$5,
           email_verified=$6,email_verification_token_hash=$7,email_verification_expires=$8,
           password_reset_token_hash=$9,password_reset_expires=$10,session_version=$11,last_login_at=$12,
           profile=$13::jsonb,updated_at=$14
     where id=$1 returning *`,
    [
      user.id, user.email, user.passwordHash, user.slug,
      user.onboardingComplete, Boolean(user.emailVerified),
      user.emailVerificationTokenHash || null, user.emailVerificationExpires || null,
      user.passwordResetTokenHash || null, user.passwordResetExpires || null,
      user.sessionVersion || 1, user.lastLoginAt || null,
      JSON.stringify(user.profile || {}),
      user.updatedAt || new Date().toISOString()
    ]
  );
  return dbUser(rows[0]);
}


async function findUserByVerificationHash(hash) {
  if (!usePostgres) return readLocal().users.find(u => u.emailVerificationTokenHash === hash) || null;
  const { rows } = await pool.query(
    "select * from folio_private.users where email_verification_token_hash=$1 limit 1",
    [hash]
  );
  return dbUser(rows[0]);
}

async function findUserByResetHash(hash) {
  if (!usePostgres) return readLocal().users.find(u => u.passwordResetTokenHash === hash) || null;
  const { rows } = await pool.query(
    "select * from folio_private.users where password_reset_token_hash=$1 limit 1",
    [hash]
  );
  return dbUser(rows[0]);
}

async function deleteUser(userId) {
  if (!usePostgres) {
    const db = readLocal();
    const user = db.users.find(u => u.id === userId) || null;
    db.users = db.users.filter(u => u.id !== userId);
    db.projects = db.projects.filter(p => p.ownerId !== userId);
    writeLocal(db);
    return user;
  }
  const { rows } = await pool.query(
    "delete from folio_private.users where id=$1 returning *",
    [userId]
  );
  return dbUser(rows[0]);
}

async function getProjects(ownerId) {
  if (!usePostgres) {
    return readLocal().projects
      .filter(p => p.ownerId === ownerId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  const { rows } = await pool.query(
    "select * from folio_private.projects where owner_id=$1 order by created_at desc",
    [ownerId]
  );
  return rows.map(dbProject);
}

async function findProject(ownerId, projectId) {
  if (!usePostgres) {
    return readLocal().projects.find(p => p.ownerId === ownerId && p.id === projectId) || null;
  }
  const { rows } = await pool.query(
    "select * from folio_private.projects where owner_id=$1 and id=$2 limit 1",
    [ownerId, projectId]
  );
  return dbProject(rows[0]);
}

async function createProject(project) {
  if (!usePostgres) {
    const db = readLocal();
    db.projects.unshift(project);
    writeLocal(db);
    return project;
  }

  const payload = { ...project };
  delete payload.id;
  delete payload.ownerId;
  delete payload.createdAt;
  delete payload.updatedAt;

  const { rows } = await pool.query(
    `insert into folio_private.projects (id,owner_id,payload,created_at,updated_at)
     values ($1,$2,$3::jsonb,$4,$5) returning *`,
    [
      project.id, project.ownerId, JSON.stringify(payload),
      project.createdAt, project.updatedAt || project.createdAt
    ]
  );
  return dbProject(rows[0]);
}

async function saveProject(project) {
  if (!usePostgres) {
    const db = readLocal();
    const i = db.projects.findIndex(p => p.id === project.id && p.ownerId === project.ownerId);
    if (i === -1) throw new Error("Project not found.");
    db.projects[i] = project;
    writeLocal(db);
    return project;
  }

  const payload = { ...project };
  delete payload.id;
  delete payload.ownerId;
  delete payload.createdAt;
  delete payload.updatedAt;

  const { rows } = await pool.query(
    `update folio_private.projects
       set payload=$3::jsonb,updated_at=$4
     where id=$1 and owner_id=$2 returning *`,
    [project.id, project.ownerId, JSON.stringify(payload), project.updatedAt || new Date().toISOString()]
  );
  return dbProject(rows[0]);
}

async function deleteProject(ownerId, projectId) {
  if (!usePostgres) {
    const db = readLocal();
    const i = db.projects.findIndex(p => p.id === projectId && p.ownerId === ownerId);
    if (i === -1) return null;
    const [removed] = db.projects.splice(i, 1);
    writeLocal(db);
    return removed;
  }

  const { rows } = await pool.query(
    "delete from folio_private.projects where owner_id=$1 and id=$2 returning *",
    [ownerId, projectId]
  );
  return dbProject(rows[0]);
}

module.exports = {
  mode: usePostgres ? "postgres" : "local-json",
  init, close, ping,
  findUserByEmail, findUserById, findUserBySlug, findUserByVerificationHash, findUserByResetHash, slugExists,
  createUser, saveUser, deleteUser,
  getProjects, findProject, createProject, saveProject, deleteProject
};
