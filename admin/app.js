/* ═══════════════════════════════════════════════════════════════════════════
   Aqua City — Admin Panel JavaScript
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = window.location.origin + '/api';
let allAnimals = [];
let editingId = null;
let scansChart = null;

/* ─── Image compression (keeps uploads under nginx body limit) ──────────── */
async function compressImage(file, maxPx = 1920, quality = 0.85) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const ratio = Math.min(maxPx / width, maxPx / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          const out = blob && blob.size < file.size
            ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
            : file;
          resolve(out);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/* ─── Utility ────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastIn 0.3s ease reverse'; setTimeout(() => t.remove(), 300); }, 3500);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function categoryEmoji(cat) {
  const map = { fish:'🐟', mammal:'🐬', reptile:'🐢', bird:'🦅', invertebrate:'🦑', amphibian:'🐸' };
  return map[cat] || '🐾';
}

function conservationColor(status) {
  if (!status) return 'badge-blue';
  const s = status.toLowerCase();
  if (s.includes('least'))  return 'badge-green';
  if (s.includes('near'))   return 'badge-blue';
  if (s.includes('vulnerable')) return 'badge-amber';
  if (s.includes('endangered')) return 'badge-red';
  if (s.includes('critical'))   return 'badge-red';
  return 'badge-blue';
}

/* ─── Page navigation ────────────────────────────────────────────────────── */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`page-${name}`).classList.add('active');
  const navBtn = document.getElementById(`nav-${name}`);
  if (navBtn) navBtn.classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'animals')   loadAnimals();
  if (name === 'qrcodes')   loadQRCodes();
  if (name === 'api')       renderApiDocs();
  if (name === 'add' && !editingId) resetForm();

  // Auto-close sidebar on mobile after any navigation tap
  if (window.innerWidth <= 768) closeSidebar();
}

/* ─── Server health check ────────────────────────────────────────────────── */
async function checkHealth() {
  const dot  = document.querySelector('.status-dot');
  const text = document.querySelector('.status-text');
  try {
    const r = await fetch(`${API_BASE}/health`);
    if (r.ok) {
      dot.className  = 'status-dot online';
      text.textContent = 'Server Online';
    } else throw new Error();
  } catch {
    dot.className  = 'status-dot offline';
    text.textContent = 'Server Offline';
  }
}

/* ─── Dashboard ──────────────────────────────────────────────────────────── */
async function loadDashboard() {
  try {
    const r    = await fetch(`${API_BASE}/stats`);
    const data = await r.json();
    if (!data.success) throw new Error(data.error);
    const { overview, byCategory, topAnimals, recentScans, scansPerDay } = data.data;

    // Stats cards
    const grid = document.getElementById('stats-grid');
    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">🐠</div>
        <div class="stat-value">${overview.totalAnimals}</div>
        <div class="stat-label">Total Animals</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-value">${overview.activeAnimals}</div>
        <div class="stat-label">Active Exhibits</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📷</div>
        <div class="stat-value">${overview.totalScans}</div>
        <div class="stat-label">Total QR Scans</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎮</div>
        <div class="stat-value">${overview.totalModels}</div>
        <div class="stat-label">3D Models Uploaded</div>
      </div>
    `;

    // Chart
    renderScansChart(scansPerDay);

    // Top animals
    const topEl = document.getElementById('top-animals-list');
    if (!topAnimals.length) {
      topEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏆</div><p>No animals yet</p></div>';
    } else {
      topEl.innerHTML = topAnimals.map((a, i) => `
        <div class="top-item">
          <div class="top-rank ${i === 0 ? 'top-rank-1' : i === 1 ? 'top-rank-2' : i === 2 ? 'top-rank-3' : ''}">${i + 1}</div>
          <div class="top-info">
            <div class="top-name">${a.name}</div>
            <div class="top-cat">${categoryEmoji(a.category)} ${a.category}</div>
          </div>
          <div class="top-scans">${a.scan_count} scans</div>
        </div>
      `).join('');
    }

    // By category
    const catEl = document.getElementById('category-list');
    const maxCount = Math.max(...byCategory.map(c => c.count), 1);
    catEl.innerHTML = byCategory.length
      ? byCategory.map(c => `
          <div class="cat-item">
            <div class="cat-label">${categoryEmoji(c.category)} ${c.category}</div>
            <div class="cat-bar-wrap"><div class="cat-bar" style="width:${(c.count/maxCount*100)}%"></div></div>
            <div class="cat-count">${c.count}</div>
          </div>
        `).join('')
      : '<div class="empty-state">No categories yet</div>';

    // Recent scans
    const scanEl = document.getElementById('recent-scans-list');
    scanEl.innerHTML = recentScans.length
      ? recentScans.map(s => `
          <div class="scan-item">
            <div class="scan-dot"></div>
            <div class="scan-name">${categoryEmoji(s.category)} ${s.name}</div>
            <div class="scan-time">${timeAgo(s.scanned_at)}</div>
          </div>
        `).join('')
      : '<div class="empty-state">No scans yet</div>';

  } catch (err) {
    toast('Failed to load dashboard: ' + err.message, 'error');
  }
}

function renderScansChart(data) {
  const ctx     = document.getElementById('scansChart');
  const emptyEl = document.getElementById('chart-empty');

  if (!data.length) {
    ctx.style.display   = 'none';
    emptyEl.style.display = 'flex';
    return;
  }

  ctx.style.display   = 'block';
  emptyEl.style.display = 'none';

  if (scansChart) scansChart.destroy();

  scansChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label: 'Scans',
        data: data.map(d => d.scans),
        backgroundColor: 'rgba(0,198,255,0.25)',
        borderColor: 'rgba(0,198,255,0.8)',
        borderWidth: 2,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5a7a9a', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5a7a9a', font: { family: 'Outfit' }, stepSize: 1 },
          beginAtZero: true
        }
      }
    }
  });
}

/* ─── Animals List ───────────────────────────────────────────────────────── */
async function loadAnimals() {
  try {
    const r = await fetch(`${API_BASE}/animals?active=all`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    allAnimals = d.data;
    renderAnimals(allAnimals);
  } catch (err) {
    toast('Failed to load animals: ' + err.message, 'error');
  }
}

function renderAnimals(list) {
  const grid = document.getElementById('animals-grid');
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🐠</div>
        <p>No animals yet. <button class="btn btn-ghost btn-sm" onclick="showPage('add')">Add your first animal →</button></p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(a => `
    <div class="animal-card" onclick="openAnimalModal('${a.id}')">
      ${a.image_url
        ? `<img class="animal-img" src="${a.image_url}" alt="${a.name}" onerror="this.style.display='none'" />`
        : `<div class="animal-img-placeholder">${categoryEmoji(a.category)}</div>`}
      <div class="animal-body">
        <div class="animal-name">${a.name}</div>
        <div class="animal-sci">${a.scientific_name || ''}</div>
        <div class="animal-meta">
          <span class="badge badge-blue">${categoryEmoji(a.category)} ${a.category}</span>
          ${!a.is_active ? '<span class="badge badge-red">Inactive</span>' : ''}
          ${a.model_url  ? '<span class="badge badge-green">🎮 3D Model</span>' : '<span class="badge badge-info">No Model</span>'}
          <span class="badge ${conservationColor(a.conservation_status)}">${a.conservation_status || ''}</span>
        </div>
        <div style="font-size:0.75rem;color:var(--text-3)">📷 ${a.scan_count} scans</div>
      </div>
      <div class="animal-footer" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="editAnimal('${a.id}')">✏️ Edit</button>
        <button class="btn-icon" onclick="uploadModelFor('${a.id}')">🎮 Model</button>
        <button class="btn-icon danger" onclick="confirmDelete('${a.id}','${a.name}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function filterAnimals() {
  const search = document.getElementById('animal-search').value.toLowerCase();
  const cat    = document.getElementById('category-filter').value;
  const filtered = allAnimals.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search) || (a.scientific_name || '').toLowerCase().includes(search);
    const matchCat    = !cat    || a.category === cat;
    return matchSearch && matchCat;
  });
  renderAnimals(filtered);
}

/* ─── Animal Modal ───────────────────────────────────────────────────────── */
async function openAnimalModal(id) {
  const overlay = document.getElementById('animal-modal');
  overlay.classList.add('open');
  const content = document.getElementById('modal-content');
  content.innerHTML = '<div style="text-align:center;padding:2rem">Loading...</div>';

  try {
    // fetch without incrementing scan — use the list data
    const a = allAnimals.find(x => x.id === id) || await fetch(`${API_BASE}/animals/${id}`).then(r => r.json()).then(d => d.data);

    const facts = Array.isArray(a.fun_facts) ? a.fun_facts : (typeof a.fun_facts === 'string' ? JSON.parse(a.fun_facts || '[]') : []);

    content.innerHTML = `
      <div class="modal-animal-header">
        ${a.image_url
          ? `<img class="modal-animal-img" src="${a.image_url}" alt="${a.name}" />`
          : `<div class="modal-animal-img-placeholder">${categoryEmoji(a.category)}</div>`}
        <div>
          <div class="modal-animal-title">${a.name}</div>
          <div class="modal-animal-sci">${a.scientific_name || 'Unknown species'}</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
            <span class="badge badge-blue">${categoryEmoji(a.category)} ${a.category}</span>
            <span class="badge ${conservationColor(a.conservation_status)}">${a.conservation_status || 'Unknown'}</span>
            ${!a.is_active ? '<span class="badge badge-red">Inactive</span>' : '<span class="badge badge-green">Active</span>'}
          </div>
          <div class="${a.model_url ? 'modal-model-badge has-model' : 'modal-model-badge no-model'}">
            ${a.model_url ? '✅ 3D Model Uploaded' : '⚠️ No 3D Model'}
          </div>
        </div>
      </div>

      ${a.description ? `<p style="color:var(--text-2);font-size:0.9rem;line-height:1.7;margin-bottom:1rem">${a.description}</p>` : ''}

      <div class="modal-info-grid">
        ${a.habitat  ? `<div class="modal-info-item"><div class="modal-info-label">Habitat</div><div class="modal-info-value">🌊 ${a.habitat}</div></div>` : ''}
        ${a.diet     ? `<div class="modal-info-item"><div class="modal-info-label">Diet</div><div class="modal-info-value">🍽️ ${a.diet}</div></div>` : ''}
        ${a.lifespan ? `<div class="modal-info-item"><div class="modal-info-label">Lifespan</div><div class="modal-info-value">⏳ ${a.lifespan}</div></div>` : ''}
        ${a.size     ? `<div class="modal-info-item"><div class="modal-info-label">Size</div><div class="modal-info-value">📏 ${a.size}</div></div>` : ''}
        <div class="modal-info-item"><div class="modal-info-label">QR Scans</div><div class="modal-info-value">📷 ${a.scan_count}</div></div>
        <div class="modal-info-item"><div class="modal-info-label">Added</div><div class="modal-info-value">📅 ${new Date(a.created_at).toLocaleDateString()}</div></div>
      </div>

      ${facts.length ? `
        <div style="margin:1rem 0">
          <div style="font-size:0.8rem;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem">Fun Facts</div>
          ${facts.map(f => `<div style="background:var(--bg-3);border-radius:8px;padding:0.6rem 0.9rem;margin-bottom:0.4rem;font-size:0.85rem">💡 ${f}</div>`).join('')}
        </div>
      ` : ''}

      <div class="modal-qr-section">
        ${a.qr_code_url
          ? `<img class="modal-qr-img" src="${a.qr_code_url}" alt="QR Code for ${a.name}" />`
          : `<div style="width:120px;height:120px;background:var(--bg-3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2rem">📷</div>`}
        <div>
          <div style="font-weight:600;margin-bottom:0.4rem">QR Code</div>
          <p style="font-size:0.82rem;color:var(--text-3);margin-bottom:1rem">Visitors scan this to see the 3D model of <strong>${a.name}</strong>.</p>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            ${a.qr_code_url ? `<a href="${a.qr_code_url}" download="${a.name}-qr.png" class="btn btn-ghost btn-sm">⬇️ Download QR</a>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="editAnimal('${a.id}');closeModal()">✏️ Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="uploadModelFor('${a.id}');closeModal()">🎮 Upload Model</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--red)">Error: ${err.message}</div>`;
  }
}

function closeModal() {
  document.getElementById('animal-modal').classList.remove('open');
}

/* ─── Add / Edit Form ────────────────────────────────────────────────────── */
function resetForm() {
  editingId = null;
  document.getElementById('form-title').textContent = 'Add New Animal';
  document.getElementById('submit-text').textContent = 'Save Animal';
  document.getElementById('animal-form').reset();
  document.getElementById('image-preview').style.display = 'none';
  document.getElementById('model-preview-name').style.display = 'none';
  document.getElementById('fun-facts-list').innerHTML = '';

  // Reset upload zones
  resetZone('image-zone', '📸', 'Click or drag & drop', 'JPG, PNG, WebP — max 10MB');
  resetZone('model-zone', '🎮', 'Click or drag & drop', '.glb or .gltf only — max 200MB');
}

function resetZone(zoneId, icon, text, sub) {
  const z = document.getElementById(zoneId);
  // Preserve the hidden file input so it isn't destroyed
  const input = z.querySelector('input[type="file"]');
  z.innerHTML = `
    <div class="upload-icon">${icon}</div>
    <div class="upload-text">${text}</div>
    <div class="upload-sub">${sub}</div>
  `;
  if (input) z.appendChild(input);
}

async function editAnimal(id) {
  showPage('add');
  editingId = id;
  document.getElementById('form-title').textContent = 'Edit Animal';
  document.getElementById('submit-text').textContent = 'Update Animal';

  const a = allAnimals.find(x => x.id === id);
  if (!a) return;

  document.getElementById('f-name').value        = a.name || '';
  document.getElementById('f-scientific').value  = a.scientific_name || '';
  document.getElementById('f-category').value    = a.category || '';
  document.getElementById('f-status').value      = a.conservation_status || 'Least Concern';
  document.getElementById('f-habitat').value     = a.habitat || '';
  document.getElementById('f-diet').value        = a.diet || '';
  document.getElementById('f-lifespan').value    = a.lifespan || '';
  document.getElementById('f-size').value        = a.size || '';
  document.getElementById('f-description').value = a.description || '';

  // Fun facts
  const facts = Array.isArray(a.fun_facts) ? a.fun_facts : [];
  facts.forEach(f => addFunFact(f));

  // Image preview
  if (a.image_url) {
    const preview = document.getElementById('image-preview');
    preview.src   = a.image_url;
    preview.style.display = 'block';
  }

  // Model badge
  if (a.model_url) {
    const badge = document.getElementById('model-preview-name');
    badge.innerHTML = `✅ Model uploaded: ${a.model_filename}`;
    badge.style.display = 'inline-flex';
  }
}

async function submitAnimalForm(e) {
  e.preventDefault();
  const btn  = document.getElementById('submit-btn');
  const icon = document.getElementById('submit-icon');
  const text = document.getElementById('submit-text');

  btn.disabled = true;
  icon.textContent = '⏳';
  text.textContent = 'Saving...';

  try {
    const formData = new FormData();
    formData.append('name',                document.getElementById('f-name').value);
    formData.append('scientific_name',     document.getElementById('f-scientific').value);
    formData.append('category',            document.getElementById('f-category').value);
    formData.append('conservation_status', document.getElementById('f-status').value);
    formData.append('habitat',             document.getElementById('f-habitat').value);
    formData.append('diet',                document.getElementById('f-diet').value);
    formData.append('lifespan',            document.getElementById('f-lifespan').value);
    formData.append('size',                document.getElementById('f-size').value);
    formData.append('description',         document.getElementById('f-description').value);

    // Fun facts
    const factInputs = document.querySelectorAll('.fun-fact-row input');
    const facts = [...factInputs].map(i => i.value.trim()).filter(Boolean);
    formData.append('fun_facts', JSON.stringify(facts));

    // Image file — compress before upload to stay under server body limits
    const imageFile = document.getElementById('f-image').files[0];
    if (imageFile) {
      const compressed = await compressImage(imageFile);
      formData.append('image', compressed);
    }

    let url    = `${API_BASE}/animals`;
    let method = 'POST';
    if (editingId) { url += `/${editingId}`; method = 'PATCH'; }

    const r = await fetch(url, { method, body: formData });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);

    // Upload model if provided
    const modelFile = document.getElementById('f-model').files[0];
    if (modelFile) {
      const mfd = new FormData();
      mfd.append('model', modelFile);
      const mr = await fetch(`${API_BASE}/animals/${d.data.id}/model`, { method: 'PATCH', body: mfd });
      const md = await mr.json();
      if (!md.success) toast('Animal saved but model upload failed: ' + md.error, 'error');
      else toast('Animal and 3D model saved! 🎮', 'success');
    } else {
      toast(editingId ? 'Animal updated! ✅' : 'Animal added! 🐠', 'success');
    }

    resetForm();
    allAnimals = [];
    showPage('animals');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    icon.textContent = '✓';
    text.textContent = editingId ? 'Update Animal' : 'Save Animal';
  }
}

/* ─── Upload model separately (from animals list) ────────────────────────── */
function uploadModelFor(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    toast('Uploading 3D model...', 'info');
    const fd = new FormData();
    fd.append('model', file);
    const r = await fetch(`${API_BASE}/animals/${id}/model`, { method: 'PATCH', body: fd });
    const d = await r.json();
    if (d.success) {
      toast('3D model uploaded successfully! 🎮', 'success');
      await loadAnimals();
    } else {
      toast('Upload failed: ' + d.error, 'error');
    }
  };
  input.click();
}

/* ─── Delete ─────────────────────────────────────────────────────────────── */
let pendingDeleteId = null;

function confirmDelete(id, name) {
  pendingDeleteId = id;
  document.getElementById('confirm-body').textContent = `This will permanently delete "${name}" and all associated files. This cannot be undone.`;
  document.getElementById('confirm-modal').classList.add('open');
  document.getElementById('confirm-delete-btn').onclick = () => deleteAnimal(id);
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('open');
  pendingDeleteId = null;
}

async function deleteAnimal(id) {
  try {
    const r = await fetch(`${API_BASE}/animals/${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    closeConfirmModal();
    toast('Animal deleted', 'info');
    await loadAnimals();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'error');
  }
}

/* ─── Fun Facts ──────────────────────────────────────────────────────────── */
function addFunFact(value = '') {
  const list = document.getElementById('fun-facts-list');
  const row  = document.createElement('div');
  row.className = 'fun-fact-row';
  row.innerHTML = `
    <input type="text" placeholder="Enter a fun fact..." value="${value}" />
    <button type="button" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
  row.querySelector('input').focus();
}

/* ─── Drag & Drop ────────────────────────────────────────────────────────── */
function dragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('drag-over');
}

function dragLeave(zoneId) {
  document.getElementById(zoneId).classList.remove('drag-over');
}

function dropFile(e, zoneId, inputId) {
  e.preventDefault();
  dragLeave(zoneId);
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const input = document.getElementById(inputId);
  const dt    = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
}

function previewFile(inputId, previewId, zoneId) {
  const file = document.getElementById(inputId).files[0];
  if (!file) return;
  const preview = document.getElementById(previewId);
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  document.getElementById(zoneId).querySelector('.upload-text').textContent = file.name;
}

function previewModelFile(inputId, zoneId) {
  const file = document.getElementById(inputId).files[0];
  if (!file) return;
  const zone = document.getElementById(zoneId);
  const iconEl = zone.querySelector('.upload-icon');
  const textEl = zone.querySelector('.upload-text');
  const subEl  = zone.querySelector('.upload-sub');
  if (iconEl) iconEl.textContent = '\u2705';
  if (textEl) textEl.textContent = file.name;
  if (subEl)  subEl.textContent  = `${(file.size/1024/1024).toFixed(1)} MB`;
  const badge = document.getElementById('model-preview-name');
  badge.innerHTML = `\u2705 ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
  badge.style.display = 'inline-flex';
}

/* ─── QR Codes Page ──────────────────────────────────────────────────────── */
async function loadQRCodes() {
  const grid = document.getElementById('qr-grid');
  try {
    const r = await fetch(`${API_BASE}/animals?active=all`);
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    allAnimals = d.data;

    if (!allAnimals.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📷</div><p>No animals yet. Add animals first to generate QR codes.</p></div>';
      return;
    }

    grid.innerHTML = allAnimals.map(a => `
      <div class="qr-card">
        ${a.qr_code_url
          ? `<img class="qr-img" src="${a.qr_code_url}" alt="QR for ${a.name}" />`
          : `<div class="qr-img" style="background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-size:2rem">📷</div>`}
        <div class="qr-name">${a.name}</div>
        <div class="qr-cat">${categoryEmoji(a.category)} ${a.category}</div>
        <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap">
          ${a.qr_code_url
            ? `<a href="${a.qr_code_url}" download="${a.name}-qr.png" class="btn btn-ghost btn-sm">⬇️ Download</a>`
            : ''}
          <button class="btn btn-ghost btn-sm" onclick="regenerateQR('${a.id}')">🔄 Regenerate</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
  }
}

async function regenerateQR(id) {
  try {
    const r = await fetch(`${API_BASE}/animals/${id}/regenerate-qr`, { method: 'POST' });
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    toast('QR code regenerated! 📷', 'success');
    loadQRCodes();
  } catch (err) {
    toast('Failed: ' + err.message, 'error');
  }
}

function printAllQR() {
  const imgs = document.querySelectorAll('.qr-img');
  if (!imgs.length) return toast('No QR codes to print', 'info');
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>QR Codes — Aqua City</title>
    <style>
      body { font-family: sans-serif; display: flex; flex-wrap: wrap; gap: 24px; padding: 24px; background: #fff; }
      .item { text-align: center; page-break-inside: avoid; }
      img  { width: 150px; height: 150px; display: block; margin: 0 auto 8px; }
      p    { font-size: 14px; font-weight: bold; }
    </style></head><body>
    ${allAnimals.filter(a => a.qr_code_url).map(a => `
      <div class="item">
        <img src="${a.qr_code_url}" />
        <p>${a.name}</p>
        <small>${a.category}</small>
      </div>
    `).join('')}
    </body></html>
  `);
  win.document.close();
  win.print();
}

/* ─── API Docs Page ──────────────────────────────────────────────────────── */
function renderApiDocs() {
  const base = window.location.origin;
  document.getElementById('base-url-text').textContent = base + '/api';

  const endpoints = [
    { method: 'GET',    path: '/animals',              desc: 'List all animals',                     body: null, response: '{ success: true, count: 2, data: [...] }' },
    { method: 'GET',    path: '/animals/:id',          desc: 'Get single animal by ID (logs scan)',  body: null, response: '{ success: true, data: { id, name, model_url, qr_code_url, ... } }' },
    { method: 'POST',   path: '/animals',              desc: 'Create new animal (multipart/form-data)', body: 'name, category, description, image (file)', response: '{ success: true, data: { id, name, qr_code_url, ... } }' },
    { method: 'PATCH',  path: '/animals/:id',          desc: 'Update animal info',                   body: 'Any animal fields', response: '{ success: true, data: { ... } }' },
    { method: 'PATCH',  path: '/animals/:id/model',    desc: 'Upload 3D model (.glb or .gltf only)',  body: 'model (file)', response: '{ success: true, data: { model_url, ... } }' },
    { method: 'DELETE', path: '/animals/:id',          desc: 'Delete animal and all files',          body: null, response: '{ success: true, message: "..." }' },
    { method: 'POST',   path: '/animals/:id/regenerate-qr', desc: 'Regenerate QR code',             body: null, response: '{ success: true, data: { qr_code_url, ... } }' },
    { method: 'GET',    path: '/stats',                desc: 'Dashboard statistics',                 body: null, response: '{ data: { overview, byCategory, topAnimals, ... } }' },
    { method: 'GET',    path: '/health',               desc: 'Server health check',                  body: null, response: '{ status: "ok", timestamp: "..." }' },
  ];

  const container = document.getElementById('api-endpoints');
  container.innerHTML = endpoints.map((ep, i) => `
    <div class="api-endpoint">
      <div class="api-ep-header" onclick="toggleEp(${i})">
        <span class="method-badge method-${ep.method.toLowerCase()}">${ep.method}</span>
        <span class="api-ep-path">${ep.path}</span>
        <span class="api-ep-desc">${ep.desc}</span>
        <span style="color:var(--text-3)">▾</span>
      </div>
      <div class="api-ep-body" id="ep-${i}">
        ${ep.body ? `<div style="font-size:0.82rem;color:var(--text-3);margin-bottom:0.5rem"><strong>Request body:</strong> ${ep.body}</div>` : ''}
        <div style="font-size:0.82rem;color:var(--text-3);margin-bottom:0.25rem"><strong>Example response:</strong></div>
        <div class="code-block">${ep.response}</div>
        <div style="margin-top:0.75rem">
          <strong style="font-size:0.82rem">Unity C# example:</strong>
          <div class="code-block">string url = "${base}/api${ep.path.replace(':id', 'YOUR_ANIMAL_ID')}";
UnityWebRequest request = UnityWebRequest.Get(url);
yield return request.SendWebRequest();
string json = request.downloadHandler.text;</div>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleEp(i) {
  const body = document.getElementById(`ep-${i}`);
  body.classList.toggle('open');
}

function copyBaseUrl() {
  const text = document.getElementById('base-url-text').textContent;
  navigator.clipboard.writeText(text).then(() => toast('API URL copied!', 'success'));
}

/* ─── Mobile Sidebar Toggle ────────────────────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen  = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('visible', !isOpen);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

/* ─── Init ──────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  setInterval(checkHealth, 30000); // check every 30s
  loadDashboard();
});
