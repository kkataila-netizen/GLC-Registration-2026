/* ============================================================
   Check In — kiosk-style attendee check-in
   ============================================================ */
(() => {
  'use strict';

  function getAdminToken() { return localStorage.getItem('glc-admin-token') || ''; }
  function adminHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken() };
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return iso; }
  }
  function fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  const DINE_LABELS = { biffs: "Biff's Bistro", jump: 'Jump Restaurant', joneses: 'The Joneses', '': '—' };

  let allAttendees      = [];
  let currentAttendee   = null;
  let videoStream       = null;
  let capturedPhoto     = null; // data URL or null

  // ── DOM refs ─────────────────────────────────────
  const searchInput  = document.getElementById('searchInput');
  const statsEl      = document.getElementById('checkinStats');
  const grid         = document.getElementById('attendeeGrid');
  const emptyState   = document.getElementById('emptyState');
  const modal        = document.getElementById('checkinModal');
  const modalClose   = document.getElementById('modalClose');
  const modalName    = document.getElementById('modalName');
  const modalOrg     = document.getElementById('modalOrg');
  const modalDetails = document.getElementById('modalDetails');

  const camIdle    = document.getElementById('camIdle');
  const camLive    = document.getElementById('camLive');
  const camPreview = document.getElementById('camPreview');
  const camError   = document.getElementById('camError');

  const cameraVideo    = document.getElementById('cameraVideo');
  const photoPreview   = document.getElementById('photoPreview');
  const existingWrap   = document.getElementById('existingPhotoWrap');
  const existingPhoto  = document.getElementById('existingPhoto');

  const startCamBtn = document.getElementById('startCamBtn');
  const captureBtn  = document.getElementById('captureBtn');
  const retakeBtn   = document.getElementById('retakeBtn');
  const skipBtn     = document.getElementById('skipPhotoBtn');
  const completeBtn = document.getElementById('completeBtn');
  const checkOutBtn = document.getElementById('checkOutBtn');

  // ── Load registrations ────────────────────────────
  async function loadAttendees() {
    try {
      const res = await fetch('/api/registrations', {
        headers: { 'Authorization': 'Bearer ' + getAdminToken() }
      });
      if (res.status === 401) { location.replace('/admin.html'); return; }
      const data = await res.json();
      allAttendees = data.registrations || [];
      filterAndRender('');
    } catch {
      statsEl.textContent = 'Error loading attendees';
    }
  }

  // ── Filter + render grid ──────────────────────────
  function filterAndRender(query) {
    const term = query.toLowerCase();
    const filtered = term
      ? allAttendees.filter(a =>
          a.name.toLowerCase().includes(term) ||
          (a.organization || '').toLowerCase().includes(term))
      : allAttendees;
    renderGrid(filtered);
  }

  function renderGrid(attendees) {
    const checkedInCount = allAttendees.filter(a => a.checkedIn).length;
    statsEl.innerHTML = `<strong>${checkedInCount}</strong> / ${allAttendees.length} checked in`;

    grid.innerHTML = '';

    if (attendees.length === 0) { emptyState.hidden = false; return; }
    emptyState.hidden = true;

    attendees.forEach(a => {
      const card = document.createElement('div');
      card.className = 'ci-card' + (a.checkedIn ? ' ci-card--checked' : '');

      const initials = (a.name || '?').split(' ').filter(Boolean)
        .map(n => n[0]).join('').slice(0, 2).toUpperCase();

      card.innerHTML = `
        <div class="ci-avatar">
          <img src="/api/profile-photo?email=${encodeURIComponent(a.email)}"
               alt=""
               style="display:block"
               onerror="this.style.display='none'">
          <div class="ci-initials">${esc(initials)}</div>
        </div>
        <div class="ci-card-name">${esc(a.name)}</div>
        <div class="ci-card-org">${esc(a.organization || '—')}</div>
        ${a.checkedIn
          ? '<div class="ci-badge ci-badge--in">✓ Checked In</div>'
          : '<div class="ci-badge ci-badge--pending">Pending</div>'}
      `;

      card.addEventListener('click', () => openModal(a));
      grid.appendChild(card);
    });
  }

  // ── Open modal ────────────────────────────────────
  function openModal(attendee) {
    currentAttendee = attendee;
    capturedPhoto   = null;

    // Header
    modalName.textContent = attendee.name;
    modalOrg.textContent  = attendee.organization || '';

    // Details panel
    modalDetails.innerHTML = '';

    if (attendee.checkedIn) {
      const t = fmtTime(attendee.checkedInAt);
      const banner = document.createElement('div');
      banner.className = 'ci-already-in';
      banner.textContent = '✓ Already checked in' + (t ? ' at ' + t : '');
      modalDetails.appendChild(banner);
    }

    const rows = [
      ['Email',             attendee.email],
      ['Arrival',           fmtDate(attendee.arrivalDate)],
      ['Departure',         fmtDate(attendee.departureDate)],
      ['Dietary',           attendee.dietary || 'None'],
      ['Dietary Notes',     attendee.dietaryOther || '—'],
      ['T-Shirt',           [attendee.tshirtFit, attendee.tshirt].filter(Boolean).join(' ') || '—'],
      ['Dine Around',       DINE_LABELS[attendee.dineAround || ''] || '—'],
      ['Welcome Reception', attendee.welcomeReception ? 'Yes ✓' : 'No'],
      ['Sessions',          Array.isArray(attendee.sessions) && attendee.sessions.length
                              ? attendee.sessions.join(', ') : '—'],
    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'ci-detail-row';
      row.innerHTML = `
        <span class="ci-detail-label">${esc(label)}</span>
        <span class="ci-detail-value">${esc(String(value))}</span>`;
      modalDetails.appendChild(row);
    });

    // Show Check Out button only for already-checked-in attendees
    checkOutBtn.style.display = attendee.checkedIn ? '' : 'none';

    // Camera: reset to idle
    setCamState('idle');
    capturedPhoto = null;

    // Try loading existing profile photo
    existingWrap.style.display = 'none';
    existingPhoto.src = `/api/profile-photo?email=${encodeURIComponent(attendee.email)}`;
    existingPhoto.onload  = () => { existingWrap.style.display = 'block'; };
    existingPhoto.onerror = () => { existingWrap.style.display = 'none'; };

    // Show modal
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    stopCamera();
    modal.hidden = true;
    document.body.style.overflow = '';
    currentAttendee = null;
    capturedPhoto   = null;
  }

  // ── Camera state machine ──────────────────────────
  function setCamState(state) {
    camIdle.style.display    = state === 'idle'    ? 'block' : 'none';
    camLive.style.display    = state === 'live'    ? 'block' : 'none';
    camPreview.style.display = state === 'preview' ? 'block' : 'none';
    camError.style.display   = state === 'error'   ? 'block' : 'none';
  }

  async function startCamera() {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      cameraVideo.srcObject = videoStream;
      setCamState('live');
    } catch {
      setCamState('error');
    }
  }

  function capturePhoto() {
    const canvas = document.createElement('canvas');
    canvas.width  = cameraVideo.videoWidth  || 640;
    canvas.height = cameraVideo.videoHeight || 480;
    canvas.getContext('2d').drawImage(cameraVideo, 0, 0);
    capturedPhoto = canvas.toDataURL('image/jpeg', 0.85);
    photoPreview.src = capturedPhoto;
    setCamState('preview');
    stopCamera();
  }

  function retakePhoto() {
    capturedPhoto = null;
    startCamera();
  }

  function stopCamera() {
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
  }

  // ── Complete check-in ─────────────────────────────
  async function completeCheckin(withPhoto) {
    if (!currentAttendee) return;

    completeBtn.disabled = true;
    skipBtn.disabled     = true;
    completeBtn.textContent = 'Saving…';

    try {
      // 1. Upload photo if we have one
      if (withPhoto && capturedPhoto) {
        const pr = await fetch('/api/profile-photo', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ photo: capturedPhoto, email: currentAttendee.email })
        });
        if (!pr.ok) {
          const d = await pr.json().catch(() => ({}));
          throw new Error(d.error || 'Photo upload failed');
        }
      }

      // 2. Mark checked in
      const cr = await fetch(`/api/registrations/${currentAttendee.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ checkedIn: true })
      });
      if (!cr.ok) {
        const d = await cr.json().catch(() => ({}));
        throw new Error(d.error || 'Check-in save failed');
      }

      // 3. Update local data
      const idx = allAttendees.findIndex(a => a.id === currentAttendee.id);
      if (idx !== -1) {
        allAttendees[idx].checkedIn   = true;
        allAttendees[idx].checkedInAt = new Date().toISOString();
      }

      const name = currentAttendee.name;
      closeModal();
      filterAndRender(searchInput.value.trim());
      showSuccessFlash(name);

    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      completeBtn.disabled     = false;
      skipBtn.disabled         = false;
      completeBtn.textContent  = '✓  Complete Check-In';
    }
  }

  async function checkOut() {
    if (!currentAttendee) return;
    checkOutBtn.disabled = true;
    checkOutBtn.textContent = 'Removing…';
    try {
      const res = await fetch(`/api/registrations/${currentAttendee.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ checkedIn: false })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Check-out failed');
      }
      const idx = allAttendees.findIndex(a => a.id === currentAttendee.id);
      if (idx !== -1) { allAttendees[idx].checkedIn = false; allAttendees[idx].checkedInAt = ''; }
      closeModal();
      filterAndRender(searchInput.value.trim());
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      checkOutBtn.disabled = false;
      checkOutBtn.textContent = '↩  Check Out';
    }
  }

  function showSuccessFlash(name) {
    const flash = document.createElement('div');
    flash.className = 'ci-success-flash';
    flash.innerHTML = `
      <div class="ci-success-flash__icon">✓</div>
      <div class="ci-success-flash__title">Checked In!</div>
      <div class="ci-success-flash__name">${esc(name)}</div>
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 2500);
  }

  // ── Event listeners ───────────────────────────────
  searchInput.addEventListener('input',  e => filterAndRender(e.target.value.trim()));
  modalClose.addEventListener('click',   closeModal);
  modal.addEventListener('click',        e => { if (e.target === modal) closeModal(); });
  startCamBtn.addEventListener('click',  startCamera);
  captureBtn.addEventListener('click',   capturePhoto);
  retakeBtn.addEventListener('click',    retakePhoto);
  completeBtn.addEventListener('click',  () => completeCheckin(true));
  skipBtn.addEventListener('click',      () => completeCheckin(false));
  checkOutBtn.addEventListener('click',  checkOut);

  // ── Init ──────────────────────────────────────────
  loadAttendees();
})();
