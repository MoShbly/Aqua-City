const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db = require('../db/database');

// ── Multer storage ────────────────────────────────────────────────────────────
const modelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/models')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/images')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const uploadModel = multer({
  storage: modelStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // model-viewer (used in the app) only supports .glb and .gltf
    const ok = ['.glb', '.gltf'].includes(path.extname(file.originalname).toLowerCase());
    ok ? cb(null, true) : cb(new Error('Only .glb or .gltf files are supported by the 3D viewer'));
  },
});
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    ok ? cb(null, true) : cb(new Error('Only image files allowed'));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const getBaseUrl = (req) =>
  process.env.BASE_URL
    ? process.env.BASE_URL.replace(/\/$/, '')   // use env override, strip trailing slash
    : `${req.protocol}://${req.get('host')}`;   // fallback: derive from request

async function generateQRCode(animalId, baseUrl) {
  const qrData = `${baseUrl}/app/?id=${animalId}`;
  const qrFilename = `${animalId}.png`;
  const qrPath = path.join(__dirname, '../uploads/qrcodes', qrFilename);
  await QRCode.toFile(qrPath, qrData, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 512,
    margin: 2,
    color: { dark: '#0a192f', light: '#ffffff' },
  });
  return qrFilename;
}

function enrichAnimal(a, baseUrl) {
  const v = a.updated_at ? encodeURIComponent(a.updated_at) : Date.now();
  return {
    ...a,
    fun_facts: a.fun_facts ? tryParse(a.fun_facts, []) : [],
    model_url: a.model_filename ? `${baseUrl}/uploads/models/${a.model_filename}?v=${v}` : null,
    image_url: a.image_filename ? `${baseUrl}/uploads/images/${a.image_filename}?v=${v}` : null,
    qr_code_url: a.qr_code_filename ? `${baseUrl}/uploads/qrcodes/${a.qr_code_filename}?v=${v}` : null,
    is_active: Boolean(a.is_active),
    scan_count: Number(a.scan_count) || 0,
  };
}

function tryParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function delFile(dir, filename) {
  if (!filename) return;
  const p = path.join(__dirname, dir, filename);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ── GET /api/animals ──────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { category, search, active } = req.query;
    let sql = 'SELECT * FROM animals WHERE 1=1';
    const params = [];

    if (active !== 'all') { sql += ' AND is_active = 1'; }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (search) {
      sql += ' AND (name LIKE ? OR scientific_name LIKE ? OR description LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    sql += ' ORDER BY created_at DESC';

    const animals = db.query(sql, params);
    const base = getBaseUrl(req);
    res.json({ success: true, count: animals.length, data: animals.map(a => enrichAnimal(a, base)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/animals/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const animal = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found' });

    // Log scan
    db.run('UPDATE animals SET scan_count = scan_count + 1 WHERE id = ?', [req.params.id]);
    db.run('INSERT INTO scan_logs (animal_id, device_info) VALUES (?, ?)', [
      req.params.id, req.headers['user-agent'] || 'unknown',
    ]);

    res.json({ success: true, data: enrichAnimal(animal, getBaseUrl(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/animals ─────────────────────────────────────────────────────────
router.post('/', uploadImage.single('image'), async (req, res) => {
  try {
    const { name, scientific_name, category, habitat, description,
      fun_facts, diet, lifespan, size, conservation_status } = req.body;

    if (!name || !category)
      return res.status(400).json({ success: false, error: 'Name and category are required' });

    const id = uuidv4();
    const base = getBaseUrl(req);
    const qrFile = await generateQRCode(id, base);
    const imgFile = req.file ? req.file.filename : null;

    db.run(`
      INSERT INTO animals
        (id, name, scientific_name, category, habitat, description,
         fun_facts, diet, lifespan, size, conservation_status,
         image_filename, qr_code_filename)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [id, name, scientific_name || null, category, habitat || null,
      description || null, fun_facts || null, diet || null,
      lifespan || null, size || null,
      conservation_status || 'Least Concern', imgFile, qrFile]);

    const created = db.queryOne('SELECT * FROM animals WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: enrichAnimal(created, base) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PATCH /api/animals/:id/model ──────────────────────────────────────────────
router.patch('/:id/model', uploadModel.single('model'), (req, res) => {
  try {
    const animal = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found' });
    if (!req.file) return res.status(400).json({ success: false, error: 'No model file' });

    delFile('../uploads/models', animal.model_filename);

    db.run(`UPDATE animals SET model_filename = ?, updated_at = datetime('now') WHERE id = ?`,
      [req.file.filename, req.params.id]);

    const updated = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: enrichAnimal(updated, getBaseUrl(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PATCH /api/animals/:id ────────────────────────────────────────────────────
router.patch('/:id', uploadImage.single('image'), (req, res) => {
  try {
    const animal = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found' });

    const fields = ['name', 'scientific_name', 'category', 'habitat', 'description',
      'fun_facts', 'diet', 'lifespan', 'size', 'conservation_status', 'is_active'];
    const sets = [];
    const vals = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
    });

    if (req.file) {
      delFile('../uploads/images', animal.image_filename);
      sets.push('image_filename = ?');
      vals.push(req.file.filename);
    }

    sets.push("updated_at = datetime('now')");
    vals.push(req.params.id);

    if (sets.length > 1) db.run(`UPDATE animals SET ${sets.join(', ')} WHERE id = ?`, vals);

    const updated = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: enrichAnimal(updated, getBaseUrl(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/animals/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const animal = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found' });

    delFile('../uploads/models', animal.model_filename);
    delFile('../uploads/images', animal.image_filename);
    delFile('../uploads/qrcodes', animal.qr_code_filename);

    db.run('DELETE FROM scan_logs WHERE animal_id = ?', [req.params.id]);
    db.run('DELETE FROM animals WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Animal deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/animals/:id/regenerate-qr ──────────────────────────────────────
router.post('/:id/regenerate-qr', async (req, res) => {
  try {
    const animal = db.queryOne('SELECT * FROM animals WHERE id = ?', [req.params.id]);
    if (!animal) return res.status(404).json({ success: false, error: 'Animal not found' });

    const qrFile = await generateQRCode(animal.id, getBaseUrl(req));
    db.run(`UPDATE animals SET qr_code_filename = ?, updated_at = datetime('now') WHERE id = ?`,
      [qrFile, animal.id]);

    const updated = db.queryOne('SELECT * FROM animals WHERE id = ?', [animal.id]);
    res.json({ success: true, data: enrichAnimal(updated, getBaseUrl(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Multer error handler ─────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, error: 'File too large. Models must be under 200MB, images under 10MB.' });
  }
  if (err && err.message) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next(err);
});

module.exports = router;
