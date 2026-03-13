document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('peopleGrid');
  const emptyState = document.getElementById('peopleEmpty');
  const countBadge = document.getElementById('attendeeCount');
  const searchInput = document.getElementById('peopleSearch');

  const AVATAR_COLORS = [
    '#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706',
    '#0891b2', '#4f46e5', '#be123c', '#15803d', '#a16207'
  ];

  function hashName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  function getInitials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.trim().substring(0, 2).toUpperCase();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function renderPeople(registrations) {
    grid.innerHTML = '';

    if (registrations.length === 0) {
      grid.hidden = true;
      emptyState.hidden = false;
      return;
    }

    grid.hidden = false;
    emptyState.hidden = true;

    registrations.forEach(person => {
      const initials = getInitials(person.name);
      const colorIndex = hashName(person.name) % AVATAR_COLORS.length;
      const color = AVATAR_COLORS[colorIndex];

      const card = document.createElement('div');
      card.className = 'person-card';
      card.style.cursor = 'pointer';
      card.title = `Click to message ${person.name}`;
      card.innerHTML = `
        <div class="person-avatar" style="background:${color}">${initials}</div>
        <div class="person-card__name">${escapeHtml(person.name)}</div>
        <div class="person-card__org">${person.organization ? escapeHtml(person.organization) : '—'}</div>
        ${person.title ? `<div class="person-card__arrival">${escapeHtml(person.title)}</div>` : ''}
        <div class="person-card__chat">💬 Message</div>
      `;
      card.addEventListener('click', () => {
        window.open('/chat.html?dm=' + encodeURIComponent(person.email), 'glc-chat', 'width=960,height=700');
      });
      grid.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function fetchPeople(search) {
    try {
      let url = '/api/registrations';
      if (search) {
        url += '?search=' + encodeURIComponent(search);
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      countBadge.textContent = data.total + ' attendee' + (data.total !== 1 ? 's' : '');
      renderPeople(data.registrations);
    } catch (err) {
      grid.innerHTML = '';
      emptyState.textContent = 'Could not load attendees. Please try again later.';
      emptyState.hidden = false;
      grid.hidden = true;
    }
  }

  // Debounced search
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchPeople(searchInput.value.trim());
    }, 300);
  });

  // Initial load
  fetchPeople();
});
