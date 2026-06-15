/* ═══════════════════════════════════════════════════════════════════════════
   Aqua City — Visitor App JavaScript
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Config ────────────────────────────────────────────────────────────────────
// In production this should be your server's public IP, e.g. "http://123.45.67.89:3000"
// For development it auto-detects the current host
const API_BASE = window.location.origin + '/api';

let html5QrCode = null;
let scannerRunning = false;
let recentAnimals = JSON.parse(localStorage.getItem('recentAnimals') || '[]');

// ── Utilities ─────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function categoryEmoji(cat) {
  const m = { fish:'🐟', mammal:'🐬', reptile:'🐢', bird:'🦅', invertebrate:'🦑', amphibian:'🐸', shark:'🦈' };
  return m[cat] || '🐾';
}

function conservationTag(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  let cls = 'tag-green';
  if (s.includes('near'))       cls = 'tag-blue';
  if (s.includes('vulnerable')) cls = 'tag-amber';
  if (s.includes('endangered')) cls = 'tag-red';
  if (s.includes('critical'))   cls = 'tag-red';
  return `<span class="tag ${cls}">🌿 ${status}</span>`;
}

// ── Page navigation ───────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${id}`).classList.add('active');
}

function goHome() {
  stopScanner();
  showPage('home');
  renderRecentAnimals();
}

// ── Home Page Init ────────────────────────────────────────────────────────────
async function initHome() {
  renderRecentAnimals();
  await loadCategories();
}

function renderRecentAnimals() {
  const section = document.getElementById('recent-section');
  const list    = document.getElementById('recent-list');
  if (!recentAnimals.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = recentAnimals.slice(0, 6).map(a => `
    <button class="recent-chip" onclick="viewAnimalById('${a.id}')">
      ${categoryEmoji(a.category)} ${a.name}
    </button>
  `).join('');
}

async function loadCategories() {
  const grid = document.getElementById('categories-grid');
  try {
    const r = await fetch(`${API_BASE}/animals?active=all`);
    const d = await r.json();
    if (!d.success || !d.data.length) {
      grid.innerHTML = '<p style="color:var(--text-3);font-size:0.85rem;grid-column:1/-1;text-align:center">No animals added yet</p>';
      return;
    }

    // Unique categories
    const cats = [...new Set(d.data.map(a => a.category))];
    grid.innerHTML = cats.map(cat => `
      <button class="cat-chip" onclick="browsCategory('${cat}')">
        <span class="cat-emoji">${categoryEmoji(cat)}</span>
        <span>${cat}</span>
      </button>
    `).join('');
  } catch {
    grid.innerHTML = '<p style="color:var(--text-3);font-size:0.85rem;grid-column:1/-1;text-align:center">Could not connect to server</p>';
  }
}

// ── QR Scanner ────────────────────────────────────────────────────────────────
async function startScan() {
  showPage('scanner');

  if (html5QrCode && scannerRunning) return;

  html5QrCode = new Html5Qrcode('qr-reader');

  const config = {
    fps: 10,
    qrbox: { width: 240, height: 240 },
    aspectRatio: 1.0,
    disableFlip: false,
  };

  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      onQRSuccess,
      () => {} // ignore decode errors (called many times per second)
    );
    scannerRunning = true;
  } catch (err) {
    showToast('Camera access denied. Please allow camera permissions.');
    goHome();
  }
}

function stopScanner() {
  if (html5QrCode && scannerRunning) {
    html5QrCode.stop().catch(() => {});
    scannerRunning = false;
  }
}

async function onQRSuccess(decodedText) {
  if (!scannerRunning) return;
  stopScanner();

  // Show loading
  document.getElementById('scanner-loading').style.display = 'flex';

  try {
    // The QR code can be http://server/app/?id=UUID (new) or http://server/api/animals/UUID (old)
    let animalId = null;
    const matchApp = decodedText.match(/[?&]id=([a-f0-9-]{36})/i);
    const matchApi = decodedText.match(/\/api\/animals\/([a-f0-9-]{36})/i);
    
    if (matchApp) {
      animalId = matchApp[1];
    } else if (matchApi) {
      animalId = matchApi[1];
    } else if (decodedText.match(/^[a-f0-9-]{36}$/i)) {
      animalId = decodedText; // bare UUID
    } else {
      throw new Error('Not a valid Aqua City QR code');
    }

    await viewAnimalById(animalId);
  } catch (err) {
    document.getElementById('scanner-loading').style.display = 'none';
    showToast('❌ ' + err.message);
    setTimeout(startScan, 1500); // restart scanner
  }
}

// ── Animal Detail ─────────────────────────────────────────────────────────────
async function viewAnimalById(id) {
  document.getElementById('scanner-loading').style.display = 'flex';
  try {
    const r = await fetch(`${API_BASE}/animals/${id}`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error || 'Animal not found');

    document.getElementById('scanner-loading').style.display = 'none';
    renderAnimalPage(d.data);
    showPage('animal');

    // Save to recent
    addToRecent(d.data);
  } catch (err) {
    document.getElementById('scanner-loading').style.display = 'none';
    throw err;
  }
}

function addToRecent(animal) {
  recentAnimals = recentAnimals.filter(a => a.id !== animal.id);
  recentAnimals.unshift({ id: animal.id, name: animal.name, category: animal.category });
  recentAnimals = recentAnimals.slice(0, 10);
  localStorage.setItem('recentAnimals', JSON.stringify(recentAnimals));
}

function renderAnimalPage(a) {
  const facts = Array.isArray(a.fun_facts) ? a.fun_facts : [];
  const hasModel = Boolean(a.model_url);

  document.getElementById('animal-content').innerHTML = `
    <!-- Hero image -->
    <div class="animal-hero">
      ${a.image_url
        ? `<img class="animal-hero-img" src="${a.image_url}" alt="${a.name}" />`
        : `<div class="animal-hero-placeholder">${categoryEmoji(a.category)}</div>`}
      <div class="animal-hero-gradient"></div>
      <button class="animal-back-btn" onclick="goHome()" aria-label="Go back">←</button>
    </div>

    <!-- Body -->
    <div class="animal-body">

      <!-- Name & tags -->
      <div class="animal-name-row">
        <h1 class="animal-name">${a.name}</h1>
      </div>
      <div class="animal-sci">${a.scientific_name || 'Unknown species'}</div>

      <div class="animal-tags">
        <span class="tag tag-blue">${categoryEmoji(a.category)} ${a.category}</span>
        ${conservationTag(a.conservation_status)}
        ${hasModel ? '<span class="tag tag-purple">🎮 3D Model</span>' : ''}
      </div>

      <!-- 3D Model Button -->
      <button
        class="view-3d-btn ${hasModel ? '' : 'no-model'}"
        ${hasModel ? `onclick="open3DModel('${a.model_url}','${a.name}')"` : 'disabled'}
        id="btn-3d-${a.id}"
      >
        ${hasModel
          ? `<span style="font-size:1.4rem">🎮</span> View 3D Model <span style="font-size:0.9rem;opacity:0.8">&amp; AR</span>`
          : `<span style="font-size:1.4rem">⏳</span> 3D Model Coming Soon`}
      </button>

      <!-- Info grid -->
      <div class="info-grid">
        ${a.habitat  ? `<div class="info-card"><div class="info-card-label">Habitat</div><div class="info-card-value">${a.habitat}</div></div>` : ''}
        ${a.diet     ? `<div class="info-card"><div class="info-card-label">Diet</div><div class="info-card-value">${a.diet}</div></div>` : ''}
        ${a.lifespan ? `<div class="info-card"><div class="info-card-label">Lifespan</div><div class="info-card-value">${a.lifespan}</div></div>` : ''}
        ${a.size     ? `<div class="info-card"><div class="info-card-label">Size</div><div class="info-card-value">${a.size}</div></div>` : ''}
      </div>

      <!-- Description -->
      ${a.description ? `
        <div class="section-block">
          <div class="section-block-title">About</div>
          <p class="desc-text">${a.description}</p>
        </div>
      ` : ''}

      <!-- Fun facts -->
      ${facts.length ? `
        <div class="section-block">
          <div class="section-block-title">💡 Fun Facts</div>
          ${facts.map(f => `
            <div class="fact-item">
              <div class="fact-dot"></div>
              <span>${f}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- QR Code preview -->
      ${a.qr_code_url ? `
        <div class="qr-preview-section">
          <div class="section-block-title" style="margin-bottom:0.75rem">📷 Exhibit QR Code</div>
          <img class="qr-preview-img" src="${a.qr_code_url}" alt="QR Code" />
          <p style="font-size:0.78rem;color:var(--text-3)">Share this animal with others</p>
        </div>
      ` : ''}

    </div>
  `;
}

// ── 3D Model Viewer ───────────────────────────────────────────────────────────
function open3DModel(modelUrl, animalName) {
  const overlay = document.getElementById('model-overlay');
  const viewer  = document.getElementById('main-model-viewer');
  const titleBar = document.getElementById('model-title-bar');

  titleBar.textContent = `🎮 ${animalName}`;
  viewer.setAttribute('src', modelUrl);
  viewer.setAttribute('alt', animalName);

  overlay.classList.add('open');
}

function closeModel() {
  const overlay = document.getElementById('model-overlay');
  const viewer  = document.getElementById('main-model-viewer');
  overlay.classList.remove('open');
  // Stop the model from loading/rendering when hidden
  viewer.removeAttribute('src');
}

// ── Browse by Category ────────────────────────────────────────────────────────
async function browsCategory(category) {
  showPage('browse');
  document.getElementById('browse-title').textContent =
    `${categoryEmoji(category)} ${category.charAt(0).toUpperCase() + category.slice(1)}s`;
  document.getElementById('browse-list').innerHTML = '<div class="loading-state">Loading...</div>';

  try {
    const r = await fetch(`${API_BASE}/animals?category=${category}`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);

    if (!d.data.length) {
      document.getElementById('browse-list').innerHTML = '<div class="loading-state">No animals in this category yet.</div>';
      return;
    }

    document.getElementById('browse-list').innerHTML = d.data.map(a => `
      <div class="browse-item" onclick="viewAnimalById('${a.id}')">
        ${a.image_url
          ? `<img class="browse-item-img" src="${a.image_url}" alt="${a.name}" />`
          : `<div class="browse-item-emoji">${categoryEmoji(a.category)}</div>`}
        <div>
          <div class="browse-item-name">${a.name}</div>
          <div class="browse-item-sci">${a.scientific_name || ''}</div>
        </div>
        <span class="browse-item-arrow">›</span>
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('browse-list').innerHTML = `<div class="loading-state">Error: ${err.message}</div>`;
  }
}

// ── PWA Install prompt ────────────────────────────────────────────────────────
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Could show an install button here
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initHome();

  // Check if animal ID is passed in the URL (e.g. ?id=UUID)
  const params = new URLSearchParams(window.location.search);
  const animalId = params.get('id');
  if (animalId) {
    viewAnimalById(animalId).catch(err => {
      showToast('❌ ' + err.message);
    });
  }

  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
