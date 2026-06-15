require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db/database');

const app = express();
app.set('trust proxy', 1); // Trust nginx/reverse proxy for correct host & protocol
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Ensure upload directories exist
const dirs = ['uploads/models', 'uploads/images', 'uploads/qrcodes'];
dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files — with explicit CORS headers so model-viewer
// can fetch .glb files cross-origin (required by WebGL/model-viewer)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Serve visitor app at /app
app.use('/app', express.static(path.join(__dirname, '../app')));

// Serve admin panel at root
app.use('/', express.static(path.join(__dirname, '../admin')));

// ── API Routes ──────────────────────────────────────────────────────────────
const animalsRouter = require('./routes/animals');
const statsRouter   = require('./routes/stats');

app.use('/api/animals', animalsRouter);
app.use('/api/stats',   statsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// SPA fallbacks
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../app/index.html'));
});
app.get('*', (req, res) => {
  const adminIndex = path.join(__dirname, '../admin/index.html');
  if (fs.existsSync(adminIndex)) res.sendFile(adminIndex);
  else res.json({ message: 'Aqua City API is running', docs: '/api/health' });
});

// ── Global JSON error handler (MUST be last, 4-arg signature) ──────────────
// Catches any unhandled error from any router and always returns JSON so the
// client never receives an HTML error page.
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Initialize DB then start server
db.init().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`\n🌊 Aqua City Server running on http://${HOST}:${PORT}`);
    console.log(`📊 Admin Panel: http://localhost:${PORT}`);
    console.log(`🔗 API Base:    http://localhost:${PORT}/api`);
    console.log(`\nPress Ctrl+C to stop.\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
