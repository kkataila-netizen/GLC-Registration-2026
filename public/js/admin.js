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

    async function loadRegistrations(search = '') {
      try {
        const url = search
          ? `/api/registrations?search=${encodeURIComponent(search)}`
          : '/api/registrations';

        const res = await fetch(url, {
          headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });

        if (res.status === 401) {
          localStorage.removeItem('glc-admin-token');
          location.reload();
          return;
        }

        const data = await res.json();

        regCount.textContent = `${data.total} registration${data.total !== 1 ? 's' : ''}`;
        renderTable(data.registrations);
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

    function openEditModal(reg) {
      document.getElementById('editId').value = reg.id;
      document.getElementById('editName').value = reg.name || '';
      document.getElementById('editEmail').value = reg.email || '';
      document.getElementById('editPassword').value = '';
      document.getElementById('editArrival').value = reg.arrivalDate || '';
      document.getElementById('editDeparture').value = reg.departureDate || '';
      document.getElementById('editPhone').value = reg.phone || '';
      document.getElementById('editOrg').value = reg.organization || '';
      document.getElementById('editDietary').value = reg.dietary || 'None';
      document.getElementById('editTshirt').value = reg.tshirt || '';
      document.getElementById('editSessionBOS').checked = Array.isArray(reg.sessions) && reg.sessions.includes('Tue: Banyan Fundamentals Workshop');
      document.getElementById('editWelcomeReception').checked = !!reg.welcomeReception;
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
        email: document.getElementById('editEmail').value,
        arrivalDate: document.getElementById('editArrival').value,
        departureDate: document.getElementById('editDeparture').value,
        phone: document.getElementById('editPhone').value,
        organization: document.getElementById('editOrg').value,
        dietary: document.getElementById('editDietary').value,
        tshirt: document.getElementById('editTshirt').value,
        sessions: document.getElementById('editSessionBOS').checked ? ['Tue: Banyan Fundamentals Workshop'] : [],
        welcomeReception: document.getElementById('editWelcomeReception').checked,
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

        editModal.hidden = true;
        setTimeout(() => location.reload(), 600);
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
        'dine around': 'dineAround', 't-shirt fit': 'tshirtFit', 't-shirt size': 'tshirt',
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

    // Reload table whenever the admin returns to this tab/page
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadRegistrations(searchInput.value.trim());
    });

    loadRegistrations();
  }
});
