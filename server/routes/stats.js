const express = require('express');
const router  = express.Router();
const db      = require('../db/database');

router.get('/', (req, res) => {
  try {
    const overview = {
      totalAnimals:  (db.queryOne('SELECT COUNT(*) as c FROM animals') || {}).c || 0,
      activeAnimals: (db.queryOne('SELECT COUNT(*) as c FROM animals WHERE is_active = 1') || {}).c || 0,
      totalScans:    (db.queryOne('SELECT SUM(scan_count) as c FROM animals') || {}).c || 0,
      totalModels:   (db.queryOne('SELECT COUNT(*) as c FROM animals WHERE model_filename IS NOT NULL') || {}).c || 0,
    };

    const byCategory = db.query(`
      SELECT category, COUNT(*) as count, SUM(scan_count) as scans
      FROM animals GROUP BY category ORDER BY count DESC
    `);

    const topAnimals = db.query(`
      SELECT id, name, category, scan_count, image_filename
      FROM animals ORDER BY scan_count DESC LIMIT 5
    `);

    const recentScans = db.query(`
      SELECT sl.scanned_at, a.name, a.category
      FROM scan_logs sl
      JOIN animals a ON sl.animal_id = a.id
      ORDER BY sl.scanned_at DESC LIMIT 10
    `);

    const recentAnimals = db.query(`
      SELECT id, name, category, created_at, is_active
      FROM animals ORDER BY created_at DESC LIMIT 5
    `);

    const scansPerDay = db.query(`
      SELECT DATE(scanned_at) as date, COUNT(*) as scans
      FROM scan_logs
      WHERE scanned_at >= datetime('now', '-7 days')
      GROUP BY DATE(scanned_at)
      ORDER BY date ASC
    `);

    res.json({
      success: true,
      data: { overview, byCategory, topAnimals, recentScans, recentAnimals, scansPerDay }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
