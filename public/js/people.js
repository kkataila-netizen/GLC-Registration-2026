document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('peopleGrid');
  const emptyState = document.getElementById('peopleEmpty');
  const countBadge = document.getElementById('attendeeCount');
  const searchInput = document.getElementById('peopleSearch');
  const myChatsBtn = document.getElementById('myChatsBtn');

  // Show "My Chats" pill only for logged-in users; opens the full chat window
  // (no dm/conv param) so all existing conversations are listed in the sidebar.
  (function initMyChats() {
    let user = null;
    try { user = JSON.parse(localStorage.getItem('glc-user')); } catch { /* ignore */ }
    if (!user) return;
    myChatsBtn.hidden = false;
    myChatsBtn.addEventListener('click', () => {
      window.open('/chat.html', 'glc-chat', 'width=960,height=700');
    });
  })();

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

    // Sort alphabetically by name (case-insensitive)
    registrations = [...registrations].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );

    registrations.forEach(person => {
      const initials = getInitials(person.name);
      const colorIndex = hashName(person.name) % AVATAR_COLORS.length;
      const color = AVATAR_COLORS[colorIndex];

      const card = document.createElement('div');
      card.className = 'person-card';
      card.style.cursor = 'pointer';
      card.title = `Click to message ${person.name}`;

      // Avatar: start with initials, swap to photo if one exists
      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'person-avatar';
      avatarWrap.style.background = color;
      avatarWrap.textContent = initials;

      const v = localStorage.getItem('glc-photo-bust') || '';
      const photoUrl = `/api/profile-photo?email=${encodeURIComponent(person.email)}${v ? '&v=' + v : ''}`;
      const preloader = new Image();
      preloader.onload = () => {
        // Photo exists — replace initials with circular photo
        const img = document.createElement('img');
        img.className = 'person-avatar-photo';
        img.src = photoUrl;
        img.alt = person.name;
        avatarWrap.textContent = '';
        avatarWrap.style.background = 'transparent';
        avatarWrap.appendChild(img);
      };
      preloader.src = photoUrl; // 404 = onload never fires, initials stay

      // Name
      const nameEl = document.createElement('div');
      nameEl.className = 'person-card__name';
      nameEl.textContent = person.name;

      // Organisation
      const orgEl = document.createElement('div');
      orgEl.className = 'person-card__org';
      orgEl.textContent = person.organization || '—';

      // Title (optional)
      const chatEl = document.createElement('div');
      chatEl.className = 'person-card__chat';
      chatEl.textContent = '💬 Message';

      card.appendChild(avatarWrap);
      card.appendChild(nameEl);
      card.appendChild(orgEl);
      if (person.title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'person-card__arrival';
        titleEl.textContent = person.title;
        card.appendChild(titleEl);
      }
      card.appendChild(chatEl);

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

  function getUserToken() {
    return localStorage.getItem('glc-user-token') || '';
  }

  async function fetchPeople(search) {
    try {
      let url = '/api/people';
      if (search) {
        url += '?search=' + encodeURIComponent(search);
      }
      const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + getUserToken() }
      });
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
