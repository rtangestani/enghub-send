// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const mysql = require('mysql2/promise');
const archiver = require('archiver');
const helmet = require('helmet');
const morgan = require('morgan');

// Security + email + oauth
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oidc');
const GitHubStrategy = require('passport-github2').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;

const PORT = process.env.PORT || 4000;
const UPLOADS_ROOT = path.join(__dirname, process.env.UPLOADS_ROOT || 'uploads');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

(async function main() {
  if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
  });

  try { await pool.query('SELECT 1'); console.log('✅ MySQL connected'); }
  catch (e) { console.error('❌ MySQL connection failed:', e.message); }

  async function q(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  // ---------- Helpers ----------
function safeParseJSON(s, fallback = null) {
  if (!s) return fallback;
  if (typeof s === 'object') return s;   // If `s` is already an object/array, use it as-is
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

  function extToType(ext) {
    ext = String(ext || '').toLowerCase();
    if (['pdf'].includes(ext)) return 'Publications';
    if (['stl','step','stp','iges','igs','sldprt','sldasm','obj'].includes(ext)) return 'CAD Models';
    if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return 'Images';
    if (['mp4','mov','avi','mkv','webm'].includes(ext)) return 'Videos';
    if (['csv','tsv','xls','xlsx','json','parquet'].includes(ext)) return 'Datasets';
    if (['inp','cae','odb','msh','cas','dat','nas','bdf'].includes(ext)) return 'Simulation Files';
    if (['doc','docx','ppt','pptx','md','rtf','txt'].includes(ext)) return 'Reports';
    if (['py','js','ts','cpp','c','h','hpp','java','m','mat','rb','go','rs'].includes(ext)) return 'Code';
    if (['ipynb'].includes(ext)) return 'Notebooks';
    if (['glb','gltf','fbx','dae','3ds'].includes(ext)) return '3D Scenes';
    return null;
  }
// --- helper: allocate a unique 12-digit numeric public_id ---
async function allocPublicProjectId() {
  // try a few times to avoid the (very unlikely) collision
  for (let attempt = 0; attempt < 5; attempt++) {
    let digits = '';
    for (let i = 0; i < 12; i++) digits += crypto.randomInt(0, 10).toString();
    const clash = await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [digits]);
    if (clash.length === 0) return digits;
  }
  throw new Error('Could not allocate a unique project public_id');
}

  function deriveTypesFromExtList(extCsv) {
    if (!extCsv) return [];
    const out = new Set();
    for (const e of String(extCsv).split(',').map(s => s.trim()).filter(Boolean)) {
      const t = extToType(e);
      if (t) out.add(t);
    }
    return Array.from(out);
  }
  // Parse a project id from an EngHub URL like ".../projects/123" or any trailing digits.
  function parseProjectIdFromUrl(u) {
    const m = String(u || '').match(/(\d+)(?:\D*)$/); // last run of digits
    return m ? Number(m[1]) : null;
  }

  // Parse projectId that can be 9 or "000-000-000-009"
  function parseProjectId(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const digits = String(v).replace(/[^\d]/g, ''); // strip dashes/spaces etc.
    return digits ? Number(digits) : null;
  }

function refProjectIdFrom(ref) {
  // prefer explicit id-like fields; fall back to “…/projects/123” at end of URL
  return (
    parseProjectId(
      ref?.projectId ?? ref?.projectID ?? ref?.project_id ??
      ref?.targetId ?? ref?.target_id ?? ref?.id
    ) ||
    parseProjectIdFromUrl(ref?.url)
  );
}


// Replace the whole resolveRefProjectIdSmart with this:
async function resolveRefProjectIdSmart(ref) {
  // Pull a candidate string from projectId/id/url and strip non-digits
  const raw = String(ref?.projectId ?? ref?.projectID ?? ref?.id ?? ref?.url ?? '');
  const digits = raw.replace(/[^\d]/g, '');

  // If it LOOKS like a 12-digit code, treat it as a public_id (NOT numeric)
  if (digits.length === 12) {
    const hit = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [digits]))[0];
    return hit ? hit.id : null;
  }

  // Otherwise, fall back to any numeric-like id or id at the end of the URL
  const id =
    parseProjectId(
      ref?.projectId ?? ref?.projectID ?? ref?.project_id ??
      ref?.targetId ?? ref?.target_id ?? ref?.id
    ) || parseProjectIdFromUrl(ref?.url);
  return id ?? null;
}



  function safeUsername(u) {
    return String(u || '').trim().replace(/[^a-z0-9._-]/gi, '_');
  }



  const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const issueToken = (user) =>
    jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

  // email sender (Nodemailer) – logs to console if not configured
  const mailer = (function makeMailer() {
    if (!process.env.EMAIL_HOST && !process.env.EMAIL_USER) {
      return {
        async send(to, subject, text) {
          console.log('📧 [DEV EMAIL] to:', to, '\nsubject:', subject, '\n', text);
        },
      };
    }
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: String(process.env.EMAIL_SECURE || 'false') === 'true',
      auth: process.env.EMAIL_USER ? { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } : undefined,
    });
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com';
    return {
      async send(to, subject, text) {
        await transporter.sendMail({ from, to, subject, text });
      },
    };
  })();

  // ---------- Migration helpers ----------
  async function ensureColumn(table, col, defSql) {
    const exists = await q(`
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1
    `, [table, col]);
    if (!exists.length) {
      console.log(`↪ ALTER TABLE ${table} ADD COLUMN ${col}`);
      await q(`ALTER TABLE ${table} ADD COLUMN ${defSql}`);
    }
  }
  async function ensureIndex(table, indexName, ddlSuffix) {
    const exists = await q(`
      SELECT 1 FROM information_schema.statistics
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ?
        AND INDEX_NAME   = ?
      LIMIT 1
    `, [table, indexName]);
    if (!exists.length) {
      console.log(`↪ ALTER TABLE ${table} ADD ${ddlSuffix}`);
      await q(`ALTER TABLE ${table} ADD ${ddlSuffix}`);
    }
  }

  
// ---------- Migrations ----------
async function migrate() {
  // USERS first
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(190) NOT NULL UNIQUE,
      password VARCHAR(190) NOT NULL,
      name VARCHAR(190) NOT NULL,
      avatar VARCHAR(300) DEFAULT '/images/avatar1.png',
      bio TEXT, skills JSON NULL, links JSON NULL,
      email VARCHAR(190) NULL,
      google_id VARCHAR(190) NULL,
      github_id VARCHAR(190) NULL,
      linkedin_id VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);



  // Ensure new cols on existing DBs
  await ensureColumn('users', 'email',       'email VARCHAR(190) NULL');
  await ensureColumn('users', 'google_id',   'google_id VARCHAR(190) NULL');
  await ensureColumn('users', 'github_id',   'github_id VARCHAR(190) NULL');
  await ensureColumn('users', 'linkedin_id', 'linkedin_id VARCHAR(190) NULL');
  await ensureColumn('users', 'links',       'links JSON NULL');

  // User indexes
  await ensureIndex('users', 'uniq_users_email',       'UNIQUE KEY uniq_users_email (email)');
  await ensureIndex('users', 'uniq_users_google_id',   'UNIQUE KEY uniq_users_google_id (google_id)');
  await ensureIndex('users', 'uniq_users_github_id',   'UNIQUE KEY uniq_users_github_id (github_id)');
  await ensureIndex('users', 'uniq_users_linkedin_id', 'UNIQUE KEY uniq_users_linkedin_id (linkedin_id)');

  // PROJECTS next
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects(
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      long_description TEXT NULL,
      category JSON NULL,
      image VARCHAR(300) DEFAULT '/images/placeholder.png',
      downloads INT NOT NULL DEFAULT 0,
      public_id CHAR(12) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_projects_owner FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // make sure public_id and types exist on older DBs
  await ensureColumn('projects', 'public_id', 'public_id CHAR(12) NULL');
  const typesExists = await q(`
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'projects'
      AND COLUMN_NAME  = 'types'
    LIMIT 1
  `);
  if (!typesExists.length) {
    await q(`ALTER TABLE projects ADD COLUMN types JSON NULL`);
  }

  // index for public_id + backfill any missing
  await ensureIndex('projects', 'uniq_projects_public_id', 'UNIQUE KEY uniq_projects_public_id (public_id)');
  const missingPub = await q('SELECT id FROM projects WHERE public_id IS NULL');
  for (const row of missingPub) {
    const pid = await allocPublicProjectId();
    await q('UPDATE projects SET public_id=? WHERE id=?', [pid, row.id]);
  }

  // OTHER TABLES
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments(
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      filename VARCHAR(255) NOT NULL,
      url VARCHAR(400) NOT NULL,
      size BIGINT NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_attachments_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments(
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_comments_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_comments_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS likes(
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      value TINYINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_like(project_id, user_id),
      CONSTRAINT fk_likes_project FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      CONSTRAINT fk_likes_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

await pool.query(`
  CREATE TABLE IF NOT EXISTS project_references(
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    ref_target CHAR(12) NOT NULL,         -- 'external' or 12-digit public_id
    ref_url VARCHAR(500) NULL,            -- NULL for internal, URL for external
    ref_desc VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ref_src FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_references_target (ref_target)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets(
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_resets_user (user_id),
      INDEX idx_password_resets_expires (expires_at),
      CONSTRAINT fk_password_resets_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

// --- Unified references migration (one-time, guarded) ---

// Only run the backfill if the old column still exists
const hasOldRefCol = await q(`
  SELECT 1
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'project_references'
    AND COLUMN_NAME  = 'ref_project_id'
  LIMIT 1
`);

if (hasOldRefCol.length) {
  // 1) Add the new column if missing (nullable during backfill)
  await ensureColumn('project_references', 'ref_target', 'ref_target CHAR(12) NULL');

  // 2) INTERNAL refs: copy target project's public_id into ref_target
  await q(`
    UPDATE project_references r
    JOIN projects p ON p.id = r.ref_project_id
    SET r.ref_target = p.public_id
    WHERE r.ref_project_id IS NOT NULL AND r.ref_target IS NULL
  `);

  // 3) EXTERNAL refs: mark as 'external'
  await q(`
    UPDATE project_references r
    SET r.ref_target = 'external'
    WHERE r.ref_target IS NULL AND r.ref_project_id IS NULL AND r.ref_url IS NOT NULL
  `);

  // 4) Drop old FK + column (ignore if already gone)
  try { await q('ALTER TABLE project_references DROP FOREIGN KEY fk_ref_dst'); } catch (_) {}
  try { await q('ALTER TABLE project_references DROP COLUMN ref_project_id'); } catch (_) {}

  // 5) Make ref_target NOT NULL after backfill
  await q('ALTER TABLE project_references MODIFY ref_target CHAR(12) NOT NULL');
} else {
  // Fresh/unified table path: ensure index exists (no-op if already there)
  await ensureIndex(
    'project_references',
    'idx_project_references_target',
    'INDEX idx_project_references_target (ref_target)'
  );
}

// --- normalize + de-dupe project_references BEFORE adding unique index ---

// 1) trim blanks to NULL so internal refs have ref_url=NULL
await q(`UPDATE project_references SET ref_url = NULLIF(TRIM(ref_url), '')`);

// 2) remove invalid "external" rows that have no URL
await q(`
  DELETE FROM project_references
  WHERE ref_target='external' AND (ref_url IS NULL OR ref_url='')
`);

// 3) de-dupe: keep the newest row per (project_id, ref_target, ref_url)
await q(`
  DELETE pr
  FROM project_references pr
  JOIN (
    SELECT MAX(id) AS keep_id, project_id, ref_target, ref_url
    FROM project_references
    GROUP BY project_id, ref_target, ref_url
    HAVING COUNT(*) > 1
  ) d
    ON pr.project_id = d.project_id
   AND pr.ref_target = d.ref_target
   AND ( (pr.ref_url IS NULL AND d.ref_url IS NULL) OR pr.ref_url = d.ref_url )
  WHERE pr.id <> d.keep_id
`);

// 4) now add the uniqueness guard (idempotent). This runs AFTER the table exists.
await ensureIndex(
  'project_references',
  'uniq_project_ref',
  'UNIQUE KEY uniq_project_ref (project_id, ref_target, ref_url)'
);

  console.log('✅ DB schema ensured');
}
await migrate();




// ---------- App ----------
const app = express();
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

const corsConfig = {
  origin: FRONTEND_URL,                 // http://localhost:3000
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Handle both: preflight and actual requests
app.use(cors(corsConfig));
app.options(/.*/, cors(corsConfig));

// Static & the rest…
app.use('/uploads', express.static(UPLOADS_ROOT, { etag: false, lastModified: false, maxAge: 0 }));
app.use(passport.initialize());


  app.get('/', (_req, res) => {
    res
      .type('text')
      .send('EngHub backend is running.\nTry: /api/projects, /api/signup, /api/login, /api/profile/:username');
  });

  app.get('/health', async (_req, res) => {
    try { const [ok] = await pool.query('SELECT 1 AS ok'); res.json({ ok: !!ok }); }
    catch (e) { res.status(500).json({ error: 'DB error', details: String(e.message) }); }
  });

  // ---------- Auth (secure) ----------
  // Signup: requires email, hashes password, returns JWT
  app.post('/api/signup', async (req, res) => {
    const { username, password, name, email } = req.body || {};
    if (!username || !password || !name || !email)
      return res.status(400).json({ error: 'username, password, name, email required' });
    try {
      const dup = await q('SELECT id FROM users WHERE username=? OR email=?', [username, email]);
      if (dup.length) return res.status(409).json({ error: 'Username or email already exists' });

      const hash = await bcrypt.hash(password, 12);
      await q('INSERT INTO users(username,password,name,email) VALUES (?,?,?,?)', [username, hash, name, email]);

      const user = (await q('SELECT id,username,name,avatar,email FROM users WHERE username=?', [username]))[0];
      const token = issueToken(user);

      const userDir = path.join(UPLOADS_ROOT, username);
      if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

      res.status(201).json({ success: true, token, user });
    } catch (e) {
      console.error('DB error (signup):', e);
      res.status(500).json({ error: 'DB error' });
    }
  });

  // Login: bcrypt + JWT
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    try {
      const user = (await q('SELECT id,username,name,avatar,email,password FROM users WHERE username=? OR email=?', [username, username]))[0];
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
      delete user.password;
      const token = issueToken(user);
      res.json({ success: true, token, user });
    } catch (e) {
      console.error('DB error (login):', e);
      res.status(500).json({ error: 'DB error' });
    }
  });

  // Middleware: verify JWT
function auth(req, res, next) {
  // Check header first
  const hdr = req.headers.authorization || '';
  let token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  
  // Also check query parameter (for downloads)
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) return res.status(401).json({ error: 'Please log in to access this resource' });
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

  app.get('/api/me', auth, async (req, res) => {
    const me = (await q('SELECT id,username,name,avatar,email,created_at FROM users WHERE id=?', [req.user.uid]))[0];
    res.json(me || null);
  });

  // Forgot password -> email link
  app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    try {
      const user = (await q('SELECT id,email FROM users WHERE email=?', [email]))[0];
      if (!user) return res.json({ ok: true }); // don't reveal existence

      const token = uuidv4();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h
      await q('DELETE FROM password_resets WHERE user_id=?', [user.id]);
      await q('INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES (?,?,?)',
        [user.id, tokenHash, expiresAt]);

      const link = `${FRONTEND_URL}/reset-password?uid=${user.id}&token=${token}`;
      await mailer.send(user.email, 'Password reset', `Reset your password: ${link}\nThis link expires in 1 hour.`);
      res.json({ ok: true });
    } catch (e) {
      console.error('forgot-password error:', e);
      res.status(500).json({ error: 'Failed to send reset email' });
    }
  });

  // Reset password (target for your frontend form)
  app.post('/api/reset-password', async (req, res) => {
    const { userId, token, password } = req.body || {};
    if (!userId || !token || !password) return res.status(400).json({ error: 'userId, token, password required' });
    try {
      const row = (await q('SELECT * FROM password_resets WHERE user_id=?', [userId]))[0];
      if (!row) return res.status(400).json({ error: 'Invalid link' });
      if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Link expired' });
      if (hashToken(token) !== row.token_hash) return res.status(400).json({ error: 'Invalid link' });

      const hash = await bcrypt.hash(password, 12);
      await q('UPDATE users SET password=? WHERE id=?', [hash, userId]);
      await q('DELETE FROM password_resets WHERE user_id=?', [userId]);
      res.json({ ok: true });
    } catch (e) {
      console.error('reset-password error:', e);
      res.status(500).json({ error: 'Reset failed' });
    }
  });

  // ---------- OAuth (optional; enabled if env vars exist) ----------
  function oauthSuccess(res, user) {
    const token = issueToken(user);
    res.redirect(`${FRONTEND_URL}/oauth-success#token=${encodeURIComponent(token)}`);
  }
  async function upsertSocialUser({ providerField, providerId, profile }) {
    // 1) by provider id
    let user = (await q(`SELECT id,username,name,avatar,email FROM users WHERE ${providerField}=?`, [providerId]))[0];
    if (user) return user;
    // 2) link to existing by email
    const email = profile.emails && profile.emails[0] && profile.emails[0].value ? profile.emails[0].value : null;
    if (email) {
      user = (await q('SELECT id,username,name,avatar,email FROM users WHERE email=?', [email]))[0];
      if (user) {
        await q(`UPDATE users SET ${providerField}=? WHERE id=?`, [providerId, user.id]);
        return user;
      }
    }
    // 3) create a new one
    const baseUsername = (profile.username || profile.displayName || `user${Date.now()}`).toLowerCase().replace(/\s+/g, '');
    let username = baseUsername.substring(0, 24) || `u${Date.now()}`;
    let n = 0;
    while ((await q('SELECT id FROM users WHERE username=?', [username])).length) {
      n += 1; username = `${baseUsername.substring(0, 20)}${n}`;
    }
    const name = profile.displayName || username;
    await q(`INSERT INTO users(username,password,name,email,${providerField}) VALUES (?,?,?,?,?)`,
      [username, await bcrypt.hash(uuidv4(), 10), name, email, providerId]);
    return (await q('SELECT id,username,name,avatar,email FROM users WHERE username=?', [username]))[0];
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback'
    }, async (_issuer, profile, done) => {
      try { done(null, await upsertSocialUser({ providerField: 'google_id', providerId: profile.id, profile })); }
      catch (e) { done(e); }
    }));
    app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
    app.get('/api/auth/google/callback',
      passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login?oauth=failed` }),
      (req, res) => oauthSuccess(res, req.user));
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: '/api/auth/github/callback',
      scope: ['user:email']
    }, async (_accessToken, _refreshToken, profile, done) => {
      try { done(null, await upsertSocialUser({ providerField: 'github_id', providerId: profile.id, profile })); }
      catch (e) { done(e); }
    }));
    app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
    app.get('/api/auth/github/callback',
      passport.authenticate('github', { session: false, failureRedirect: `${FRONTEND_URL}/login?oauth=failed` }),
      (req, res) => oauthSuccess(res, req.user));
  }

  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    passport.use(new LinkedInStrategy({
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: '/api/auth/linkedin/callback',
      scope: ['r_liteprofile', 'r_emailaddress'],
    }, async (_accessToken, _refreshToken, profile, done) => {
      try { done(null, await upsertSocialUser({ providerField: 'linkedin_id', providerId: profile.id, profile })); }
      catch (e) { done(e); }
    }));
    app.get('/api/auth/linkedin', passport.authenticate('linkedin'));
    app.get('/api/auth/linkedin/callback',
      passport.authenticate('linkedin', { session: false, failureRedirect: `${FRONTEND_URL}/login?oauth=failed` }),
      (req, res) => oauthSuccess(res, req.user));
  }

  // ---------- Profile ----------
  // GET profile
// GET profile
// GET profile
app.get('/api/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // base user
    const u = (await q(
      'SELECT id, username, name, avatar, bio, skills, links FROM users WHERE username=? LIMIT 1',
      [username]
    ))[0];
    if (!u) return res.status(404).json({ error: 'User not found' });




const userId = u.id;
const ref_to_projects = await q(`
  SELECT
    dst.public_id,
    dst.title,
    dst.image,
    ou.username AS owner_username,
    MAX(r.id) AS last_ref_id
  FROM project_references r
  JOIN projects src ON src.id = r.project_id
  JOIN projects dst ON dst.public_id = r.ref_target
  JOIN users   ou  ON ou.id = dst.owner_id
  WHERE src.owner_id = ? AND r.ref_target <> 'external'
  GROUP BY dst.public_id, dst.title, dst.image, ou.username
  ORDER BY last_ref_id DESC
  LIMIT 100
`, [userId]);

// Projects that referenced THIS user's projects (incoming)
const ref_by_projects = await q(`
  SELECT
    src.public_id,
    src.title,
    src.image,
    ou.username AS owner_username,
    MAX(r.id) AS last_ref_id
  FROM project_references r
  JOIN projects dst ON dst.public_id = r.ref_target
  JOIN projects src ON src.id = r.project_id
  JOIN users   ou  ON ou.id = src.owner_id
  WHERE dst.owner_id = ? AND r.ref_target <> 'external'
  GROUP BY src.public_id, src.title, src.image, ou.username
  ORDER BY last_ref_id DESC
  LIMIT 100
`, [userId]);

// External links this user referenced
const ref_to_externals = await q(`
  SELECT
    r.ref_url,
    NULLIF(TRIM(r.ref_desc), '') AS ref_desc,
    MAX(r.id) AS last_ref_id
  FROM project_references r
  JOIN projects src ON src.id = r.project_id
  WHERE src.owner_id = ?
    AND r.ref_target = 'external'
    AND r.ref_url IS NOT NULL AND r.ref_url <> ''
  GROUP BY r.ref_url, ref_desc
  ORDER BY last_ref_id DESC
  LIMIT 100
`, [userId]);






res.json({
  ...u,
  skills: safeParseJSON(u.skills, []),
  links:  safeParseJSON(u.links,  []),

  referenced_to_projects: ref_to_projects,
  referenced_by_projects: ref_by_projects,
  referenced_to_externals: ref_to_externals,

  referenced_to_count: ref_to_projects.length + ref_to_externals.length,
  referenced_by_count: ref_by_projects.length,

  // keep legacy arrays empty so old UIs don’t break
  referenced_to_users: [],
  referenced_by_users: [],
});


  } catch (e) {
    console.error('DB error (/api/profile/:username):', e);
    res.status(500).json({ error: 'DB error', detail: e.sqlMessage || e.message });
  }
});



  // UPDATE profile (POST endpoint for compatibility with frontend)
app.post('/api/profile/:username', auth, async (req, res) => {
  const { username } = req.params;
  const { name, bio, avatar, skills, links } = req.body || {};
  
  try {
    const user = (await q('SELECT id FROM users WHERE username=?', [username]))[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
        if (!req.user || req.user.username !== username) {
      return res.status(403).json({ error: 'You can only edit your own profile' });
        }
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(bio);
    }
    if (avatar !== undefined) {
      updates.push('avatar = ?');
      params.push(avatar);
    }
    if (skills !== undefined) {
      updates.push('skills = ?');
      // Ensure skills is properly stringified
      params.push(Array.isArray(skills) ? JSON.stringify(skills) : skills);
    }
    if (links !== undefined) {
      updates.push('links = ?');
      // Ensure links is properly stringified
      params.push(Array.isArray(links) ? JSON.stringify(links) : links);
    }
      
      if (updates.length === 0) {
        // Nothing to update, return current user
        const unchanged = (await q('SELECT id,username,name,avatar,bio,skills,links FROM users WHERE username=?', [username]))[0];
        return res.json(unchanged);
      }
      
      // Perform the update
      params.push(username);
      await q(`UPDATE users SET ${updates.join(', ')} WHERE username = ?`, params);
      
      // Return updated user
      const updated = (await q('SELECT id,username,name,avatar,bio,skills,links FROM users WHERE username=?', [username]))[0];
      res.json(updated);
      
    } catch (e) {
      console.error('Profile update error:', e);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  });

  // ---------- Typeahead ----------
  app.get('/api/users/search', async (req, res) => {
    try {
      const term = (req.query.q || '').trim();
      if (!term) return res.json([]);
      const rows = await q(
        `SELECT username, name, avatar
         FROM users
         WHERE username LIKE ? OR name LIKE ?
         ORDER BY username ASC
         LIMIT 10`,
        [`%${term}%`, `%${term}%`]
      );
      res.json(rows);
    } catch (e) {
      console.error('DB error (user search):', e.message);
      res.status(500).json({ error: 'DB error' });
    }
  });

  // Combined search: projects + users
  app.get('/api/search', async (req, res) => {
    try {
      const term = (req.query.q || '').trim();
      if (!term) return res.json({ projects: [], users: [] });

      const projects = await q(`
        SELECT
          p.*,
          u.username AS owner_username,
          COALESCE((SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id),0) AS comments_count,
          COALESCE((SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.value=1),0) AS likes_count,
          COALESCE((SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.value=-1),0) AS dislikes_count,
          a.ext_list
        FROM projects p
        JOIN users u ON u.id=p.owner_id
        LEFT JOIN (
          SELECT project_id,
                 GROUP_CONCAT(LOWER(SUBSTRING_INDEX(filename, '.', -1)) SEPARATOR ',') AS ext_list
          FROM attachments
          GROUP BY project_id
        ) a ON a.project_id = p.id
        WHERE p.title LIKE ? OR p.description LIKE ?
        ORDER BY p.created_at DESC
        LIMIT 50`,
        [`%${term}%`, `%${term}%`]
      );

      const users = await q(
        `SELECT username, name, avatar
         FROM users
         WHERE username LIKE ? OR name LIKE ?
         ORDER BY username ASC
         LIMIT 10`,
        [`%${term}%`, `%${term}%`]
      );

      const shaped = projects.map(r => {
        const authorTypes = safeParseJSON(r.types, []);
        const derived = deriveTypesFromExtList(r.ext_list);
        const file_types = Array.from(new Set([...(Array.isArray(authorTypes) ? authorTypes : []), ...derived]));
        return { ...r, category: safeParseJSON(r.category, []), types: authorTypes, file_types };
      });
      res.json({ projects: shaped, users });
    } catch (e) {
      console.error('DB error (combined search):', e.message);
      res.status(500).json({ error: 'DB error' });
    }
  });

  // ---------- Uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // auth runs before upload.single → req.user is available
      const username = safeUsername(req.user && req.user.username);
      if (!username) return cb(new Error('auth required'));

      const dir = path.join(UPLOADS_ROOT, username);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) { cb(e); }
  },

    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  });
  const upload = multer({ storage });

  app.post('/api/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const safeU = safeUsername(req.user.username);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const url  = `/uploads/${encodeURIComponent(safeU)}/${req.file.filename}`;
    const size = req.file.size || 0;

    // NEW: pick up optional projectId from body or query
    const rawProject = req.body?.projectId ?? req.query?.projectId;
    const code = String(rawProject || '').replace(/\D/g, '');

    if (code.length === 12) {
      const row = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [code]))[0];
      if (row?.id) {
        await q(
          'INSERT INTO attachments(project_id,filename,url,size) VALUES (?,?,?,?)',
          [row.id, req.file.filename, url, size]
        );
      }
    }

    res.status(201).json({ filename: req.file.filename, url, size });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});


  // ---------- Projects ----------
  // Create
// ---------- Projects ----------
// Create
app.post('/api/projects', auth, async (req, res) => {
  const { title, description, longDescription, category, types, image, references } = req.body || {};
  if (!title || !description) {
    return res.status(400).json({ error: 'title and description required' });
  }
  try {
    const owner = (await q('SELECT id FROM users WHERE id=?', [req.user.uid]))[0];
    if (!owner) return res.status(404).json({ error: 'Owner not found' });

    // 1) insert the project row
    const r = await q(
      'INSERT INTO projects(owner_id,title,description,long_description,category,types,image) VALUES (?,?,?,?,?,?,?)',
      [
        owner.id,
        title,
        description,
        longDescription || null,
        category ? JSON.stringify(category) : null,
        Array.isArray(types) ? JSON.stringify(types) : null,
        image || '/images/placeholder.png'
      ]
    );
    const newId = r.insertId;

    // 2) allocate and save a unique 12-digit random public_id
    const pubid = await allocPublicProjectId();
    await q('UPDATE projects SET public_id=? WHERE id=?', [pubid, newId]);

    // 3) persist references (internal/external)
    // 3) persist references (internal/external) — de-dupe + idempotent
if (Array.isArray(references)) {
  const seenInt = new Set();
  const seenExt = new Set();

  for (const ref of references) {
    const desc = (ref?.desc || '').trim().slice(0, 255) || null;

    // Prefer internal 12-digit id if present
    const raw = String(ref?.projectId || '').replace(/\D/g, '');
    if (raw.length === 12) {
      if (!seenInt.has(raw)) {
        seenInt.add(raw);
await q(`
  INSERT INTO project_references(project_id, ref_target, ref_url, ref_desc)
  VALUES (?,?,?,?)
  ON DUPLICATE KEY UPDATE ref_desc=VALUES(ref_desc)
`, [newId, raw, null, desc]);
      }
      continue;
    }

    // External needs URL
    const url = (ref?.url || '').trim();
    if (url) {
      const key = url.toLowerCase() + '|' + (desc || '');
      if (!seenExt.has(key)) {
        seenExt.add(key);
await q(`
  INSERT INTO project_references(project_id, ref_target, ref_url, ref_desc)
  VALUES (?,?,?,?)
  ON DUPLICATE KEY UPDATE ref_desc=VALUES(ref_desc)
`, [newId, 'external', url, desc]);
      }
    }
  }
}


    const inserted = (await q('SELECT * FROM projects WHERE id=?', [newId]))[0];
    res.status(201).json(inserted);
  } catch (e) {
    console.error('Create project error:', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});


  // Update (owner only)
app.put('/api/projects/:id', auth, async (req, res) => {
  // Resolve 12-digit public_id (with/without dashes) → numeric id
const code = String(req.params.id || '').replace(/\D/g, '');
if (code.length !== 12) return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });
const row = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [code]))[0];
if (!row) return res.status(404).json({ error: 'Project not found' });
const id = row.id;


  const { title, description, longDescription, category, image, types } = req.body || {};

  try {
    const proj = (await q(
      'SELECT p.id, p.owner_id, u.username AS owner_username FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=?',
      [id]
    ))[0];
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    if (proj.owner_id !== req.user.uid) return res.status(403).json({ error: 'Only the owner can edit this project' });


    const sets = [];
    const params = [];
    if (title !== undefined) { sets.push('title=?'); params.push(title); }
    if (description !== undefined) { sets.push('description=?'); params.push(description); }
    if (longDescription !== undefined) { sets.push('long_description=?'); params.push(longDescription); }
    if (category !== undefined) { sets.push('category=?'); params.push(category ? JSON.stringify(category) : null); }
    if (image !== undefined) { sets.push('image=?'); params.push(image); }
    if (types !== undefined) { sets.push('types=?'); params.push(Array.isArray(types) ? JSON.stringify(types) : null); }

    // --- references replacement goes HERE (before the early return) ---
// ... after handling title/description/etc. in sets/params:

// --- Handle references update (replace placeholder) ---
              // --- Handle references update (unified 'ref_target') ---
// --- Handle references update (unified 'ref_target') ---
// --- Handle references update (replace-all semantics) ---
if (Object.prototype.hasOwnProperty.call(req.body, 'references')) {
  // Drop all old refs for this project, we’ll re-insert the new list
  await q('DELETE FROM project_references WHERE project_id=?', [id]);

  if (Array.isArray(req.body.references)) {
    const seenInt = new Set();  // de-dupe internal by 12d code
    const seenExt = new Set();  // de-dupe external by url+desc

    for (const ref of req.body.references) {
      const desc = (ref?.desc || '').trim().slice(0, 255) || null;

      // internal (12-digit public_id) wins over URL
      const raw = String(ref?.projectId || '').replace(/\D/g, '');
      if (raw && raw.length === 12) {
        if (!seenInt.has(raw)) {
          seenInt.add(raw);
          await q(
            'INSERT INTO project_references(project_id, ref_target, ref_url, ref_desc) VALUES (?,?,?,?)',
            [id, raw, null, desc]
          );
        }
        continue;
      }

      // external (must have URL)
      const url = (ref?.url || '').trim();
      if (url) {
        const key = url.toLowerCase() + '|' + (desc || '');
        if (!seenExt.has(key)) {
          seenExt.add(key);
          await q(
            'INSERT INTO project_references(project_id, ref_target, ref_url, ref_desc) VALUES (?,?,?,?)',
            [id, 'external', url, desc]
          );
        }
      }
    }
  }
}


// --- end references update ---

// --- end references update ---


              // --- end references update ---

              if (!sets.length) {
                // No other fields changed; return the project as-is
                const unchanged = (await q('SELECT * FROM projects WHERE id=?', [id]))[0];
                return res.json(unchanged);
              }


    await q(`UPDATE projects SET ${sets.join(', ')} WHERE id=?`, [...params, id]);
    const updated = (await q('SELECT * FROM projects WHERE id=?', [id]))[0];
    res.json(updated);
  } catch (e) {
    console.error('DB error (update project):', e.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// DELETE (owner only)
app.delete('/api/projects/:id', auth, async (req, res) => {
  try {
    // Resolve dashed/undashed 12-digit public id → numeric id
    const code = String(req.params.id || '').replace(/\D/g, '');
    if (code.length !== 12) return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });
    const row = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [code]))[0];
    if (!row) return res.status(404).json({ error: 'Project not found' });
    const id = row.id;

    // Confirm ownership
    const info = (await q(
      'SELECT p.id, u.username AS owner_username FROM projects p JOIN users u ON u.id=p.owner_id WHERE p.id=?',
      [id]
    ))[0];
    if (!info) return res.status(404).json({ error: 'Project not found' });
    if (!req.user || req.user.username !== info.owner_username) {
      return res.status(403).json({ error: 'Only the owner can delete this project' });
    }

    // Cascade removes attachments/comments/likes/project_references (per schema FKs)
    await q('DELETE FROM projects WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete project error:', e);
    res.status(500).json({ error: 'DB error' });
  }
});



  // List with filters: ?owner=USERNAME&q=keyword&limit=10
  app.get('/api/projects', async (req, res) => {
    try {
      const { owner, q: qq, limit } = req.query;
      const params = [];
      let sql = `
        SELECT
          p.*,
          u.username AS owner_username,
          COALESCE((SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id),0) AS comments_count,
          COALESCE((SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.value=1),0) AS likes_count,
          COALESCE((SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.value=-1),0) AS dislikes_count,
          a.ext_list
        FROM projects p
        JOIN users u ON u.id=p.owner_id
        LEFT JOIN (
          SELECT project_id,
                 GROUP_CONCAT(LOWER(SUBSTRING_INDEX(filename, '.', -1)) SEPARATOR ',') AS ext_list
          FROM attachments
          GROUP BY project_id
        ) a ON a.project_id = p.id
      `;
      const where = [];
      if (owner) { where.push('u.username=?'); params.push(owner); }
      if (qq) { where.push('(p.title LIKE ? OR p.description LIKE ?)'); params.push(`%${qq}%`, `%${qq}%`); }
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      sql += ' ORDER BY p.created_at DESC';
      if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }

      const rows = await q(sql, params);
      const shaped = rows.map(r => {
        const authorTypes = safeParseJSON(r.types, []);
        const derived = deriveTypesFromExtList(r.ext_list);
        const file_types = Array.from(new Set([...(Array.isArray(authorTypes) ? authorTypes : []), ...derived]));
        return { ...r, category: safeParseJSON(r.category, []), types: authorTypes, file_types };
      });
      res.json(shaped);
    } catch (e) {
      console.error('DB error (list projects):', e.message);
      res.status(500).json({ error: 'DB error' });
    }
  });

// Detail: one project with attachments + comments
app.get('/api/projects/:id', async (req, res) => {
  try {
// Only accept 12-digit project id (with or without dashes)
const raw = String(req.params.id || '').trim();
const digitsOnly = raw.replace(/\D/g, '');
if (digitsOnly.length !== 12) {
  return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });
}

const project = (await q(`
  SELECT
    p.*,
    u.username AS owner_username,
    COALESCE((SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id),0) AS comments_count,
    COALESCE((SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.value=1),0) AS likes_count,
    COALESCE((SELECT COUNT(*) FROM likes l WHERE l.project_id=p.id AND l.value=-1),0) AS dislikes_count
  FROM projects p
  JOIN users u ON u.id = p.owner_id
  WHERE p.public_id=?
  LIMIT 1
`, [digitsOnly]))[0];


    if (!project) return res.status(404).json({ error: 'Project not found' });

    // From here on we use the real numeric primary key for joins
    const id = project.id;

const attachments = (await q(
  'SELECT id, filename, url, size, uploaded_at FROM attachments WHERE project_id=? ORDER BY id ASC',
  [id]
)).map(a => ({
  ...a,
  // lets the frontend do: <a href={`${API_BASE}${a.download_url}?token=...`}>Download</a>
  download_url: `/api/attachments/${a.id}/download`,
}));


    const comments = await q(`
      SELECT c.id, c.text, c.created_at, u.username, u.name, u.avatar
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.project_id = ?
      ORDER BY c.created_at ASC
    `, [id]);

    // references this project makes (internal projects and/or external URLs)
    // references this project makes (internal projects and/or external URLs)
    const refs_to = await q(`
      SELECT
        r.id,
        r.ref_url,
        r.ref_desc,
        dst.id          AS dst_id,
        dst.public_id   AS dst_public_id,
        dst.title       AS dst_title,
        uu.username     AS dst_owner_username
      FROM project_references r
      LEFT JOIN projects dst ON dst.public_id = r.ref_target
      LEFT JOIN users uu     ON uu.id = dst.owner_id
      WHERE r.project_id = ?
      ORDER BY r.id DESC
    `, [id]);




    // projects that reference this project (incoming)
    // projects that reference this project (incoming, internal only)
    const refs_by = await q(`
      SELECT
        r.id,
        src.id          AS src_id,
        src.public_id   AS src_public_id,
        src.title       AS src_title,
        uu.username     AS src_owner_username
      FROM project_references r
      JOIN projects src ON src.id = r.project_id
      JOIN users uu     ON uu.id = src.owner_id
      WHERE r.ref_target = ?
      ORDER BY r.id DESC
    `, [project.public_id]);




    const extCsv = attachments.map(a => String(a.filename || '').split('.').pop().toLowerCase()).join(',');
    const derivedTypes = deriveTypesFromExtList(extCsv);
    const authorTypes = safeParseJSON(project.types, []);
    const file_types = Array.from(new Set([...(Array.isArray(authorTypes) ? authorTypes : []), ...derivedTypes]));

    res.json({
      ...project,
      category: safeParseJSON(project.category, []),
      types: authorTypes,
      file_types,
      attachments,
      comments,
      references_to: refs_to,
      references_by: refs_by
    });
    } catch (e) {
      console.error('DB error (project detail):', e);
      res.status(500).json({
        error: 'DB error',
        details: process.env.NODE_ENV === 'production' ? undefined : String(e.message || e)
      });
    }
  }); 


// People-network edges (users) around a single project
app.get('/api/projects/:id/ref-graph', async (req, res) => {
  try {
    // 12-digit public id (allow dashed)
    const code = String(req.params.id || '').replace(/\D/g, '');
    if (code.length !== 12) return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });

    // Project + owner
    const project = (await q(`
      SELECT p.id, p.public_id, u.username AS owner_username,
             COALESCE(NULLIF(u.name,''), u.username) AS owner_label
      FROM projects p JOIN users u ON u.id = p.owner_id
      WHERE p.public_id=? LIMIT 1
    `, [code]))[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // OUTGOING internal refs this project makes → (srcOwner -> dstOwner)
    const outgoing = await q(`
      SELECT su.username AS src_username, COALESCE(NULLIF(su.name,''), su.username) AS src_label,
             du.username AS dst_username, COALESCE(NULLIF(du.name,''), du.username) AS dst_label
      FROM project_references r
      JOIN projects src ON src.id = r.project_id
      JOIN users    su  ON su.id  = src.owner_id
      JOIN projects dst ON dst.public_id = r.ref_target
      JOIN users    du  ON du.id  = dst.owner_id
      WHERE r.project_id = ? AND r.ref_target <> 'external'
    `, [project.id]);

    // INCOMING internal refs pointing at this project → (srcOwner -> thisOwner)
    const incoming = await q(`
      SELECT su.username AS src_username, COALESCE(NULLIF(su.name,''), su.username) AS src_label
      FROM project_references r
      JOIN projects src ON src.id = r.project_id
      JOIN users    su  ON su.id  = src.owner_id
      WHERE r.ref_target = ?
    `, [project.public_id]);

    // Build node & edge sets (aggregate counts)
    const nodeMap = new Map();
    const edgeMap = new Map();

    function addNode(id, label) { if (!nodeMap.has(id)) nodeMap.set(id, { id, label }); }
    function addEdge(a, b) {
      const k = `${a}>${b}`;
      edgeMap.set(k, (edgeMap.get(k) || 0) + 1);
    }

    outgoing.forEach(e => {
      addNode(e.src_username, e.src_label);
      addNode(e.dst_username, e.dst_label);
      addEdge(e.src_username, e.dst_username);
    });

    incoming.forEach(e => {
      addNode(e.src_username, e.src_label);
      addNode(project.owner_username, project.owner_label);
      addEdge(e.src_username, project.owner_username);
    });

    const nodes = [...nodeMap.values()];
    const edges = [...edgeMap.entries()].map(([k, count]) => {
      const [source, target] = k.split('>');
      return { source, target, count };
    });

    res.json({ nodes, edges, highlight: project.owner_username });
  } catch (err) {
    console.error('ref-graph error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});


  // Zip all attachments
// Zip all attachments (LOGIN REQUIRED)
app.get('/api/projects/:id/download-all', auth, async (req, res) => {
  // NEW: resolve 12-digit public_id (with/without dashes) → numeric id
const code = String(req.params.id || '').replace(/\D/g, '');
if (code.length !== 12) return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });
const row = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [code]))[0];
if (!row) return res.status(404).json({ error: 'Project not found' });
const id = row.id;

  try {
    const attachments = await q('SELECT filename, url FROM attachments WHERE project_id=? ORDER BY id ASC', [id]);
    if (!attachments.length) return res.status(404).json({ error: 'No files to download' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="project-${id}-attachments.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 }});
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    for (const att of attachments) {
      // /uploads/<username>/<filename>
      const parts = (att.url || '').split('/').filter(Boolean);
      const username = decodeURIComponent(parts[1] || '');
      const rel = decodeURIComponent(parts.slice(2).join('/'));
      const abs = path.join(UPLOADS_ROOT, username, rel);
      if (fs.existsSync(abs)) archive.file(abs, { name: rel });
    }
    archive.finalize();
  } catch (e) {
    console.error('download-all error:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Zip failed' });
  }
});
// NEW: single attachment download (requires login)
// Place this RIGHT UNDER the /api/projects/:nid/download-all endpoint.
app.get('/api/attachments/:attId/download', auth, async (req, res) => {
  try {
    const attId = Number(req.params.attId);
    if (!Number.isInteger(attId)) {
      return res.status(400).json({ error: 'Invalid attachment id' });
    }

    // Fetch attachment record
    const row = (await q(
      'SELECT filename, url FROM attachments WHERE id=? LIMIT 1',
      [attId]
    ))[0];
    if (!row) return res.status(404).json({ error: 'File not found' });

    // row.url is like "/uploads/<username>/<file>"
    const parts = String(row.url || '').split('/').filter(Boolean);
    const username = decodeURIComponent(parts[1] || '');
    const relPath  = decodeURIComponent(parts.slice(2).join('/'));
    const absPath  = path.join(UPLOADS_ROOT, username, relPath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: 'File missing on server' });
    }

    // Download with original filename
    res.download(absPath, row.filename);
  } catch (e) {
    console.error('single file download error:', e);
    res.status(500).json({ error: 'Download failed' });
  }
});

// NEW: delete a single attachment (owner only)
app.delete('/api/attachments/:id', auth, async (req, res) => {
  try {
    const attId = Number(req.params.id);
    if (!Number.isInteger(attId)) return res.status(400).json({ error: 'Invalid attachment id' });

    // Fetch attachment + check project ownership
    const row = (await q(`
      SELECT a.id, a.url, p.owner_id
      FROM attachments a
      JOIN projects p ON p.id = a.project_id
      WHERE a.id = ? LIMIT 1
    `, [attId]))[0];

    if (!row) return res.status(404).json({ error: 'Attachment not found' });
    if (!req.user || req.user.uid !== row.owner_id) {
      return res.status(403).json({ error: 'Only the owner can delete files' });
    }

    // Remove the file on disk (ignore if the file is already gone)
    try {
      const rel = String(row.url || '').replace(/^\/uploads\//, '');
      const abs = path.join(UPLOADS_ROOT, rel);
      await fs.promises.unlink(abs);
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('unlink failed:', e.message);
    }

    await q('DELETE FROM attachments WHERE id=?', [attId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete attachment error:', e);
    res.status(500).json({ error: 'DB error' });
  }
});



  // Comment
  app.post('/api/projects/:id/comments', auth, async (req, res) => {
    // NEW: resolve 12-digit public_id (with/without dashes) → numeric id
const code = String(req.params.id || '').replace(/\D/g, '');
if (code.length !== 12) return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });
const row = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [code]))[0];
if (!row) return res.status(404).json({ error: 'Project not found' });
const id = row.id;

    const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const r = await q('INSERT INTO comments(project_id,user_id,text) VALUES (?,?,?)', [id, req.user.uid, text]);
      const created = (await q(`
        SELECT c.id,c.text,c.created_at,u.username,u.name,u.avatar
        FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?`, [r.insertId]))[0];
      res.status(201).json(created);
    } catch (e) {
      console.error('DB error (comment):', e.message);
      res.status(500).json({ error: 'DB error' });
    }
  });

  // Like / Dislike
  app.post('/api/projects/:id/like', auth, async (req, res) => {
    // NEW: resolve 12-digit public_id (with/without dashes) → numeric id
const code = String(req.params.id || '').replace(/\D/g, '');
if (code.length !== 12) return res.status(400).json({ error: 'Invalid project id format; expected 12-digit id' });
const row = (await q('SELECT id FROM projects WHERE public_id=? LIMIT 1', [code]))[0];
if (!row) return res.status(404).json({ error: 'Project not found' });
const id = row.id;

  const { value } = req.body || {};
  const v = Number(value);
  if (![1, -1].includes(v)) {
    return res.status(400).json({ error: 'value (1|-1) required' });
  }
  try {
    await q(`
      INSERT INTO likes(project_id,user_id,value) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE value=VALUES(value), created_at=CURRENT_TIMESTAMP
    `, [id, req.user.uid, v]);

      const counts = (await q(`
        SELECT COALESCE(SUM(value=1),0) AS likes_count,
               COALESCE(SUM(value=-1),0) AS dislikes_count
        FROM likes WHERE project_id=?`, [id]))[0];

      res.json(counts);
    } catch (e) {
      console.error('DB error (like):', e.message);
      res.status(500).json({ error: 'DB error' });
    }
  });

  // --------- DEV SEED (simple) ----------
  app.post('/api/dev/seed', async (req, res) => {
    try {
      const username = (req.query.username || 'demo').toString();
      const name = username[0].toUpperCase() + username.slice(1);
      const hash = await bcrypt.hash('test', 10);
      await q('INSERT IGNORE INTO users(username,password,name,email) VALUES (?,?,?,?)',
        [username, hash, name, `${username}@example.com`]);
      const u = (await q('SELECT id FROM users WHERE username=?', [username]))[0];
      const p1 = await q('INSERT INTO projects(owner_id,title,description,category) VALUES (?,?,?,?)',
        [u.id, 'Gearbox Simulation', 'OpenFOAM simulation of a spur-gear oil flow.', JSON.stringify(['Mechanical'])]);
      const p2 = await q('INSERT INTO projects(owner_id,title,description,category) VALUES (?,?,?,?)',
        [u.id, 'Beam FEA', 'Cantilever beam static stress analysis.', JSON.stringify(['Mechanical'])]);
      res.json({ ok: true, projectIds: [p1.insertId, p2.insertId] });
    } catch (e) {
      console.error('Seed error:', e.message);
      res.status(500).json({ error: 'Seed failed', details: String(e.message) });
    }
  });

  // DEV-ONLY: rich seed
  app.post('/api/dev/seed-full', async (req, res) => {
    try {
      async function ensureUser(username, password, name, avatar = '/images/avatar1.png') {
        const hash = await bcrypt.hash(password, 10);
        await q('INSERT IGNORE INTO users (username,password,name,avatar,email) VALUES (?,?,?,?,?)',
          [username, hash, name, avatar, `${username}@example.com`]);
        const u = (await q('SELECT id,username FROM users WHERE username=?', [username]))[0];
        const dir = path.join(UPLOADS_ROOT, username);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return u;
      }

      async function makeAttachment(ownerUsername, projectId, filename, content) {
        const dir = path.join(UPLOADS_ROOT, ownerUsername);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, content);
        const size = Buffer.byteLength(content);
        const url = `/uploads/${encodeURIComponent(ownerUsername)}/${filename}`;
        await q('INSERT INTO attachments (project_id, filename, url, size) VALUES (?,?,?,?)',
          [projectId, filename, url, size]);
        return { filename, url, size };
      }

      async function makeProject(owner, title, description, longDesc, category, image = '/images/placeholder.png', downloads = 0) {
        const r = await q(
          'INSERT INTO projects (owner_id, title, description, long_description, category, image, downloads) VALUES (?,?,?,?,?,?,?)',
          [owner.id, title, description, longDesc, JSON.stringify(category), image, downloads]
        );
        return (await q('SELECT * FROM projects WHERE id=?', [r.insertId]))[0];
      }

      const alice = await ensureUser('alice', 'test123', 'Alice Johnson');
      const bob   = await ensureUser('bob',   'test123', 'Bob Lee');
      const carol = await ensureUser('carol', 'test123', 'Carol Chen');

      const p1 = await makeProject(
        alice,
        'Wind Turbine Aerodynamics',
        'CFD of a horizontal-axis wind turbine under varying wind conditions. Includes CAD model, mesh, and post-processing results.',
        'OpenFOAM setup: SST k-ω turbulence, MRF zone for rotor, y+≈30 walls. Mesh generated with snappyHexMesh. Post-processing in ParaView.',
        ['Aero', 'CFD'],
        '/images/placeholder.png',
        42
      );

      const p2 = await makeProject(
        bob,
        'Bridge Structural Health Monitoring',
        'Data-driven monitoring of bridges using vibration sensors and FE modelling. Raw sensor data and Jupyter notebooks included.',
        'Accelerometers @200Hz on mid-span and quarter points. Modal analysis via SSI. FE model updated with inverse calibration.',
        ['Civil', 'Sensors'],
        '/images/placeholder.png',
        17
      );

      const p3 = await makeProject(
        carol,
        'Smart Grid Voltage Optimization',
        'Optimal tap-changer settings and VAR dispatch using AC-OPF to minimize losses and keep voltages within limits.',
        'Pyomo + IPOPT on IEEE-57. Time-coupled constraints added for tap-changers with ramp limits.',
        ['Electrical', 'Optimization'],
        '/images/placeholder.png',
        5
      );

      const p4 = await makeProject(
        alice,
        '3D Printed Drone Frame',
        'Lightweight quadcopter frame designed for FDM printing. STL and renders provided.',
        'PETG 0.2mm, 4 perimeters, 30% gyroid. Modal check in FreeCAD + FEM WB. Arms tuned to avoid motor resonance.',
        ['Mechanical', 'CAD'],
        '/images/placeholder.png',
        8
      );

      await makeAttachment('alice', p1.id, 'turbine_model.stl', 'SEED: fake STL content for demo\n');
      await makeAttachment('alice', p1.id, 'simulation_case.zip', 'SEED: fake zip bytes…\n');

      await makeAttachment('bob', p2.id, 'bridge_data.csv', 'time,accel\n0,0.01\n0.005,0.013\n');
      await makeAttachment('bob', p2.id, 'analysis_notebook.ipynb', '{ "cells": [], "metadata": {}, "nbformat": 4, "nbformat_minor": 5 }');

      await makeAttachment('carol', p3.id, 'grid_data.csv', 'bus,vmag\n1,1.02\n2,0.98\n');

      await makeAttachment('alice', p4.id, 'frame.stl', 'SEED: drone frame STL\n');
      await makeAttachment('alice', p4.id, 'render.png', 'PNG_BYTES_PLACEHOLDER');

      async function like(projectId, username, value) {
        const u = (await q('SELECT id FROM users WHERE username=?', [username]))[0];
        await q(`
          INSERT INTO likes (project_id, user_id, value) VALUES (?,?,?)
          ON DUPLICATE KEY UPDATE value=VALUES(value), created_at=CURRENT_TIMESTAMP
        `, [projectId, u.id, value]);
      }

      await like(p1.id, 'bob', 1);
      await like(p1.id, 'carol', 1);
      await like(p2.id, 'alice', 1);
      await like(p2.id, 'carol', -1);
      await like(p3.id, 'alice', 1);
      await like(p3.id, 'bob', 1);
      await like(p4.id, 'bob', -1);
      await like(p4.id, 'carol', 1);

      async function comment(projectId, username, text) {
        const u = (await q('SELECT id FROM users WHERE username=?', [username]))[0];
        await q('INSERT INTO comments (project_id, user_id, text) VALUES (?,?,?)', [projectId, u.id, text]);
      }
      await comment(p1.id, 'bob',   'Great mesh quality! Do you have y+ plots?');
      await comment(p1.id, 'carol', 'Interested in ABL inflow. Any synthetic turbulence?');
      await comment(p2.id, 'alice', 'Do you share the FE model updating scripts?');
      await comment(p3.id, 'bob',   'What is the typical solve time per snapshot?');
      await comment(p4.id, 'carol', 'Nice! Any mass breakdown per arm?');

      res.json({
        ok: true,
        users: ['alice', 'bob', 'carol'],
        passwords: 'test123',
        projects: [p1.id, p2.id, p3.id, p4.id]
      });
    } catch (e) {
      console.error('Seed-full error:', e);
      res.status(500).json({ error: 'Seed failed', details: String(e.message) });
    }
  });

  // ---- Global JSON error handler ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) return next(err);
    const status = err.status || 400;
    res.status(status).json({ error: err.message || 'Server error' });
  });

  app.listen(PORT, () => console.log(`Backend API on http://localhost:${PORT}`));
})();