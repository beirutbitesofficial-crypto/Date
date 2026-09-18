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
      (id,email,password_hash,slug,onboarding_complete,profile,created_at,updated_at)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
     returning *`,
    [
      user.id, user.email, user.passwordHash, user.slug,
      user.onboardingComplete, JSON.stringify(user.profile || {}),
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
           profile=$6::jsonb,updated_at=$7
     where id=$1 returning *`,
    [
      user.id, user.email, user.passwordHash, user.slug,
      user.onboardingComplete, JSON.stringify(user.profile || {}),
      user.updatedAt || new Date().toISOString()
    ]
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
  findUserByEmail, findUserById, findUserBySlug, slugExists,
  createUser, saveUser,
  getProjects, findProject, createProject, saveProject, deleteProject
};
