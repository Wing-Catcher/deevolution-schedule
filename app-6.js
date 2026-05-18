/* ═══════════════════════════════════════
   app.js — Jadwal App · Main Logic
   ═══════════════════════════════════════ */

'use strict';

/* ── State ── */
let SCHEDULE_DATA = null;   // parsed from XML
let currentIdx = 0;
let clockTimer = null;

// Per-day upacara/apel toggle state: key = day index, value = boolean (true = ON)
const upacaraState = {};

/* ── Upacara detection ── */
function isUpacaraSlot(slot) {
  if (slot.type !== 'lesson') return false;
  const m = (slot.mapel || '').toLowerCase();
  return m.includes('upacara') || m.includes('apel');
}

// Returns index of upacara/apel slot in day's slots array, or -1
function findUpacaraIdx(slots) {
  return slots.findIndex(isUpacaraSlot);
}

// Is Senin (first day named 'Senin')?
function isSenin(dayIdx) {
  return SCHEDULE_DATA?.hari[dayIdx]?.nama?.toLowerCase() === 'senin';
}

// Get effective toggle value for a day
function getUpacaraOn(dayIdx) {
  if (dayIdx in upacaraState) return upacaraState[dayIdx];
  // Senin default ON, others default OFF
  return isSenin(dayIdx);
}

/**
 * Compute the effective slots to display for a day.
 *
 * SENIN (has Upacara slot in XML, default ON):
 *   ON  → show all slots as-is
 *   OFF → remove upacara, shift lesson times in the same segment forward
 *
 * OTHER DAYS (no upacara slot, default OFF):
 *   OFF → show all slots as-is
 *   ON  → inject an Apel slot at the start (same duration as Senin's upacara = 40 min),
 *         push lesson times in the first segment back by that duration
 */
function computeEffectiveSlots(dayIdx) {
  const day = SCHEDULE_DATA.hari[dayIdx];
  if (!day) return [];
  const slots = day.slots;
  const upacaraOn  = getUpacaraOn(dayIdx);
  const upacaraIdx = findUpacaraIdx(slots);

  // ── Case A: day HAS upacara slot (Senin) ──
  if (upacaraIdx !== -1) {
    if (upacaraOn) {
      return slots.map(s => ({ ...s }));
    } else {
      // OFF: remove upacara.
      // Lessons in the first segment are chained from upacara's mulai.
      // The LAST lesson before the first break absorbs any remaining slack
      // so there is zero gap between it and the break.
      const uSlot = slots[upacaraIdx];
      const result = [];
      let inFirstSegment = true;
      let currentTime = timeToMin(uSlot.mulai);

      // Find the break that ends the first segment, to know its mulai
      let firstBreakMulai = null;
      for (let i = upacaraIdx + 1; i < slots.length; i++) {
        if (slots[i].type === 'break') { firstBreakMulai = timeToMin(slots[i].mulai); break; }
      }

      // Collect first-segment lesson indices AFTER upacara (exclude upacara itself)
      const firstSegLessons = [];
      for (let i = upacaraIdx + 1; i < slots.length; i++) {
        if (slots[i].type === 'break') break;
        firstSegLessons.push(i);
      }

      for (let i = 0; i < slots.length; i++) {
        if (i === upacaraIdx) continue;
        const slot = { ...slots[i] };

        if (slot.type === 'break') {
          inFirstSegment = false;
          result.push(slot);
        } else if (inFirstSegment) {
          const dur = timeToMin(slot.selesai) - timeToMin(slot.mulai);
          const isLastInSeg = (i === firstSegLessons[firstSegLessons.length - 1]);
          slot.mulai = minToTime(currentTime);
          if (isLastInSeg && firstBreakMulai !== null) {
            // Stretch last lesson to fill right up to the break
            slot.selesai = minToTime(firstBreakMulai);
          } else {
            slot.selesai = minToTime(currentTime + dur);
          }
          currentTime = timeToMin(slot.selesai);
          result.push(slot);
        } else {
          result.push(slot);
        }
      }
      return result;
    }
  }

  // ── Case B: day has NO upacara slot (Selasa–Jumat) ──
  if (!upacaraOn) {
    return slots.map(s => ({ ...s }));
  } else {
    // ON: Apel menggantikan JP 1 (slot lesson pertama).
    // JP 1 asli dihapus. Apel mengisi waktu JP 1 persis.
    // Lessons berikutnya di-chain dari selesainya apel.
    // Lesson TERAKHIR sebelum break diperpanjang sampai ke mulai break
    // agar tidak ada gap.

    const firstLessonIdx = slots.findIndex(s => s.type === 'lesson');
    if (firstLessonIdx === -1) return slots.map(s => ({ ...s }));

    const jp1 = slots[firstLessonIdx];

    const apelSlot = {
      type: 'lesson', jam: jp1.jam,
      mulai: jp1.mulai, selesai: jp1.selesai,
      mapel: 'Apel Pagi', guru: '', warna: 's-upacara'
    };

    // Find first break after jp1 and collect first-segment lesson indices (excluding jp1)
    let firstBreakMulai = null;
    const firstSegIdxs = [];
    for (let i = firstLessonIdx + 1; i < slots.length; i++) {
      if (slots[i].type === 'break') { firstBreakMulai = timeToMin(slots[i].mulai); break; }
      firstSegIdxs.push(i);
    }

    const result = [apelSlot];
    let inFirstSegment = true;
    let currentTime = timeToMin(jp1.selesai);

    for (let i = 0; i < slots.length; i++) {
      if (i === firstLessonIdx) continue;
      const slot = { ...slots[i] };

      if (slot.type === 'break') {
        inFirstSegment = false;
        result.push(slot);
      } else if (inFirstSegment) {
        const dur = timeToMin(slot.selesai) - timeToMin(slot.mulai);
        const isLastInSeg = (i === firstSegIdxs[firstSegIdxs.length - 1]);
        slot.mulai = minToTime(currentTime);
        if (isLastInSeg && firstBreakMulai !== null) {
          slot.selesai = minToTime(firstBreakMulai);
        } else {
          slot.selesai = minToTime(currentTime + dur);
        }
        currentTime = timeToMin(slot.selesai);
        result.push(slot);
      } else {
        result.push(slot);
      }
    }
    return result;
  }
}

/* ── DOM references ── */
const slider = () => document.getElementById('daysSlider');
const tabsEl = () => document.querySelectorAll('.day-tab');

async function loadXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const info = doc.querySelector('info');
  const data = {
    kelas:   info?.querySelector('kelas')?.textContent   || 'Kelas',
    sekolah: info?.querySelector('sekolah')?.textContent || 'Sekolah',
    periode: info?.querySelector('periode')?.textContent || '',
    hari: []
  };

  doc.querySelectorAll('hari').forEach(h => {
    const nama    = h.getAttribute('nama');
    const seragam = h.getAttribute('seragam') || '';
    const slots   = [];

    h.querySelectorAll('slot').forEach(s => {
      const type  = s.getAttribute('type');
      const mulai = s.getAttribute('mulai');
      const selesai = s.getAttribute('selesai');
      if (type === 'break') {
        slots.push({ type: 'break', label: s.getAttribute('label') || 'Istirahat', mulai, selesai });
      } else {
        slots.push({
          type:   'lesson',
          jam:    s.getAttribute('jam') || '',
          mapel:  s.getAttribute('mapel') || '',
          guru:   s.getAttribute('guru') || '',
          warna:  s.getAttribute('warna') || 's-default',
          mulai,
          selesai
        });
      }
    });

    data.hari.push({ nama, seragam, slots });
  });

  SCHEDULE_DATA = data;
  return data;
}

/* ════════════════════════════════════════
   RENDERING
   ════════════════════════════════════════ */

function renderApp(data) {
  /* Reset toggle state when new data is loaded */
  Object.keys(upacaraState).forEach(k => delete upacaraState[k]);

  /* Header */
  document.getElementById('titleText').textContent = `Jadwal Kelas ${data.kelas}`;
  document.getElementById('subtitleText').textContent = `${data.periode} • ${data.sekolah}`;
  document.title = `Jadwal ${data.kelas} — ${data.sekolah}`;

  /* Tabs */
  const tabsContainer = document.getElementById('dayTabs');
  tabsContainer.innerHTML = '';
  data.hari.forEach((h, i) => {
    const jpCount = h.slots.filter(s => s.type === 'lesson').length;
    const btn = document.createElement('button');
    btn.className = 'day-tab' + (i === 0 ? ' active' : '');
    btn.setAttribute('data-idx', i);
    btn.innerHTML = `<span class="day-tab-name">${h.nama.slice(0,3)}</span><span class="day-tab-badge">${jpCount} JP</span>`;
    btn.addEventListener('click', () => goToIndex(i));
    tabsContainer.appendChild(btn);
  });

  /* Slider */
  const sliderEl = document.getElementById('daysSlider');
  sliderEl.style.width = `${data.hari.length * 100}%`;
  sliderEl.innerHTML = '';

  data.hari.forEach((h, i) => {
    const section = document.createElement('div');
    section.className = 'day-section';
    section.id = `hari-${i}`;
    section.style.width = `${100 / data.hari.length}%`;
    section.innerHTML = buildDayHTML(h, i);
    sliderEl.appendChild(section);
  });

  /* Bind toggle events */
  bindToggleEvents(data);

  /* Legend */
  buildLegend(data);

  /* Swipe init */
  initSwipe(data.hari.length);

  /* Clock */
  if (clockTimer) clearInterval(clockTimer);
  updateClock(data);
  clockTimer = setInterval(() => updateClock(data), 1000);

  /* Go to today */
  goToToday(data.hari.length);
}

function bindToggleEvents(data) {
  data.hari.forEach((h, dayIdx) => {
    const toggle = document.getElementById(`toggleUpacara-${dayIdx}`);
    if (!toggle) return;
    toggle.addEventListener('change', () => {
      upacaraState[dayIdx] = toggle.checked;
      refreshDaySection(dayIdx);
    });
  });
}

function refreshDaySection(dayIdx) {
  const data = SCHEDULE_DATA;
  if (!data) return;
  const h = data.hari[dayIdx];
  const section = document.getElementById(`hari-${dayIdx}`);
  if (!section) return;
  section.innerHTML = buildDayHTML(h, dayIdx);
  // Re-bind this day's toggle
  const toggle = document.getElementById(`toggleUpacara-${dayIdx}`);
  if (toggle) {
    toggle.addEventListener('change', () => {
      upacaraState[dayIdx] = toggle.checked;
      refreshDaySection(dayIdx);
    });
  }
}

function buildDayHTML(h, dayIdx) {
  const effectiveSlots = computeEffectiveSlots(dayIdx);
  const lessonSlots = effectiveSlots.filter(s => s.type === 'lesson');
  const totalJP = lessonSlots.length;
  const uniqueMapel = new Set(lessonSlots.map(s => s.mapel)).size;

  const first = effectiveSlots[0];
  const last  = effectiveSlots[effectiveSlots.length - 1];
  const dur   = durationLabel(first?.mulai, last?.selesai);

  const seragamBadges = buildSeragamBadges(h.seragam);

  // Check if this day has an upacara/apel slot
  const upacaraIdx = findUpacaraIdx(h.slots);
  const hasUpacara = upacaraIdx !== -1;
  const upacaraOn  = getUpacaraOn(dayIdx);
  const uSlot      = hasUpacara ? h.slots[upacaraIdx] : null;
  const uLabel     = uSlot ? uSlot.mapel : '';
  const isDefaultOn = isSenin(dayIdx);

  let html = `
    <div class="info-banner" style="gap:12px;">
      <span class="material-icons-round">checkroom</span>
      <div style="flex:1;">
        <div class="info-banner-label">Seragam</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;">${seragamBadges}</div>
      </div>
    </div>`;

  // Upacara/Apel toggle — shown for all days
  const toggleChecked = upacaraOn ? 'checked' : '';
  const toggleRowActive = upacaraOn ? 'active' : '';
  const toggleSubText = hasUpacara
    ? (upacaraOn
        ? `${uLabel} aktif — ${uSlot.mulai}–${uSlot.selesai} WIB`
        : `${uLabel} dinonaktifkan — jadwal digeser maju`)
    : (upacaraOn
        ? 'Apel aktif — JP 1 digantikan apel pagi'
        : 'Ketuk untuk aktifkan apel pagi');

  // Never disable — all days can toggle
  html += `
    <div class="upacara-toggle-row ${toggleRowActive}" id="toggleRow-${dayIdx}">
      <span class="material-icons-round upacara-toggle-icon">flag</span>
      <label class="upacara-toggle-label" for="toggleUpacara-${dayIdx}">
        Upacara / Apel
        <span class="upacara-toggle-sub" id="toggleSub-${dayIdx}">${toggleSubText}</span>
      </label>
      <label class="md-switch">
        <input type="checkbox" id="toggleUpacara-${dayIdx}" data-dayidx="${dayIdx}" ${toggleChecked}>
        <div class="md-switch-track"></div>
        <div class="md-switch-thumb"></div>
      </label>
    </div>`;

  html += `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-number">${uniqueMapel}</div><div class="stat-label">Mapel</div></div>
      <div class="stat-card"><div class="stat-number">${totalJP}</div><div class="stat-label">Jam Pelajaran</div></div>
      <div class="stat-card"><div class="stat-number">${dur}</div><div class="stat-label">Durasi</div></div>
    </div>
    <div class="timeline" id="timeline-${dayIdx}">
  `;

  html += buildTimelineHTML(effectiveSlots, h.slots, dayIdx, upacaraOn);
  html += `</div>`;
  return html;
}

function buildTimelineHTML(effectiveSlots, originalSlots, dayIdx, upacaraOn) {
  let html = '';
  const upacaraIdx = findUpacaraIdx(originalSlots);

  effectiveSlots.forEach((slot, idx) => {
    const isLast = idx === effectiveSlots.length - 1;
    const isUpacaraCard = isUpacaraSlot(slot);

    if (slot.type === 'break') {
      const icon = slot.label.includes('II') ? 'restaurant' : 'coffee';
      html += `
        <div class="break-card">
          <span class="material-icons-round">${icon}</span>
          <span class="break-text">${slot.label}</span>
          <span class="break-time">${slot.mulai} – ${slot.selesai}</span>
        </div>`;
    } else {
      const hasTeacher = slot.guru && slot.guru.trim() !== '';
      const jpNums  = slot.jam.toString();
      const isMulti = jpNums.includes('-');
      const jpCount = isMulti
        ? parseInt(jpNums.split('-')[1]) - parseInt(jpNums.split('-')[0]) + 1
        : 1;

      html += `
        <div class="lesson-group">
          <div class="lesson-time-col">
            <div class="lesson-dot"></div>
            ${!isLast ? '<div class="lesson-line"></div>' : ''}
          </div>
          <div class="lesson-card ${slot.warna}" data-mulai="${slot.mulai}" data-selesai="${slot.selesai}">
            <div class="lesson-header">
              <div class="lesson-subject">${escHtml(slot.mapel)}</div>
              <div class="lesson-jam-badge"><span>JP ${slot.jam}</span></div>
            </div>
            <div class="lesson-meta">
              ${hasTeacher ? `<div class="lesson-teacher"><span class="material-icons-round">person</span> ${escHtml(slot.guru)}</div>` : ''}
              <div class="lesson-time"><span class="material-icons-round">schedule</span> ${slot.mulai} – ${slot.selesai} WIB</div>
              ${jpCount > 1 ? `<span class="multi-badge"><span class="material-icons-round">repeat</span> ${jpCount} Jam Pelajaran</span>` : ''}
            </div>
          </div>
        </div>`;
    }
  });

  return html;
}

function buildSeragamBadges(seragam) {
  if (!seragam) return `<span class="seragam-badge primary">—</span>`;
  const parts = seragam.split('+').map(s => s.trim()).filter(Boolean);
  if (parts.length === 1) {
    return `<span class="seragam-badge primary">${escHtml(parts[0])}</span>`;
  }
  return parts.map((p, i) =>
    `<span class="seragam-badge ${i === 0 ? 'primary' : 'tertiary'}">${escHtml(p)}</span>`
  ).join('');
}

function buildLegend(data) {
  const seen = new Map();
  data.hari.forEach(h => h.slots.forEach(s => {
    if (s.type === 'lesson' && !seen.has(s.mapel)) {
      seen.set(s.mapel, s.warna);
    }
  }));

  const COLOR_MAP = {
    's-pjok': '#2E7D32', 's-pkwu': '#F9A825', 's-agama': '#7B1FA2',
    's-biologi': '#1565C0', 's-mat-wajib': '#BF360C', 's-mat-tl': '#C62828',
    's-bk': '#558B2F', 's-pancasila': '#00695C', 's-inggris': '#283593',
    's-jawa': '#E65100', 's-seni': '#AD1457', 's-indonesia': '#1B5E20',
    's-kimia': '#006064', 's-sejarah': '#FF6F00', 's-informatika': '#4527A0',
    's-upacara': '#827717', 's-fisika': '#1B5E20', 's-ekonomi': '#BF360C',
    's-sosiologi': '#880E4F', 's-geografi': '#004D40', 's-default': '#455A64'
  };

  let html = '';
  seen.forEach((warna, mapel) => {
    const color = COLOR_MAP[warna] || '#455A64';
    html += `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div>${escHtml(mapel)}</div>`;
  });

  document.getElementById('legendGrid').innerHTML = html;
}

/* ════════════════════════════════════════
   NAVIGATION / SWIPE
   ════════════════════════════════════════ */

function goToIndex(idx) {
  if (!SCHEDULE_DATA) return;
  const n = SCHEDULE_DATA.hari.length;
  if (idx < 0 || idx >= n) return;
  currentIdx = idx;

  const sliderEl = slider();
  sliderEl.style.transform = `translateX(-${(idx * (100 / n))}%)`;

  const tabs = tabsEl();
  tabs.forEach((t, i) => t.classList.toggle('active', i === idx));
  tabs[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function goToToday(dayCount) {
  const jsDay = new Date().getDay(); // 0=Sun
  const idx = (jsDay === 0 || jsDay === 6) ? 0 : Math.min(jsDay - 1, (dayCount || 5) - 1);
  goToIndex(idx);
}

let touchStartX = 0, touchStartY = 0, touchStartTime = 0, isDragging = false;
let mouseDown = false, mouseStartX = 0;

function initSwipe(dayCount) {
  const sliderEl = slider();

  sliderEl.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    isDragging = false;
  }, { passive: true });

  sliderEl.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (!isDragging && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) isDragging = true;
    if (isDragging) {
      const w = sliderEl.parentElement.offsetWidth;
      const base = currentIdx * w;
      const px = base - dx;
      const minPx = 0;
      const maxPx = (dayCount - 1) * w;
      sliderEl.classList.add('no-transition');
      sliderEl.style.transform = `translateX(-${Math.min(maxPx, Math.max(minPx, px)) / (w * dayCount) * 100}%)`;
      sliderEl.classList.remove('no-transition');
    }
  }, { passive: true });

  sliderEl.addEventListener('touchend', e => {
    if (!isDragging) return;
    sliderEl.classList.remove('no-transition');
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dt = Date.now() - touchStartTime;
    const isFlick = dt < 250 && Math.abs(dx) > 30;
    const isSwipe = Math.abs(dx) > sliderEl.parentElement.offsetWidth * 0.35;
    if ((isFlick || isSwipe) && dx < 0) goToIndex(currentIdx + 1);
    else if ((isFlick || isSwipe) && dx > 0) goToIndex(currentIdx - 1);
    else goToIndex(currentIdx);
    isDragging = false;
  });

  sliderEl.addEventListener('mousedown', e => { mouseDown = true; mouseStartX = e.clientX; });
  sliderEl.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    const dx = e.clientX - mouseStartX;
    const w = sliderEl.parentElement.offsetWidth;
    const px = currentIdx * w - dx;
    sliderEl.classList.add('no-transition');
    sliderEl.style.transform = `translateX(-${Math.min((dayCount-1)*w, Math.max(0, px)) / (w * dayCount) * 100}%)`;
    sliderEl.classList.remove('no-transition');
  });
  sliderEl.addEventListener('mouseup', e => {
    if (!mouseDown) return;
    mouseDown = false;
    const dx = e.clientX - mouseStartX;
    if (dx < -80) goToIndex(currentIdx + 1);
    else if (dx > 80) goToIndex(currentIdx - 1);
    else goToIndex(currentIdx);
  });
  sliderEl.addEventListener('mouseleave', () => {
    if (mouseDown) { mouseDown = false; goToIndex(currentIdx); }
  });
}

/* ════════════════════════════════════════
   LIVE CLOCK
   ════════════════════════════════════════ */

function updateClock(data) {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();

  const hh = p2(h), mm = p2(m), ss = p2(s);
  const timeEl = document.getElementById('clockTime');
  if (timeEl) {
    timeEl.childNodes[0].textContent = `${hh}:${mm}`;
    document.getElementById('clockSec').textContent = `:${ss}`;
  }

  const DAYS_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const MONTHS  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const dateEl = document.getElementById('clockDate');
  if (dateEl) dateEl.textContent = `${DAYS_ID[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  if (!data) return;

  const jsDay = now.getDay();
  const dayIndex = (jsDay === 0 || jsDay === 6) ? -1 : jsDay - 1;
  const dayData = dayIndex >= 0 ? data.hari[dayIndex] : null;

  const mainEl  = document.getElementById('clockNowMain');
  const subEl   = document.getElementById('clockNowSub');
  const fillEl  = document.getElementById('clockFill');
  const progEl  = document.getElementById('clockProgressLabel');
  if (!mainEl) return;

  if (!dayData) {
    mainEl.textContent = 'Libur'; subEl.textContent = 'Sabtu / Minggu';
    fillEl.style.width = '0%'; progEl.textContent = '—'; return;
  }

  const nowMin = h * 60 + m + s / 60;
  const effectiveSlots = computeEffectiveSlots(dayIndex);
  let found = null;
  for (const slot of effectiveSlots) {
    const sMin = timeToMin(slot.mulai);
    const eMin = timeToMin(slot.selesai);
    if (nowMin >= sMin && nowMin < eMin) { found = { slot, sMin, eMin }; break; }
  }

  if (!found) {
    const schoolStart = timeToMin(effectiveSlots[0]?.mulai || '07:00');
    const schoolEnd   = timeToMin(effectiveSlots[effectiveSlots.length - 1]?.selesai || '15:10');
    if (nowMin < schoolStart) {
      mainEl.textContent = 'Belum mulai';
      subEl.textContent = `Mulai ${Math.ceil(schoolStart - nowMin)} menit lagi`;
      fillEl.style.width = '0%'; progEl.textContent = '—';
    } else if (nowMin >= schoolEnd) {
      mainEl.textContent = 'Selesai'; subEl.textContent = 'Kegiatan belajar selesai';
      fillEl.style.width = '100%'; progEl.textContent = 'Selesai';
    } else {
      mainEl.textContent = 'Di luar jadwal'; subEl.textContent = '';
      fillEl.style.width = '0%'; progEl.textContent = '—';
    }
    return;
  }

  const { slot, sMin, eMin } = found;
  mainEl.textContent = slot.type === 'break' ? slot.label : slot.mapel;
  subEl.textContent  = slot.type === 'break'
    ? `${slot.mulai} – ${slot.selesai} WIB`
    : (slot.guru || `JP ${slot.jam}`);

  const pct = ((nowMin - sMin) / (eMin - sMin)) * 100;
  fillEl.style.width = Math.min(100, Math.max(0, pct)) + '%';
  progEl.textContent = `${Math.ceil(eMin - nowMin)} mnt lagi`;

  /* Highlight active lesson card */
  document.querySelectorAll('.lesson-card').forEach(card => {
    card.classList.remove('active-now');
    const cMulai = card.dataset.mulai;
    const cSel   = card.dataset.selesai;
    if (cMulai && cSel) {
      const cS = timeToMin(cMulai), cE = timeToMin(cSel);
      if (nowMin >= cS && nowMin < cE) card.classList.add('active-now');
    }
  });
}

/* ════════════════════════════════════════
   FILE HANDLING
   ════════════════════════════════════════ */

function loadFromFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'xml') { showToast('Hanya file .xml yang didukung'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      showLoading(true);
      const data = await loadXML(e.target.result);
      renderApp(data);
      showToast(`Jadwal ${data.kelas} berhasil dimuat`);
    } catch (err) {
      showToast('Gagal memuat XML: ' + err.message);
    } finally {
      showLoading(false);
    }
  };
  reader.readAsText(file);
}

const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<jadwal>
  <info>
    <kelas>XI D</kelas>
    <sekolah>SMAN 2 Trenggalek</sekolah>
    <periode>Per Januari</periode>
  </info>

  <hari nama="Senin" seragam="Abu-Putih">
    <slot type="lesson" jam="1" mulai="07:00" selesai="07:40" mapel="Upacara Bendera" guru="" warna="s-upacara"/>
    <slot type="lesson" jam="2" mulai="07:40" selesai="08:20" mapel="PJOK (Kesehatan)" guru="Wahyu Kholida M., S.Pd" warna="s-pjok"/>
    <slot type="lesson" jam="3-4" mulai="08:20" selesai="09:40" mapel="PKWU" guru="Mayasari Oktafa R., S.Pd." warna="s-pkwu"/>
    <slot type="break" mulai="09:40" selesai="09:50" label="Istirahat I"/>
    <slot type="lesson" jam="5" mulai="09:50" selesai="10:30" mapel="Pend. Agama Islam" guru="Abdul Aziz Al Barqy, S.Pd.I." warna="s-agama"/>
    <slot type="lesson" jam="6-7" mulai="10:30" selesai="11:50" mapel="Biologi" guru="Budiyono, S.Pd., M.Pd." warna="s-biologi"/>
    <slot type="break" mulai="11:50" selesai="13:10" label="Istirahat II + MBG"/>
    <slot type="lesson" jam="8" mulai="13:10" selesai="13:50" mapel="Biologi" guru="Budiyono, S.Pd., M.Pd." warna="s-biologi"/>
    <slot type="lesson" jam="9-10" mulai="13:50" selesai="15:10" mapel="Matematika Wajib" guru="Rully Sulistyani, S.Pd., M.Pd." warna="s-mat-wajib"/>
  </hari>

  <hari nama="Selasa" seragam="Abu-Putih">
    <slot type="lesson" jam="1-3" mulai="07:00" selesai="09:00" mapel="Matematika TL" guru="Siti Ambari, S.Pd." warna="s-mat-tl"/>
    <slot type="lesson" jam="4" mulai="09:00" selesai="09:40" mapel="Bimbingan Konseling" guru="Erik Reffia Rini, S.Pd" warna="s-bk"/>
    <slot type="break" mulai="09:40" selesai="09:50" label="Istirahat I"/>
    <slot type="lesson" jam="5-6" mulai="09:50" selesai="11:10" mapel="Pend. Pancasila" guru="Vika Apriliani, S.Pd." warna="s-pancasila"/>
    <slot type="lesson" jam="7" mulai="11:10" selesai="11:50" mapel="Bahasa Inggris" guru="Aris Stiawan, S.Pd." warna="s-inggris"/>
    <slot type="break" mulai="11:50" selesai="13:10" label="Istirahat II + MBG"/>
    <slot type="lesson" jam="8" mulai="13:10" selesai="13:50" mapel="Bahasa Inggris" guru="Aris Stiawan, S.Pd." warna="s-inggris"/>
    <slot type="lesson" jam="9-10" mulai="13:50" selesai="15:10" mapel="Bahasa Jawa" guru="Ika Sulistiani, S.Pd." warna="s-jawa"/>
  </hari>

  <hari nama="Rabu" seragam="Seragam Khas">
    <slot type="lesson" jam="1-2" mulai="07:00" selesai="08:20" mapel="Matematika TL" guru="Siti Ambari, S.Pd." warna="s-mat-tl"/>
    <slot type="lesson" jam="3-4" mulai="08:20" selesai="09:40" mapel="Biologi" guru="Budiyono, S.Pd., M.Pd." warna="s-biologi"/>
    <slot type="break" mulai="09:40" selesai="09:50" label="Istirahat I"/>
    <slot type="lesson" jam="5-6" mulai="09:50" selesai="11:10" mapel="Seni Tari" guru="Fresti Rusrianur I., S.Pd." warna="s-seni"/>
    <slot type="lesson" jam="7" mulai="11:10" selesai="11:50" mapel="Pend. Agama Islam" guru="Abdul Aziz Al Barqy, S.Pd.I." warna="s-agama"/>
    <slot type="break" mulai="11:50" selesai="13:10" label="Istirahat II + MBG"/>
    <slot type="lesson" jam="8" mulai="13:10" selesai="13:50" mapel="Pend. Agama Islam" guru="Abdul Aziz Al Barqy, S.Pd.I." warna="s-agama"/>
    <slot type="lesson" jam="9-10" mulai="13:50" selesai="15:10" mapel="Bahasa Indonesia" guru="Pingkan Hendrayana, M.Pd." warna="s-indonesia"/>
  </hari>

  <hari nama="Kamis" seragam="Olahraga + Seragam Khas">
    <slot type="lesson" jam="1-2" mulai="07:00" selesai="08:20" mapel="PJOK (Olahraga)" guru="Wahyu Kholida M., S.Pd." warna="s-pjok"/>
    <slot type="lesson" jam="3-4" mulai="08:20" selesai="09:40" mapel="Matematika Wajib" guru="Rully Sulistyani, S.Pd., M.Pd." warna="s-mat-wajib"/>
    <slot type="break" mulai="09:40" selesai="09:50" label="Istirahat I"/>
    <slot type="lesson" jam="5-6" mulai="09:50" selesai="11:10" mapel="Kimia" guru="Mimin Setyarini, S.Pd." warna="s-kimia"/>
    <slot type="lesson" jam="7" mulai="11:10" selesai="11:50" mapel="Sejarah" guru="Luluk Ustadiatu M., S.Pd." warna="s-sejarah"/>
    <slot type="break" mulai="11:50" selesai="13:10" label="Istirahat II + MBG"/>
    <slot type="lesson" jam="8" mulai="13:10" selesai="13:50" mapel="Sejarah" guru="Luluk Ustadiatu M., S.Pd." warna="s-sejarah"/>
    <slot type="lesson" jam="9-10" mulai="13:50" selesai="15:10" mapel="Informatika" guru="Vigor Wahyu S., S.Kom." warna="s-informatika"/>
  </hari>

  <hari nama="Jumat" seragam="Pramuka">
    <slot type="lesson" jam="1" mulai="07:00" selesai="07:40" mapel="Bahasa Inggris" guru="Aris Stiawan, S.Pd." warna="s-inggris"/>
    <slot type="lesson" jam="2-3" mulai="07:40" selesai="09:00" mapel="Bahasa Indonesia" guru="Pingkan Hendrayana, M.Pd." warna="s-indonesia"/>
    <slot type="lesson" jam="4" mulai="09:00" selesai="09:40" mapel="Kimia" guru="Mimin Setyarini, S.Pd." warna="s-kimia"/>
    <slot type="break" mulai="09:40" selesai="09:50" label="Istirahat I"/>
    <slot type="lesson" jam="5-6" mulai="09:50" selesai="11:10" mapel="Kimia" guru="Mimin Setyarini, S.Pd." warna="s-kimia"/>
    <slot type="break" mulai="11:10" selesai="12:50" label="Istirahat II + MBG"/>
    <slot type="lesson" jam="7-10" mulai="12:50" selesai="15:10" mapel="Informatika" guru="Vigor Wahyu S., S.Kom." warna="s-informatika"/>
  </hari>
</jadwal>`;

async function loadDefaultXML() {
  showLoading(true);
  try {
    const data = await loadXML(DEFAULT_XML);
    renderApp(data);
  } catch (e) {
    showToast('Gagal memuat jadwal: ' + e.message);
    console.error(e);
  } finally {
    showLoading(false);
  }
}

/* ════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════ */

function timeToMin(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${p2(h)}:${p2(m)}`;
}

function durationLabel(mulai, selesai) {
  if (!mulai || !selesai) return '—';
  const mins = timeToMin(selesai) - timeToMin(mulai);
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h}j` : `${h}j${m}m`;
}

function p2(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function showLoading(show) {
  const el = document.getElementById('loadingScreen');
  if (el) el.style.display = show ? 'flex' : 'none';
}

/* ════════════════════════════════════════
   BOOT
   ════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  /* File input trigger */
  document.getElementById('btnLoad')?.addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput')?.addEventListener('change', e => {
    loadFromFile(e.target.files[0]);
    e.target.value = '';
  });

  /* FAB today */
  document.getElementById('btnToday')?.addEventListener('click', () => {
    if (SCHEDULE_DATA) goToToday(SCHEDULE_DATA.hari.length);
  });

  /* Open editor */
  document.getElementById('btnEditor')?.addEventListener('click', () => {
    window.open('editor.html', '_blank');
  });

  /* Load from ?data= base64 param (from editor preview) or default */
  const params = new URLSearchParams(window.location.search);
  const b64 = params.get('data');
  if (b64) {
    (async () => {
      showLoading(true);
      try {
        const xml = decodeURIComponent(escape(atob(b64)));
        const data = await loadXML(xml);
        renderApp(data);
        showToast('Pratinjau dari editor');
      } catch(e) {
        await loadDefaultXML();
      } finally {
        showLoading(false);
      }
    })();
  } else {
    loadDefaultXML();
  }
});
