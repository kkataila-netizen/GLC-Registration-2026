document.addEventListener('DOMContentLoaded', () => {
  const gate = document.getElementById('adminGate');
  const gateForm = document.getElementById('gateForm');
  const gatePassword = document.getElementById('gatePassword');
  const gateError = document.getElementById('gateError');
  const adminContent = document.getElementById('adminContent');

  function getAdminToken() {
    return localStorage.getItem('glc-admin-token');
  }

  function adminHeaders(extra = {}) {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminToken(), ...extra };
  }

  // Check if already authenticated this session
  if (getAdminToken()) {
    showDashboard();
  } else {
    gatePassword.focus();
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.hidden = true;

    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: gatePassword.value })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        localStorage.setItem('glc-admin-token', data.token);
        showDashboard();
      } else {
        gateError.hidden = false;
        gatePassword.value = '';
        gatePassword.focus();
      }
    } catch {
      gateError.hidden = false;
      gatePassword.value = '';
      gatePassword.focus();
    }
  });

  function showDashboard() {
    gate.hidden = true;
    adminContent.hidden = false;
    initDashboard();
  }

  function initDashboard() {
    const searchInput = document.getElementById('searchInput');
    const regCount = document.getElementById('regCount');
    const regTable = document.getElementById('regTable');
    const regTableBody = document.getElementById('regTableBody');
    const emptyState = document.getElementById('emptyState');
    const exportBtn = document.getElementById('exportBtn');

    let debounceTimer = null;
    // Cache the latest registrations so we can re-render after edits
    // without re-reading from Netlify Blobs (which has eventual consistency)
    let currentRegistrations = [];

    async function loadRegistrations(search = '') {
      try {
        const cacheBust = `_=${Date.now()}`;
        const url = search
          ? `/api/registrations?search=${encodeURIComponent(search)}&${cacheBust}`
          : `/api/registrations?${cacheBust}`;

        const res = await fetch(url, {
          headers: { 'Authorization': 'Bearer ' + getAdminToken() },
          cache: 'no-store'
        });

        if (res.status === 401) {
          localStorage.removeItem('glc-admin-token');
          location.reload();
          return;
        }

        const data = await res.json();

        currentRegistrations = (data.registrations || []).slice().sort((a, b) =>
          (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
        regCount.textContent = `${data.total} registration${data.total !== 1 ? 's' : ''}`;
        renderTable(currentRegistrations);
      } catch {
        regCount.textContent = 'Error loading data';
        renderTable([]);
      }
    }

    // Edit modal elements
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const editCancel = document.getElementById('editCancel');
    const editError = document.getElementById('editError');

    function renderTable(registrations) {
      regTableBody.innerHTML = '';

      if (registrations.length === 0) {
        regTable.hidden = true;
        emptyState.hidden = false;
        return;
      }

      regTable.hidden = false;
      emptyState.hidden = true;

      registrations.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.email)}</td>
          <td>${esc(r.arrivalDate) || '—'}</td>
          <td>${esc(r.departureDate) || '—'}</td>
          <td>${esc(r.organization) || '—'}</td>
          <td>${esc(r.dietary) || 'None'}</td>
          <td>${Array.isArray(r.sessions) && r.sessions.length ? esc(r.sessions.join(', ')) : '—'}</td>
          <td>${r.welcomeReception ? '✓ Yes' : 'No'}</td>
          <td>${esc(r.tshirt) || '—'}</td>
          <td>${formatDate(r.registeredAt)}</td>
          <td style="white-space:nowrap">
            <button class="btn-action" data-edit="${esc(r.id)}">Edit</button>
            <button class="btn-action btn-action--danger" data-delete="${esc(r.id)}" data-name="${esc(r.name)}">Delete</button>
          </td>
        `;
        regTableBody.appendChild(tr);
      });

      // Bind edit buttons
      regTableBody.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const reg = registrations.find(r => r.id === btn.dataset.edit);
          if (reg) openEditModal(reg);
        });
      });

      // Bind delete buttons
      regTableBody.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
          deleteRegistration(btn.dataset.delete, btn.dataset.name);
        });
      });
    }

    async function deleteRegistration(id, name) {
      if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;

      try {
        const res = await fetch(`/api/registrations/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Failed to delete.');
          return;
        }
        loadRegistrations(searchInput.value.trim());
      } catch {
        alert('Network error. Please try again.');
      }
    }

    function buildHeadshotSlots() {
      const out = [];
      for (let h = 9; h < 16; h++) {
        for (let m = 0; m < 60; m += 5) {
          out.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        }
      }
      return out;
    }
    function formatSlotLabel(slot) {
      const [h, m] = slot.split(':').map(Number);
      const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
    }

    async function populateAdminHeadshotSlots(currentSlot = '') {
      const select = document.getElementById('editHeadshotSlot');
      let taken = [];
      try {
        const res = await fetch('/api/headshots');
        if (res.ok) { taken = (await res.json()).taken || []; }
      } catch { /* ignore */ }
      select.innerHTML = '<option value="">-- None --</option>';

      // Queue option
      const queueOpt = document.createElement('option');
      queueOpt.value = 'queue';
      queueOpt.textContent = '📋 Queue (waitlist for added slots)';
      if (currentSlot === 'queue') queueOpt.selected = true;
      select.appendChild(queueOpt);

      const sep = document.createElement('option');
      sep.disabled = true;
      sep.textContent = '──────── Time slots ────────';
      select.appendChild(sep);

      buildHeadshotSlots().forEach(slot => {
        const opt = document.createElement('option');
        opt.value = slot;
        opt.textContent = formatSlotLabel(slot);
        if (taken.includes(slot) && slot !== currentSlot) {
          opt.disabled = true;
          opt.textContent += ' — taken';
        }
        if (slot === currentSlot) opt.selected = true;
        select.appendChild(opt);
      });
    }

    function openEditModal(reg) {
      document.getElementById('editId').value = reg.id;
      document.getElementById('editName').value = reg.name || '';
      document.getElementById('editTitle').value = reg.title || '';
      document.getElementById('editEmail').value = reg.email || '';
      document.getElementById('editPassword').value = '';
      document.getElementById('editArrival').value = reg.arrivalDate || '';
      document.getElementById('editDeparture').value = reg.departureDate || '';
      document.getElementById('editPhone').value = reg.phone || '';
      document.getElementById('editOrg').value = reg.organization || '';
      document.getElementById('editDietary').value = reg.dietary || 'None';
      document.getElementById('editDietaryOther').value = reg.dietaryOther || '';
      document.getElementById('editTshirtFit').value = reg.tshirtFit || '';
      document.getElementById('editTshirt').value = reg.tshirt || '';
      document.getElementById('editSessionBOS').checked = Array.isArray(reg.sessions) && reg.sessions.includes('Tue: Banyan Fundamentals Workshop');
      document.getElementById('editWelcomeReception').checked = !!reg.welcomeReception;
      document.getElementById('editMorningConnection').value = reg.morningConnection || '';
      document.getElementById('editDineAround').value = reg.dineAround || '';
      document.getElementById('editCheckedIn').checked = !!reg.checkedIn;
      document.getElementById('editRegisteredAt').value = reg.registeredAt ? formatDate(reg.registeredAt) : '—';
      populateAdminHeadshotSlots(reg.headshotSlot || '');
      editError.hidden = true;
      editModal.hidden = false;
    }

    editCancel.addEventListener('click', () => { editModal.hidden = true; });
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) editModal.hidden = true;
    });

    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      editError.hidden = true;

      const id = document.getElementById('editId').value;
      const body = {
        name: document.getElementById('editName').value,
        title: document.getElementById('editTitle').value,
        email: document.getElementById('editEmail').value,
        arrivalDate: document.getElementById('editArrival').value,
        departureDate: document.getElementById('editDeparture').value,
        phone: document.getElementById('editPhone').value,
        organization: document.getElementById('editOrg').value,
        dietary: document.getElementById('editDietary').value,
        dietaryOther: document.getElementById('editDietaryOther').value,
        tshirtFit: document.getElementById('editTshirtFit').value,
        tshirt: document.getElementById('editTshirt').value,
        sessions: document.getElementById('editSessionBOS').checked ? ['Tue: Banyan Fundamentals Workshop'] : [],
        welcomeReception: document.getElementById('editWelcomeReception').checked,
        morningConnection: document.getElementById('editMorningConnection').value,
        dineAround: document.getElementById('editDineAround').value,
        headshotSlot: document.getElementById('editHeadshotSlot').value,
        checkedIn: document.getElementById('editCheckedIn').checked,
      };

      const pw = document.getElementById('editPassword').value;
      if (pw) body.password = pw;

      try {
        const res = await fetch(`/api/registrations/${id}`, {
          method: 'PUT',
          headers: adminHeaders(),
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
          editError.textContent = data.error || 'Failed to save.';
          editError.hidden = false;
          return;
        }

        // Use the server's authoritative response to update our local cache
        // and re-render immediately — avoids any Blobs read-after-write lag.
        if (data.registration) {
          const idx = currentRegistrations.findIndex(r => r.id === id);
          if (idx !== -1) currentRegistrations[idx] = data.registration;
          // Re-sort in case the name changed
          currentRegistrations.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
          );
          renderTable(currentRegistrations);
        }
        editModal.hidden = true;
      } catch {
        editError.textContent = 'Network error. Please try again.';
        editError.hidden = false;
      }
    });

    function esc(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function formatDate(iso) {
      if (!iso) return '—';
      try {
        return new Date(iso).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return iso;
      }
    }

    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadRegistrations(searchInput.value.trim());
      }, 300);
    });

    exportBtn.addEventListener('click', async () => {
      // Use fetch with auth header instead of direct navigation
      try {
        const res = await fetch('/api/registrations/export', {
          headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) {
          alert('Failed to export. Please try again.');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'registrations.csv';
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        alert('Network error. Please try again.');
      }
    });

    // ── Broadcast / Communication ──────────────────
    const broadcastBtn = document.getElementById('broadcastBtn');
    const broadcastModal = document.getElementById('broadcastModal');
    const broadcastForm = document.getElementById('broadcastForm');
    const broadcastCancel = document.getElementById('broadcastCancel');
    const broadcastError = document.getElementById('broadcastError');
    const broadcastSuccess = document.getElementById('broadcastSuccess');

    broadcastBtn.addEventListener('click', () => {
      broadcastError.hidden = true;
      broadcastSuccess.hidden = true;
      broadcastModal.hidden = false;
    });

    broadcastCancel.addEventListener('click', () => { broadcastModal.hidden = true; });
    broadcastModal.addEventListener('click', (e) => {
      if (e.target === broadcastModal) broadcastModal.hidden = true;
    });

    broadcastForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      broadcastError.hidden = true;
      broadcastSuccess.hidden = true;

      const subject = document.getElementById('broadcastSubject').value.trim();
      const message = document.getElementById('broadcastMessage').value.trim();

      if (!subject || !message) {
        broadcastError.textContent = 'Subject and message are required.';
        broadcastError.hidden = false;
        return;
      }

      // Get admin user info from localStorage
      let senderEmail = 'kkataila@banyansoftware.com';
      let senderName = 'Admin';
      try {
        const u = JSON.parse(localStorage.getItem('glc-user'));
        if (u) { senderEmail = u.email; senderName = u.name; }
      } catch {}

      const sendBtn = document.getElementById('broadcastSend');
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';

      try {
        const res = await fetch('/api/broadcast', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ subject, message, senderEmail, senderName })
        });

        if (res.ok) {
          const data = await res.json();
          broadcastSuccess.textContent = `Communication sent to ${data.memberCount} users via group chat!`;
          broadcastSuccess.hidden = false;
          broadcastForm.reset();
        } else {
          const data = await res.json();
          broadcastError.textContent = data.error || 'Failed to send.';
          broadcastError.hidden = false;
        }
      } catch {
        broadcastError.textContent = 'Network error. Please try again.';
        broadcastError.hidden = false;
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send to All Users';
      }
    });

    // ── Reset Chat ────────────────────────────────────
    const resetChatBtn = document.getElementById('resetChatBtn');
    resetChatBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete ALL chat conversations and messages? This cannot be undone.')) return;
      if (!confirm('This will permanently remove all DMs, groups, and message history. Continue?')) return;

      resetChatBtn.disabled = true;
      resetChatBtn.textContent = 'Resetting...';

      try {
        const res = await fetch('/chat-api/reset', { method: 'POST' });
        if (res.ok) {
          alert('All chat conversations and messages have been cleared.');
        } else {
          alert('Failed to reset chat. Please try again.');
        }
      } catch {
        alert('Network error. Please try again.');
      } finally {
        resetChatBtn.disabled = false;
        resetChatBtn.textContent = 'Reset Chat';
      }
    });

    // ── Import CSV ────────────────────────────────────
    const importBtn     = document.getElementById('importBtn');
    const importModal   = document.getElementById('importModal');
    const importCancel  = document.getElementById('importCancel');
    const importConfirm = document.getElementById('importConfirm');
    const csvFileInput  = document.getElementById('csvFileInput');
    const csvFileName   = document.getElementById('csvFileName');
    const importError   = document.getElementById('importError');
    const importSuccess = document.getElementById('importSuccess');

    let parsedCSVRecords = null;

    importBtn.addEventListener('click', () => {
      csvFileInput.value = '';
      csvFileName.textContent = 'No file chosen';
      importConfirm.disabled = true;
      importError.hidden = true;
      importSuccess.hidden = true;
      parsedCSVRecords = null;
      importModal.hidden = false;
    });

    importCancel.addEventListener('click', () => { importModal.hidden = true; });
    importModal.addEventListener('click', (e) => {
      if (e.target === importModal) importModal.hidden = true;
    });

    csvFileInput.addEventListener('change', () => {
      importError.hidden = true;
      importSuccess.hidden = true;
      importConfirm.disabled = true;
      parsedCSVRecords = null;
      const file = csvFileInput.files[0];
      if (!file) { csvFileName.textContent = 'No file chosen'; return; }
      csvFileName.textContent = file.name;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          parsedCSVRecords = parseCSV(evt.target.result);
          if (parsedCSVRecords.length === 0) {
            importError.textContent = 'No data rows found in the CSV.';
            importError.hidden = false;
            return;
          }
          importConfirm.disabled = false;
          importSuccess.textContent = `${parsedCSVRecords.length} row${parsedCSVRecords.length !== 1 ? 's' : ''} ready to import.`;
          importSuccess.hidden = false;
        } catch (err) {
          importError.textContent = 'Could not parse CSV. Make sure it is a valid CSV file.';
          importError.hidden = false;
        }
      };
      reader.readAsText(file);
    });

    importConfirm.addEventListener('click', async () => {
      if (!parsedCSVRecords || parsedCSVRecords.length === 0) return;
      importError.hidden = true;
      importSuccess.hidden = true;
      importConfirm.disabled = true;
      importConfirm.textContent = 'Uploading…';

      try {
        const res = await fetch('/api/registrations/import', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ records: parsedCSVRecords })
        });
        const data = await res.json();

        if (!res.ok) {
          importError.textContent = data.error || 'Import failed. Please try again.';
          importError.hidden = false;
          return;
        }

        importSuccess.textContent = `Done! ${data.updated} record${data.updated !== 1 ? 's' : ''} updated, ${data.skipped} skipped.`;
        importSuccess.hidden = false;
        parsedCSVRecords = null;
        csvFileInput.value = '';
        csvFileName.textContent = 'No file chosen';
        loadRegistrations(searchInput.value.trim());

        // Switch to close state
        importCancel.disabled = true;
        importCancel.style.opacity = '0.4';
        importConfirm.disabled = false;
        importConfirm.textContent = 'Close';
        importConfirm.onclick = () => {
          importModal.hidden = true;
          importConfirm.textContent = 'Yes, Overwrite Data';
          importConfirm.onclick = null;
          importCancel.disabled = false;
          importCancel.style.opacity = '';
        };
      } catch {
        importError.textContent = 'Network error. Please try again.';
        importError.hidden = false;
      } finally {
        if (importConfirm.textContent !== 'Close') {
          importConfirm.disabled = false;
          importConfirm.textContent = 'Yes, Overwrite Data';
        }
      }
    });

    // ── CSV Parser ────────────────────────────────────
    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = false; }
          } else { current += ch; }
        } else {
          if (ch === '"') { inQuotes = true; }
          else if (ch === ',') { result.push(current); current = ''; }
          else { current += ch; }
        }
      }
      result.push(current);
      return result;
    }

    function parseCSV(text) {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) return [];
      const headers = parseCSVLine(lines[0]);
      // Normalise headers to camelCase field names matching our export
      const KEY_MAP = {
        'name': 'name', 'title': 'title', 'organization': 'organization',
        'email': 'email', 'arrival date': 'arrivalDate', 'departure date': 'departureDate',
        'phone': 'phone', 'dietary': 'dietary', 'dietary other': 'dietaryOther',
        'sessions': 'sessions', 'welcome reception': 'welcomeReception',
        'dine around': 'dineAround', 'morning connection': 'morningConnection',
        'headshot slot': 'headshotSlot',
        't-shirt fit': 'tshirtFit', 't-shirt size': 'tshirt',
        'registered': 'registeredAt'
      };
      const keys = headers.map(h => KEY_MAP[h.toLowerCase().trim()] || h.toLowerCase().trim());
      return lines.slice(1)
        .filter(l => l.trim())
        .map(line => {
          const vals = parseCSVLine(line);
          const obj = {};
          keys.forEach((k, i) => { obj[k] = vals[i] !== undefined ? vals[i] : ''; });
          return obj;
        });
    }

    // Silently sync broadcast group membership with current registrations
    fetch('/chat-api/sync-broadcast', { method: 'POST' }).catch(() => {});

    // Reload when restored from browser back-forward cache (covers nav-link returns)
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) location.reload();
    });

    // Re-fetch when switching back to this tab
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadRegistrations(searchInput.value.trim());
    });

    loadRegistrations();
  }
});
