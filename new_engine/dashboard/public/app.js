// ─── State ───
let allMappings = [];
let allSzotar = [];
let allTemplates = [];
let allActions = [];
let currentFilter = 'all';
let editingMapping = null;
let selectedSzotarId = null;

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Load telephelyek
  const telephelyek = await api('/api/telephelyek');
  const sel = document.getElementById('telephelySelect');
  telephelyek.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = id.substring(0, 8) + '…';
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => loadTelephelyData(sel.value));

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderMappings();
    });
  });

  // Search
  document.getElementById('searchMappings').addEventListener('input', renderMappings);
  document.getElementById('searchTemplates').addEventListener('input', renderTemplates);

  // Mapping edit modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalSave').addEventListener('click', saveMapping);
  document.getElementById('editModal').addEventListener('click', e => {
    if (e.target.id === 'editModal') closeModal();
  });
  document.getElementById('modalSearch').addEventListener('input', renderModalList);

  // Template edit modal
  document.getElementById('tplModalClose').addEventListener('click', closeTplModal);
  document.getElementById('tplModalCancel').addEventListener('click', closeTplModal);
  document.getElementById('tplModalSave').addEventListener('click', saveTemplate);
  document.getElementById('tplEditModal').addEventListener('click', e => {
    if (e.target.id === 'tplEditModal') closeTplModal();
  });
  document.getElementById('addVisitBtn').addEventListener('click', addVisit);
  document.getElementById('newTemplateBtn').addEventListener('click', createNewTemplate);

  // Load data
  allActions = await api('/api/actions');
  allTemplates = await api('/api/templates');
  renderTemplates();

  if (telephelyek.length) {
    sel.value = telephelyek[0];
    loadTelephelyData(telephelyek[0]);
  }
});

// ─── API helper ───
async function api(url, opts) {
  const res = await fetch(url, opts);
  return res.json();
}

// ─── Load data for telephely ───
async function loadTelephelyData(telephelyId) {
  [allMappings, allSzotar] = await Promise.all([
    api(`/api/mappings/${telephelyId}`),
    api(`/api/szotar/${telephelyId}`),
  ]);
  renderMappings();
  renderStats();
  renderTemplates();
}

// ─── Render stats ───
function renderStats() {
  const high = allMappings.filter(m => m.confidence >= 0.8).length;
  const med = allMappings.filter(m => m.confidence >= 0.5 && m.confidence < 0.8).length;
  const low = allMappings.filter(m => m.confidence < 0.5).length;
  document.getElementById('stats').innerHTML = `
    <span class="stat stat-high">🟢 ${high}</span>
    <span class="stat stat-med">🟡 ${med}</span>
    <span class="stat stat-low">🔴 ${low}</span>
  `;
}

// ─── Render mappings table ───
function renderMappings() {
  const search = document.getElementById('searchMappings').value.toLowerCase();
  const tbody = document.getElementById('mappingsBody');

  let filtered = allMappings.filter(m => {
    if (search && !m.atomic_action_slug.includes(search) && !m.szotar_kezeles_name?.toLowerCase().includes(search)) return false;
    if (currentFilter === 'high') return m.confidence >= 0.8;
    if (currentFilter === 'medium') return m.confidence >= 0.5 && m.confidence < 0.8;
    if (currentFilter === 'low') return m.confidence < 0.5;
    if (currentFilter === 'conditions') {
      const cond = JSON.parse(m.conditions || '{}');
      return Object.keys(cond).length > 0;
    }
    return true;
  });

  tbody.innerHTML = filtered.map(m => {
    const cond = JSON.parse(m.conditions || '{}');
    const condKeys = Object.keys(cond);
    const confLevel = m.confidence >= 0.8 ? 'high' : m.confidence >= 0.5 ? 'med' : 'low';
    const confPct = Math.round(m.confidence * 100);
    const action = allActions.find(a => a.slug === m.atomic_action_slug);
    const cat = action?.category || '';

    return `<tr data-id="${m.id}">
      <td class="slug-cell">
        <span class="cat-badge cat-${cat.replace(/_/g, '')}">${catLabel(cat)}</span><br>
        ${m.atomic_action_slug}
      </td>
      <td class="cond-cell">
        ${condKeys.length ? condKeys.map(k => `<span class="cond-tag">${k}=${cond[k]}</span>`).join('') : '<span style="color:#555">—</span>'}
      </td>
      <td class="szotar-cell">
        <span class="szotar-name">${m.szotar_kezeles_name || '⚠ Nincs hozzárendelés'}</span>
      </td>
      <td class="conf-cell">
        <div class="conf-bar-wrap conf-${confLevel}">
          <div class="conf-bar"><div class="conf-bar-fill" style="width:${confPct}%"></div></div>
          <span class="conf-val">${m.confidence.toFixed(2)}</span>
        </div>
      </td>
      <td>
        <span class="status-badge ${m.reviewed ? 'status-reviewed' : 'status-auto'}">${m.reviewed ? '✓ Ellenőrzött' : 'Auto'}</span>
      </td>
      <td>
        <button class="btn-edit" onclick="openModal('${m.id}')">Szerkesztés</button>
      </td>
    </tr>`;
  }).join('');
}

function catLabel(cat) {
  const labels = {
    konzervalo_fogaszat: 'Konzerváló', szajsebeszet: 'Sebészet', fogpotlastan: 'Fogpótlástan',
    parodontologia: 'Parodontológia', diagnosztika: 'Diagnosztika', fogszabalyozas: 'Fogszabályozás',
    konzervalo: 'Konzerváló', implantacio: 'Implantáció', egyeb: 'Egyéb',
  };
  return labels[cat] || cat || '—';
}

// ─── Helper: get all mappings for a slug (generic + variants) ───
function getMappingsForSlug(slug) {
  return allMappings.filter(m => m.atomic_action_slug === slug);
}

// Format condition value: "tooth_region=front" → "front", "brand=nobel" → "nobel"
function formatCondition(m) {
  const cond = JSON.parse(m.conditions || '{}');
  const entries = Object.entries(cond);
  if (!entries.length) return null;
  // Show just the values if single key, else key=val
  return entries.map(([k, v]) => entries.length === 1 ? String(v) : `${k.replace('tooth_','').replace('canal_','')}=${v}`).join(' ');
}

function confDot(conf) {
  const level = conf >= 0.8 ? 'high' : conf >= 0.5 ? 'med' : 'low';
  return `<span class="cdot cdot-${level}">${conf.toFixed(2)}</span>`;
}

// ─── Render templates ───
function renderTemplates() {
  const search = document.getElementById('searchTemplates').value.toLowerCase();
  const grid = document.getElementById('templatesGrid');

  const filtered = allTemplates.filter(t => {
    if (!search) return true;
    const nameHu = t.name_hu || t.nameHu || '';
    const triggers = t.triggers ? (typeof t.triggers === 'string' ? JSON.parse(t.triggers) : t.triggers) : [];
    return nameHu.toLowerCase().includes(search) ||
           (t.slug || '').includes(search) ||
           triggers.some(tr => tr.toLowerCase().includes(search));
  });

  // Group by category
  const groups = {};
  filtered.forEach(t => {
    const cat = t.category || 'egyeb';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  });

  const catOrder = ['konzervalo', 'szajsebeszet', 'implantacio', 'fogpotlastan', 'parodontologia', 'diagnosztika', 'fogszabalyozas', 'egyeb'];

  let html = '';
  for (const cat of catOrder) {
    if (!groups[cat]) continue;
    html += `<div class="cat-section-full">
      <h3 class="cat-heading"><span class="cat-badge cat-${cat.replace(/_/g,'')}">${catLabel(cat)}</span> ${groups[cat].length} protokoll</h3>
    </div>`;

    for (const t of groups[cat]) {
      const nameHu = t.name_hu || t.nameHu || '';
      const triggers = typeof t.triggers === 'string' ? JSON.parse(t.triggers) : (t.triggers || []);
      const visits = typeof t.visits === 'string' ? JSON.parse(t.visits || '[]') : (t.visits || []);
      const atomicActions = typeof t.atomic_actions === 'string' ? JSON.parse(t.atomic_actions || '[]') : (t.atomicActions || t.atomic_actions || []);
      const visitList = visits.length ? visits : [{ visit: 1, name: nameHu, actions: atomicActions }];

      // Build action rows
      let actionsHtml = '';
      for (const v of visitList) {
        if (visitList.length > 1) {
          actionsHtml += `<tr class="visit-sep-row"><td colspan="4"><span class="visit-sep-label">V${v.visit}: ${v.name || ''}</span></td></tr>`;
        }
        for (const slug of (v.actions || [])) {
          const action = allActions.find(a => a.slug === slug);
          const actionName = action?.name_hu || action?.nameHu || slug;
          const mappings = getMappingsForSlug(slug);
          const generic = mappings.find(m => Object.keys(JSON.parse(m.conditions || '{}')).length === 0);
          const variants = mappings.filter(m => Object.keys(JSON.parse(m.conditions || '{}')).length > 0);

          if (!mappings.length) {
            // No mapping at all
            actionsHtml += `<tr class="action-row">
              <td class="ar-dot"><span class="action-dot unmapped"></span></td>
              <td class="ar-name">${actionName}<span class="ar-slug">${slug}</span></td>
              <td class="ar-szotar ar-missing">⚠ Nincs hozzárendelés</td>
              <td class="ar-conf">—</td>
            </tr>`;
          } else if (!variants.length && generic) {
            // Simple: 1 generic mapping, no variants
            actionsHtml += `<tr class="action-row">
              <td class="ar-dot"><span class="action-dot mapped"></span></td>
              <td class="ar-name">${actionName}<span class="ar-slug">${slug}</span></td>
              <td class="ar-szotar">${generic.szotar_kezeles_name}</td>
              <td class="ar-conf">${confDot(generic.confidence)}</td>
            </tr>`;
          } else {
            // Has variants — show each on its own row
            const firstMapping = generic || variants[0];
            const allRows = generic ? [generic, ...variants] : variants;
            actionsHtml += `<tr class="action-row action-row-group">
              <td class="ar-dot" rowspan="${allRows.length}"><span class="action-dot mapped"></span></td>
              <td class="ar-name" rowspan="${allRows.length}">${actionName}<span class="ar-slug">${slug}</span><span class="variant-badge">${variants.length} variáns</span></td>
              <td class="ar-szotar">${allRows[0].szotar_kezeles_name}<span class="ar-cond-tag">${formatCondition(allRows[0]) || 'alap'}</span></td>
              <td class="ar-conf">${confDot(allRows[0].confidence)}</td>
            </tr>`;
            for (let vi = 1; vi < allRows.length; vi++) {
              actionsHtml += `<tr class="action-row action-row-variant">
                <td class="ar-szotar">${allRows[vi].szotar_kezeles_name}<span class="ar-cond-tag">${formatCondition(allRows[vi]) || 'alap'}</span></td>
                <td class="ar-conf">${confDot(allRows[vi].confidence)}</td>
              </tr>`;
            }
          }
        }
      }

      html += `<div class="tpl-card-wide" data-id="${t.id || ''}">
        <div class="tpl-top">
          <div class="tpl-meta">
            <h3>${nameHu}</h3>
            <span class="tpl-slug">${t.slug}</span>
            <div class="tpl-triggers">${triggers.map(tr => `<span class="trigger-tag">${tr}</span>`).join('')}</div>
          </div>
          <div class="template-actions">
            <button class="btn-edit-sm" onclick="openTplModal('${t.id}')">✏️</button>
            <button class="btn-del-sm" onclick="deleteTemplate('${t.id}', '${escHtml(nameHu)}')">🗑️</button>
          </div>
        </div>
        <table class="tpl-actions-table">
          <thead><tr><th></th><th>Akció</th><th>Szótár tétel</th><th>Conf</th></tr></thead>
          <tbody>${actionsHtml}</tbody>
        </table>
      </div>`;
    }
  }

  grid.innerHTML = html;
}

// ═══════ MAPPING EDIT MODAL ═══════

function openModal(mappingId) {
  editingMapping = allMappings.find(m => m.id === mappingId);
  if (!editingMapping) return;
  selectedSzotarId = null;
  document.getElementById('modalSlug').textContent = editingMapping.atomic_action_slug;
  document.getElementById('modalCurrent').textContent = editingMapping.szotar_kezeles_name || '(nincs)';
  document.getElementById('modalSearch').value = '';
  document.getElementById('modalSave').disabled = true;
  document.getElementById('editModal').classList.add('open');
  renderModalList();
  document.getElementById('modalSearch').focus();
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  editingMapping = null;
  selectedSzotarId = null;
}

function renderModalList() {
  const search = document.getElementById('modalSearch').value.toLowerCase();
  const list = document.getElementById('modalList');
  let items = allSzotar;
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search));

  list.innerHTML = items.slice(0, 100).map(item => {
    const isSelected = item.id === selectedSzotarId;
    const isCurrent = editingMapping && item.id === editingMapping.szotar_kezeles_id;
    return `<div class="modal-list-item ${isSelected ? 'selected' : ''}"
                 data-id="${item.id}" data-name="${escHtml(item.name)}"
                 onclick="selectSzotarItem('${item.id}', this)"
                 style="${isCurrent ? 'background:rgba(74,222,128,0.08);' : ''}">
      ${item.name}
      ${isCurrent ? '<span style="margin-left:auto;font-size:10px;color:var(--green);">JELENLEGI</span>' : ''}
    </div>`;
  }).join('');
  if (items.length > 100) {
    list.innerHTML += `<div style="padding:10px;color:var(--text-dim);font-size:12px;text-align:center;">+ ${items.length - 100} további tétel</div>`;
  }
}

function selectSzotarItem(id, el) {
  selectedSzotarId = id;
  document.querySelectorAll('.modal-list-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('modalSave').disabled = false;
}

async function saveMapping() {
  if (!editingMapping || !selectedSzotarId) return;
  const item = allSzotar.find(i => i.id === selectedSzotarId);
  if (!item) return;
  await api(`/api/mappings/${editingMapping.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ szotar_kezeles_id: item.id, szotar_kezeles_name: item.name, confidence: 1.0, reviewed: 1 }),
  });
  const idx = allMappings.findIndex(m => m.id === editingMapping.id);
  if (idx !== -1) {
    allMappings[idx].szotar_kezeles_id = item.id;
    allMappings[idx].szotar_kezeles_name = item.name;
    allMappings[idx].confidence = 1.0;
    allMappings[idx].reviewed = 1;
  }
  closeModal();
  renderMappings(); renderStats(); renderTemplates();
  showToast(`✓ ${editingMapping.atomic_action_slug} → "${item.name}"`);
}

// ═══════ TEMPLATE EDIT MODAL ═══════

let editingTemplate = null;
let editVisits = [];

function openTplModal(templateId) {
  editingTemplate = allTemplates.find(t => t.id === templateId);
  if (!editingTemplate) return;

  const nameHu = editingTemplate.name_hu || editingTemplate.nameHu || '';
  const triggers = typeof editingTemplate.triggers === 'string' ? JSON.parse(editingTemplate.triggers) : (editingTemplate.triggers || []);
  const visits = typeof editingTemplate.visits === 'string' ? JSON.parse(editingTemplate.visits || '[]') : (editingTemplate.visits || []);
  const atomicActions = typeof editingTemplate.atomic_actions === 'string' ? JSON.parse(editingTemplate.atomic_actions || '[]') : (editingTemplate.atomicActions || []);

  editVisits = visits.length ? JSON.parse(JSON.stringify(visits)) : [{ visit: 1, name: nameHu, actions: [...atomicActions] }];

  document.getElementById('tplNameInput').value = nameHu;
  document.getElementById('tplTriggersInput').value = triggers.join(', ');
  document.getElementById('tplCategorySelect').value = editingTemplate.category || 'egyeb';
  document.getElementById('tplDescInput').value = editingTemplate.description || '';
  document.getElementById('tplModalTitle').textContent = 'Protokoll szerkesztése';
  document.getElementById('tplEditModal').classList.add('open');
  renderVisitsEditor();
}

function createNewTemplate() {
  editingTemplate = { id: null, slug: '', name_hu: '', category: 'egyeb', triggers: '[]', visits: '[]', description: '' };
  editVisits = [{ visit: 1, name: 'Vizit 1', actions: [] }];
  document.getElementById('tplNameInput').value = '';
  document.getElementById('tplTriggersInput').value = '';
  document.getElementById('tplCategorySelect').value = 'egyeb';
  document.getElementById('tplDescInput').value = '';
  document.getElementById('tplModalTitle').textContent = 'Új protokoll';
  document.getElementById('tplEditModal').classList.add('open');
  renderVisitsEditor();
}

function closeTplModal() {
  document.getElementById('tplEditModal').classList.remove('open');
  editingTemplate = null;
  editVisits = [];
}

function renderVisitsEditor() {
  const container = document.getElementById('visitsEditor');

  container.innerHTML = editVisits.map((v, vi) => `
    <div class="visit-editor" data-visit-idx="${vi}">
      <div class="visit-editor-header">
        <span class="visit-num">V${vi + 1}</span>
        <input type="text" class="visit-name-input" value="${escHtml(v.name || '')}" placeholder="Vizit neve…"
               onchange="editVisits[${vi}].name = this.value" />
        ${editVisits.length > 1 ? `<button class="btn-del-visit" onclick="removeVisit(${vi})">✕</button>` : ''}
      </div>
      <div class="visit-actions-list" id="visitActions-${vi}">
        ${(v.actions || []).map((slug, ai) => {
          const action = allActions.find(a => a.slug === slug);
          const actionName = action?.name_hu || action?.nameHu || slug;
          return `<div class="visit-action-item" data-slug="${slug}">
            <span class="action-dot mapped"></span>
            <span class="va-name">${actionName}</span>
            <span class="va-slug">${slug}</span>
            <div class="va-btns">
              ${ai > 0 ? `<button class="va-btn" onclick="moveAction(${vi},${ai},-1)">↑</button>` : ''}
              ${ai < v.actions.length - 1 ? `<button class="va-btn" onclick="moveAction(${vi},${ai},1)">↓</button>` : ''}
              <button class="va-btn va-del" onclick="removeAction(${vi},${ai})">✕</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="add-action-row">
        <select class="add-action-select" id="addActionSelect-${vi}">
          <option value="">+ Akció hozzáadása…</option>
          ${allActions.map(a => `<option value="${a.slug}">${a.name_hu || a.nameHu} (${a.slug})</option>`).join('')}
        </select>
        <button class="btn-add-action" onclick="addAction(${vi})">Hozzáad</button>
      </div>
    </div>
  `).join('');
}

function addVisit() {
  editVisits.push({ visit: editVisits.length + 1, name: `Vizit ${editVisits.length + 1}`, actions: [] });
  renderVisitsEditor();
}

function removeVisit(vi) {
  if (editVisits.length <= 1) return;
  editVisits.splice(vi, 1);
  editVisits.forEach((v, i) => v.visit = i + 1);
  renderVisitsEditor();
}

function addAction(vi) {
  const sel = document.getElementById(`addActionSelect-${vi}`);
  if (!sel.value) return;
  editVisits[vi].actions.push(sel.value);
  sel.value = '';
  renderVisitsEditor();
}

function removeAction(vi, ai) {
  editVisits[vi].actions.splice(ai, 1);
  renderVisitsEditor();
}

function moveAction(vi, ai, dir) {
  const arr = editVisits[vi].actions;
  const newIdx = ai + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[ai], arr[newIdx]] = [arr[newIdx], arr[ai]];
  renderVisitsEditor();
}

async function saveTemplate() {
  const name_hu = document.getElementById('tplNameInput').value.trim();
  if (!name_hu) { showToast('Név kötelező!'); return; }

  const triggersStr = document.getElementById('tplTriggersInput').value;
  const triggers = triggersStr.split(',').map(s => s.trim()).filter(Boolean);
  const category = document.getElementById('tplCategorySelect').value;
  const description = document.getElementById('tplDescInput').value.trim() || null;

  const body = { name_hu, category, triggers, visits: editVisits, description };

  if (editingTemplate.id) {
    await api(`/api/templates/${editingTemplate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast(`✓ "${name_hu}" frissítve`);
  } else {
    const slug = name_hu.toLowerCase().replace(/[^a-záéíóöőúüű0-9]+/g, '_').replace(/_+$/, '');
    await api('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, slug }),
    });
    showToast(`✓ "${name_hu}" létrehozva`);
  }

  closeTplModal();
  allTemplates = await api('/api/templates');
  renderTemplates();
}

async function deleteTemplate(id, name) {
  if (!confirm(`Biztosan törlöd: "${name}"?`)) return;
  await api(`/api/templates/${id}`, { method: 'DELETE' });
  allTemplates = await api('/api/templates');
  renderTemplates();
  showToast(`🗑️ "${name}" törölve`);
}

// ─── Utils ───
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escHtml(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
