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
        `;
        regTableBody.appendChild(tr);
      });
    }

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

    loadRegistrations();
  }
});
