/* ═══════════════════════════════════════
   editor.js — Jadwal Editor Logic
   ═══════════════════════════════════════ */

'use strict';

/* ── Color Options ── */
const WARNA_OPTIONS = [
  { id: 's-pjok',       bg: '#E8F5E9', label: 'Hijau' },
  { id: 's-pkwu',       bg: '#FFF8E1', label: 'Kuning' },
  { id: 's-agama',      bg: '#F3E5F5', label: 'Ungu' },
  { id: 's-biologi',    bg: '#E3F2FD', label: 'Biru' },
  { id: 's-mat-wajib',  bg: '#FBE9E7', label: 'Merah' },
  { id: 's-mat-tl',     bg: '#FCE4EC', label: 'Pink' },
  { id: 's-bk',         bg: '#F1F8E9', label: 'Lime' },
  { id: 's-pancasila',  bg: '#E0F2F1', label: 'Teal' },
  { id: 's-inggris',    bg: '#E8EAF6', label: 'Indigo' },
  { id: 's-jawa',       bg: '#FFF3E0', label: 'Oranye' },
  { id: 's-seni',       bg: '#FCE4EC', label: 'Rose' },
  { id: 's-indonesia',  bg: '#E8F5E9', label: 'Sage' },
  { id: 's-kimia',      bg: '#E0F7FA', label: 'Cyan' },
  { id: 's-sejarah',    bg: '#FFF8E1', label: 'Amber' },
  { id: 's-informatika',bg: '#EDE7F6', label: 'Lavender' },
  { id: 's-upacara',    bg: '#F9FBE7', label: 'Lime Gelap' },
];

/* ── State ── */
let schedule = {
  kelas: 'XI D',
  sekolah: 'SMAN 2 Trenggalek',
  periode: 'Per Januari',
  hari: []
};
let activeDayIdx = 0;

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Load default XI D data
  schedule = buildDefaultSchedule();

  bindInfoFields();
  renderDayTabs();
  renderActiveDay();
  refreshXMLPreview();

  document.getElementById('btnAddLesson').addEventListener('click', () => addSlot('lesson'));
  document.getElementById('btnAddBreak').addEventListener('click', () => addSlot('break'));
  document.getElementById('btnAddDay').addEventListener('click', addDay);
  document.getElementById('btnDeleteDay').addEventListener('click', deleteActiveDay);
  document.getElementById('btnDownload').addEventListener('click', downloadXML);
  document.getElementById('btnPreview').addEventListener('click', previewInApp);
  document.getElementById('btnImportXML').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', e => {
    importXML(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('activeDayName').addEventListener('input', e => {
    schedule.hari[activeDayIdx].nama = e.target.value;
    refreshDayTab(activeDayIdx);
    refreshXMLPreview();
  });
  document.getElementById('activeDaySeragam').addEventListener('input', e => {
    schedule.hari[activeDayIdx].seragam = e.target.value;
    refreshXMLPreview();
  });
});

/* ════════════════════════════════════════
   DEFAULT SCHEDULE (XI D)
   ════════════════════════════════════════ */

function buildDefaultSchedule() {
  return {
    kelas: 'XI D',
    sekolah: 'SMAN 2 Trenggalek',
    periode: 'Per Januari',
    hari: [
      {
        nama: 'Senin', seragam: 'Abu-Putih',
        slots: [
          { type:'lesson', jam:'1',    mulai:'07:00', selesai:'07:40', mapel:'Upacara Bendera',  guru:'',                            warna:'s-upacara' },
          { type:'lesson', jam:'2',    mulai:'07:40', selesai:'08:20', mapel:'PJOK (Kesehatan)', guru:'Wahyu Kholida M., S.Pd',       warna:'s-pjok' },
          { type:'lesson', jam:'3-4',  mulai:'08:20', selesai:'09:40', mapel:'PKWU',             guru:'Mayasari Oktafa R., S.Pd.',    warna:'s-pkwu' },
          { type:'break',              mulai:'09:40', selesai:'09:50', label:'Istirahat I' },
          { type:'lesson', jam:'5',    mulai:'09:50', selesai:'10:30', mapel:'Pend. Agama Islam', guru:'Abdul Aziz Al Barqy, S.Pd.I.', warna:'s-agama' },
          { type:'lesson', jam:'6-7',  mulai:'10:30', selesai:'11:50', mapel:'Biologi',           guru:'Budiyono, S.Pd., M.Pd.',       warna:'s-biologi' },
          { type:'break',              mulai:'11:50', selesai:'13:10', label:'Istirahat II + MBG' },
          { type:'lesson', jam:'8',    mulai:'13:10', selesai:'13:50', mapel:'Biologi',           guru:'Budiyono, S.Pd., M.Pd.',       warna:'s-biologi' },
          { type:'lesson', jam:'9-10', mulai:'13:50', selesai:'15:10', mapel:'Matematika Wajib', guru:'Rully Sulistyani, S.Pd., M.Pd.', warna:'s-mat-wajib' },
        ]
      },
      {
        nama: 'Selasa', seragam: 'Abu-Putih',
        slots: [
          { type:'lesson', jam:'1-3',  mulai:'07:00', selesai:'09:00', mapel:'Matematika TL',         guru:'Siti Ambari, S.Pd.',           warna:'s-mat-tl' },
          { type:'lesson', jam:'4',    mulai:'09:00', selesai:'09:40', mapel:'Bimbingan Konseling',   guru:'Erik Reffia Rini, S.Pd',       warna:'s-bk' },
          { type:'break',              mulai:'09:40', selesai:'09:50', label:'Istirahat I' },
          { type:'lesson', jam:'5-6',  mulai:'09:50', selesai:'11:10', mapel:'Pend. Pancasila',       guru:'Vika Apriliani, S.Pd.',         warna:'s-pancasila' },
          { type:'lesson', jam:'7',    mulai:'11:10', selesai:'11:50', mapel:'Bahasa Inggris',        guru:'Aris Stiawan, S.Pd.',           warna:'s-inggris' },
          { type:'break',              mulai:'11:50', selesai:'13:10', label:'Istirahat II + MBG' },
          { type:'lesson', jam:'8',    mulai:'13:10', selesai:'13:50', mapel:'Bahasa Inggris',        guru:'Aris Stiawan, S.Pd.',           warna:'s-inggris' },
          { type:'lesson', jam:'9-10', mulai:'13:50', selesai:'15:10', mapel:'Bahasa Jawa',           guru:'Ika Sulistiani, S.Pd.',         warna:'s-jawa' },
        ]
      },
      {
        nama: 'Rabu', seragam: 'Seragam Khas',
        slots: [
          { type:'lesson', jam:'1-2',  mulai:'07:00', selesai:'08:20', mapel:'Matematika TL',         guru:'Siti Ambari, S.Pd.',            warna:'s-mat-tl' },
          { type:'lesson', jam:'3-4',  mulai:'08:20', selesai:'09:40', mapel:'Biologi',               guru:'Budiyono, S.Pd., M.Pd.',        warna:'s-biologi' },
          { type:'break',              mulai:'09:40', selesai:'09:50', label:'Istirahat I' },
          { type:'lesson', jam:'5-6',  mulai:'09:50', selesai:'11:10', mapel:'Seni Tari',             guru:'Fresti Rusrianur I., S.Pd.',    warna:'s-seni' },
          { type:'lesson', jam:'7',    mulai:'11:10', selesai:'11:50', mapel:'Pend. Agama Islam',     guru:'Abdul Aziz Al Barqy, S.Pd.I.',  warna:'s-agama' },
          { type:'break',              mulai:'11:50', selesai:'13:10', label:'Istirahat II + MBG' },
          { type:'lesson', jam:'8',    mulai:'13:10', selesai:'13:50', mapel:'Pend. Agama Islam',     guru:'Abdul Aziz Al Barqy, S.Pd.I.',  warna:'s-agama' },
          { type:'lesson', jam:'9-10', mulai:'13:50', selesai:'15:10', mapel:'Bahasa Indonesia',     guru:'Pingkan Hendrayana, M.Pd.',     warna:'s-indonesia' },
        ]
      },
      {
        nama: 'Kamis', seragam: 'Olahraga + Seragam Khas',
        slots: [
          { type:'lesson', jam:'1-2',  mulai:'07:00', selesai:'08:20', mapel:'PJOK (Olahraga)',       guru:'Wahyu Kholida M., S.Pd.',       warna:'s-pjok' },
          { type:'lesson', jam:'3-4',  mulai:'08:20', selesai:'09:40', mapel:'Matematika Wajib',     guru:'Rully Sulistyani, S.Pd., M.Pd.', warna:'s-mat-wajib' },
          { type:'break',              mulai:'09:40', selesai:'09:50', label:'Istirahat I' },
          { type:'lesson', jam:'5-6',  mulai:'09:50', selesai:'11:10', mapel:'Kimia',                guru:'Mimin Setyarini, S.Pd.',        warna:'s-kimia' },
          { type:'lesson', jam:'7',    mulai:'11:10', selesai:'11:50', mapel:'Sejarah',              guru:'Luluk Ustadiatu M., S.Pd.',     warna:'s-sejarah' },
          { type:'break',              mulai:'11:50', selesai:'13:10', label:'Istirahat II + MBG' },
          { type:'lesson', jam:'8',    mulai:'13:10', selesai:'13:50', mapel:'Sejarah',              guru:'Luluk Ustadiatu M., S.Pd.',     warna:'s-sejarah' },
          { type:'lesson', jam:'9-10', mulai:'13:50', selesai:'15:10', mapel:'Informatika',          guru:'Vigor Wahyu S., S.Kom.',        warna:'s-informatika' },
        ]
      },
      {
        nama: 'Jumat', seragam: 'Pramuka',
        slots: [
          { type:'lesson', jam:'1',    mulai:'07:00', selesai:'07:40', mapel:'Bahasa Inggris',        guru:'Aris Stiawan, S.Pd.',           warna:'s-inggris' },
          { type:'lesson', jam:'2-3',  mulai:'07:40', selesai:'09:00', mapel:'Bahasa Indonesia',     guru:'Pingkan Hendrayana, M.Pd.',     warna:'s-indonesia' },
          { type:'lesson', jam:'4',    mulai:'09:00', selesai:'09:40', mapel:'Kimia',                guru:'Mimin Setyarini, S.Pd.',        warna:'s-kimia' },
          { type:'break',              mulai:'09:40', selesai:'09:50', label:'Istirahat I' },
          { type:'lesson', jam:'5-6',  mulai:'09:50', selesai:'11:10', mapel:'Kimia',                guru:'Mimin Setyarini, S.Pd.',        warna:'s-kimia' },
          { type:'break',              mulai:'11:10', selesai:'12:50', label:'Istirahat II + MBG' },
          { type:'lesson', jam:'7-10', mulai:'12:50', selesai:'15:10', mapel:'Informatika',          guru:'Vigor Wahyu S., S.Kom.',        warna:'s-informatika' },
        ]
      },
    ]
  };
}

/* ════════════════════════════════════════
   INFO FIELDS
   ════════════════════════════════════════ */

function bindInfoFields() {
  ['Kelas','Sekolah','Periode'].forEach(f => {
    const el = document.getElementById(`info${f}`);
    if (!el) return;
    el.value = schedule[f.toLowerCase()];
    el.addEventListener('input', () => {
      schedule[f.toLowerCase()] = el.value;
      updateEditorSubtitle();
      refreshXMLPreview();
    });
  });
  updateEditorSubtitle();
}

function updateEditorSubtitle() {
  const el = document.getElementById('editorSubtitle');
  if (el) el.textContent = `${schedule.periode} • ${schedule.sekolah} — Kelas ${schedule.kelas}`;
}

/* ════════════════════════════════════════
   DAY TABS
   ════════════════════════════════════════ */

function renderDayTabs() {
  const container = document.getElementById('editorDayTabs');
  container.innerHTML = '';
  schedule.hari.forEach((h, i) => {
    const btn = document.createElement('button');
    btn.className = 'editor-day-tab' + (i === activeDayIdx ? ' active' : '');
    btn.textContent = h.nama.slice(0, 3);
    btn.addEventListener('click', () => { activeDayIdx = i; renderDayTabs(); renderActiveDay(); });
    container.appendChild(btn);
  });
}

function refreshDayTab(idx) {
  const tabs = document.querySelectorAll('.editor-day-tab');
  if (tabs[idx]) tabs[idx].textContent = schedule.hari[idx].nama.slice(0, 3);
}

function renderActiveDay() {
  const day = schedule.hari[activeDayIdx];
  if (!day) return;

  document.getElementById('activeDayName').value = day.nama;
  document.getElementById('activeDaySeragam').value = day.seragam || '';
  renderSlots();
}

/* ════════════════════════════════════════
   SLOTS
   ════════════════════════════════════════ */

function renderSlots() {
  const list = document.getElementById('slotList');
  list.innerHTML = '';

  const day = schedule.hari[activeDayIdx];
  if (!day) return;

  day.slots.forEach((slot, idx) => {
    list.appendChild(buildSlotEl(slot, idx));
  });
}

function buildSlotEl(slot, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'slot-item';
  wrap.dataset.idx = idx;

  const isBreak = slot.type === 'break';
  const chipClass = isBreak ? 'chip-break' : 'chip-lesson';
  const chipLabel = isBreak ? 'Istirahat' : 'JP ' + (slot.jam || '?');
  const preview   = isBreak ? (slot.label || 'Istirahat') : (slot.mapel || 'Mapel baru');
  const timeStr   = `${slot.mulai || '00:00'} – ${slot.selesai || '00:00'}`;

  wrap.innerHTML = `
    <div class="slot-item-header" data-idx="${idx}">
      <span class="material-icons-round slot-drag-handle">drag_indicator</span>
      <span class="slot-type-chip ${chipClass}">${chipLabel}</span>
      <div style="flex:1;min-width:0;">
        <div class="slot-preview">${escHtml(preview)}</div>
        <div class="slot-preview-time">${timeStr}</div>
      </div>
      <div class="slot-actions">
        <button class="slot-btn" data-action="toggle" data-idx="${idx}" title="Edit">
          <span class="material-icons-round">expand_more</span>
        </button>
        <button class="slot-btn delete" data-action="delete" data-idx="${idx}" title="Hapus">
          <span class="material-icons-round">delete_outline</span>
        </button>
      </div>
    </div>
    <div class="slot-body hidden" id="slotBody-${idx}">
      ${buildSlotBody(slot, idx)}
    </div>
  `;

  wrap.querySelector('[data-action="toggle"]').addEventListener('click', e => {
    e.stopPropagation();
    toggleSlotBody(idx);
  });
  wrap.querySelector('.slot-item-header').addEventListener('click', () => toggleSlotBody(idx));
  wrap.querySelector('[data-action="delete"]').addEventListener('click', e => {
    e.stopPropagation();
    deleteSlot(idx);
  });

  // Bind inputs inside body
  setTimeout(() => bindSlotInputs(idx), 0);

  return wrap;
}

function buildSlotBody(slot, idx) {
  if (slot.type === 'break') {
    return `
      <div style="height:10px;"></div>
      <div class="slot-row full">
        <div><div class="field-label">Label Istirahat</div>
          <input class="field-input" type="text" data-field="label" data-idx="${idx}" value="${escHtml(slot.label || '')}" placeholder="Istirahat I"></div>
      </div>
      <div class="slot-row">
        <div><div class="field-label">Mulai</div>
          <input class="field-input" type="time" data-field="mulai" data-idx="${idx}" value="${slot.mulai || ''}"></div>
        <div><div class="field-label">Selesai</div>
          <input class="field-input" type="time" data-field="selesai" data-idx="${idx}" value="${slot.selesai || ''}"></div>
      </div>`;
  }

  const colorPicker = WARNA_OPTIONS.map(c =>
    `<div class="color-chip ${slot.warna === c.id ? 'selected' : ''}"
      style="background:${c.bg};"
      data-warna="${c.id}" data-idx="${idx}"
      title="${c.label}">${c.label.slice(0,3)}</div>`
  ).join('');

  return `
    <div style="height:10px;"></div>
    <div class="slot-row full">
      <div><div class="field-label">Nama Mapel</div>
        <input class="field-input" type="text" data-field="mapel" data-idx="${idx}" value="${escHtml(slot.mapel || '')}" placeholder="Nama Mapel"></div>
    </div>
    <div class="slot-row full">
      <div><div class="field-label">Guru</div>
        <input class="field-input" type="text" data-field="guru" data-idx="${idx}" value="${escHtml(slot.guru || '')}" placeholder="Nama Guru"></div>
    </div>
    <div class="slot-row">
      <div><div class="field-label">Jam (JP)</div>
        <input class="field-input" type="text" data-field="jam" data-idx="${idx}" value="${escHtml(slot.jam || '')}" placeholder="1 atau 3-4"></div>
      <div><div class="field-label">Warna</div>
        <input class="field-input" type="text" data-field="warna" data-idx="${idx}" value="${escHtml(slot.warna || 's-default')}" placeholder="s-biologi"></div>
    </div>
    <div class="slot-row">
      <div><div class="field-label">Mulai</div>
        <input class="field-input" type="time" data-field="mulai" data-idx="${idx}" value="${slot.mulai || ''}"></div>
      <div><div class="field-label">Selesai</div>
        <input class="field-input" type="time" data-field="selesai" data-idx="${idx}" value="${slot.selesai || ''}"></div>
    </div>
    <div><div class="field-label" style="margin-bottom:6px;">Warna Cepat</div>
      <div class="color-grid">${colorPicker}</div></div>`;
}

function bindSlotInputs(idx) {
  // Text inputs
  document.querySelectorAll(`[data-field][data-idx="${idx}"]`).forEach(el => {
    el.addEventListener('input', () => {
      schedule.hari[activeDayIdx].slots[idx][el.dataset.field] = el.value;
      refreshSlotPreview(idx);
      refreshXMLPreview();
    });
  });

  // Color chips
  document.querySelectorAll(`.color-chip[data-idx="${idx}"]`).forEach(chip => {
    chip.addEventListener('click', () => {
      const warnaInput = document.querySelector(`input[data-field="warna"][data-idx="${idx}"]`);
      if (warnaInput) warnaInput.value = chip.dataset.warna;
      schedule.hari[activeDayIdx].slots[idx].warna = chip.dataset.warna;
      document.querySelectorAll(`.color-chip[data-idx="${idx}"]`).forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      refreshXMLPreview();
    });
  });
}

function toggleSlotBody(idx) {
  const body = document.getElementById(`slotBody-${idx}`);
  const btn  = document.querySelector(`[data-action="toggle"][data-idx="${idx}"] .material-icons-round`);
  if (!body) return;
  const isHidden = body.classList.toggle('hidden');
  if (btn) btn.textContent = isHidden ? 'expand_more' : 'expand_less';
}

function refreshSlotPreview(idx) {
  const slot = schedule.hari[activeDayIdx].slots[idx];
  const item = document.querySelector(`.slot-item[data-idx="${idx}"]`);
  if (!item) return;
  const isBreak = slot.type === 'break';
  item.querySelector('.slot-preview').textContent =
    isBreak ? (slot.label || 'Istirahat') : (slot.mapel || 'Mapel baru');
  item.querySelector('.slot-preview-time').textContent =
    `${slot.mulai || '00:00'} – ${slot.selesai || '00:00'}`;
  const chip = item.querySelector('.slot-type-chip');
  chip.textContent = isBreak ? 'Istirahat' : 'JP ' + (slot.jam || '?');
}

function addSlot(type) {
  const day = schedule.hari[activeDayIdx];
  if (!day) return;
  if (type === 'break') {
    day.slots.push({ type: 'break', label: 'Istirahat', mulai: '09:40', selesai: '09:50' });
  } else {
    day.slots.push({ type: 'lesson', jam: '1', mulai: '07:00', selesai: '07:40', mapel: 'Mapel Baru', guru: '', warna: 's-default' });
  }
  renderSlots();
  refreshXMLPreview();
  // Auto-open last slot
  const last = day.slots.length - 1;
  setTimeout(() => toggleSlotBody(last), 50);
  showToast('Slot ditambahkan');
}

function deleteSlot(idx) {
  const day = schedule.hari[activeDayIdx];
  if (!day || day.slots.length <= 1) { showToast('Minimal 1 slot'); return; }
  day.slots.splice(idx, 1);
  renderSlots();
  refreshXMLPreview();
}

/* ════════════════════════════════════════
   DAY MANAGEMENT
   ════════════════════════════════════════ */

function addDay() {
  schedule.hari.push({
    nama: 'Hari Baru',
    seragam: '',
    slots: [
      { type: 'lesson', jam: '1', mulai: '07:00', selesai: '07:40', mapel: 'Mapel 1', guru: '', warna: 's-default' },
      { type: 'break',             mulai: '09:40', selesai: '09:50', label: 'Istirahat I' },
    ]
  });
  activeDayIdx = schedule.hari.length - 1;
  renderDayTabs();
  renderActiveDay();
  refreshXMLPreview();
  showToast('Hari baru ditambahkan');
}

function deleteActiveDay() {
  if (schedule.hari.length <= 1) { showToast('Minimal 1 hari'); return; }
  schedule.hari.splice(activeDayIdx, 1);
  activeDayIdx = Math.max(0, activeDayIdx - 1);
  renderDayTabs();
  renderActiveDay();
  refreshXMLPreview();
  showToast('Hari dihapus');
}

/* ════════════════════════════════════════
   XML GENERATION
   ════════════════════════════════════════ */

function generateXML() {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<jadwal>\n`;
  xml += `  <info>\n`;
  xml += `    <kelas>${escXml(schedule.kelas)}</kelas>\n`;
  xml += `    <sekolah>${escXml(schedule.sekolah)}</sekolah>\n`;
  xml += `    <periode>${escXml(schedule.periode)}</periode>\n`;
  xml += `  </info>\n\n`;

  schedule.hari.forEach(h => {
    xml += `  <hari nama="${escXml(h.nama)}" seragam="${escXml(h.seragam || '')}">\n`;
    h.slots.forEach(s => {
      if (s.type === 'break') {
        xml += `    <slot type="break" mulai="${s.mulai}" selesai="${s.selesai}" label="${escXml(s.label || 'Istirahat')}"/>\n`;
      } else {
        xml += `    <slot type="lesson" jam="${escXml(s.jam || '')}" mulai="${s.mulai}" selesai="${s.selesai}" mapel="${escXml(s.mapel || '')}" guru="${escXml(s.guru || '')}" warna="${s.warna || 's-default'}"/>\n`;
      }
    });
    xml += `  </hari>\n\n`;
  });

  xml += `</jadwal>`;
  return xml;
}

function refreshXMLPreview() {
  const el = document.getElementById('xmlPreview');
  if (el) el.textContent = generateXML();
}

function downloadXML() {
  const xml = generateXML();
  const blob = new Blob([xml], { type: 'application/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const safeName = (schedule.kelas || 'jadwal').replace(/\s+/g, '_').toLowerCase();
  a.download = `jadwal_${safeName}.xml`;
  a.click();
  showToast('XML berhasil diunduh');
}

function previewInApp() {
  const xml = generateXML();
  const b64 = btoa(unescape(encodeURIComponent(xml)));
  window.open(`index.html?data=${b64}`, '_blank');
}

/* ════════════════════════════════════════
   XML IMPORT
   ════════════════════════════════════════ */

function importXML(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(e.target.result, 'application/xml');
      const info = doc.querySelector('info');
      schedule.kelas   = info?.querySelector('kelas')?.textContent   || 'Kelas';
      schedule.sekolah = info?.querySelector('sekolah')?.textContent || 'Sekolah';
      schedule.periode = info?.querySelector('periode')?.textContent || '';
      schedule.hari = [];

      doc.querySelectorAll('hari').forEach(h => {
        const slots = [];
        h.querySelectorAll('slot').forEach(s => {
          if (s.getAttribute('type') === 'break') {
            slots.push({ type:'break', mulai: s.getAttribute('mulai'), selesai: s.getAttribute('selesai'), label: s.getAttribute('label') });
          } else {
            slots.push({ type:'lesson', jam: s.getAttribute('jam'), mulai: s.getAttribute('mulai'), selesai: s.getAttribute('selesai'), mapel: s.getAttribute('mapel'), guru: s.getAttribute('guru'), warna: s.getAttribute('warna') || 's-default' });
          }
        });
        schedule.hari.push({ nama: h.getAttribute('nama'), seragam: h.getAttribute('seragam') || '', slots });
      });

      // Rebind info fields
      document.getElementById('infoKelas').value   = schedule.kelas;
      document.getElementById('infoSekolah').value = schedule.sekolah;
      document.getElementById('infoPeriode').value = schedule.periode;
      activeDayIdx = 0;
      updateEditorSubtitle();
      renderDayTabs();
      renderActiveDay();
      refreshXMLPreview();
      showToast('XML berhasil diimpor');
    } catch (err) {
      showToast('Gagal import: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escXml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
