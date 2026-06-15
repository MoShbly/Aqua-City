const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/aquacity.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;
let SQL;

// Save DB to disk
function persist() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// Initialize DB (async)
async function init() {
  SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS animals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scientific_name TEXT,
      category TEXT NOT NULL DEFAULT 'fish',
      habitat TEXT,
      description TEXT,
      fun_facts TEXT,
      diet TEXT,
      lifespan TEXT,
      size TEXT,
      conservation_status TEXT DEFAULT 'Least Concern',
      model_filename TEXT,
      image_filename TEXT,
      qr_code_filename TEXT,
      scan_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      animal_id TEXT NOT NULL,
      scanned_at TEXT DEFAULT (datetime('now')),
      device_info TEXT
    );
  `);

  persist();
  return db;
}

// Helper: run a SELECT and return array of row objects
function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run a SELECT and return first row object or null
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

// Helper: run INSERT/UPDATE/DELETE
function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

module.exports = { init, query, queryOne, run, persist };
