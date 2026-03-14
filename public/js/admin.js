document.addEventListener('DOMContentLoaded', () => {
  const ADMIN_PASSWORD = 'GLC2026';

  const gate = document.getElementById('adminGate');
  const gateForm = document.getElementById('gateForm');
  const gatePassword = document.getElementById('gatePassword');
  const gateError = document.getElementById('gateError');
  const adminContent = document.getElementById('adminContent');

  // Check if already authenticated this session
  if (sessionStorage.getItem('adminAuth') === 'true') {
    showDashboard();
  } else {
    gatePassword.focus();
  }

  gateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    gateError.hidden = true;

    if (gatePassword.value === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminAuth', 'true');
      showDashboard();
    } else {
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

        const res = await fetch(url);
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
          <td>${esc(r.phone) || '—'}</td>
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
        const res = await fetch(`/api/registrations/${id}`, { method: 'DELETE' });
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
      };

      const pw = document.getElementById('editPassword').value;
      if (pw) body.password = pw;

      try {
        const res = await fetch(`/api/registrations/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
          editError.textContent = data.error || 'Failed to save.';
          editError.hidden = false;
          return;
        }

        editModal.hidden = true;
        loadRegistrations(searchInput.value.trim());
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

    exportBtn.addEventListener('click', () => {
      window.location.href = '/api/registrations/export';
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
          headers: { 'Content-Type': 'application/json' },
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

    loadRegistrations();
  }
});
