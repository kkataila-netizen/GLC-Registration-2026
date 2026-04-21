/* ============================================================
   Dine Around Event — restaurant selection
   ============================================================ */
(() => {
  'use strict';

  const RESTAURANTS = [
    {
      id: 'biffs',
      name: "Biff's Bistro",
      tagline: "Classic French Bistro | Refined & Intimate",
      description: "Enjoy a timeless dining experience featuring French-inspired cuisine in a warm, elegant setting. Perfect for those looking for a more traditional and relaxed evening.",
      capacity: 72,
      photo: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&fit=crop&crop=center"
    },
    {
      id: 'jump',
      name: "Jump Restaurant",
      tagline: "Modern Steakhouse | Elevated & High-Energy",
      description: "A premium dining experience with bold flavours and standout dishes, including surf & turf. Ideal for those looking for a lively, upscale atmosphere.",
      capacity: 100,
      photo: "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80&fit=crop&crop=center"
    },
    {
      id: 'joneses',
      name: "The Joneses",
      tagline: "Social Dining | Fun & Relaxed",
      description: "A vibrant, modern space with a comfort-driven menu and energetic vibe. Great for those looking to unwind and connect in a more casual setting.",
      capacity: 70,
      photo: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80&fit=crop&crop=center"
    }
  ];

  function getUser() {
    try {
      const s = localStorage.getItem('glc-user');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  function getUserToken() {
    return localStorage.getItem('glc-user-token') || '';
  }

  // Cached after first fetch
  let cachedRegId = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showMessage(text, type = 'success') {
    const el = document.getElementById('dineMessage');
    el.textContent = text;
    el.className = `dine-message dine-message--${type}`;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 5000);
  }

  function capacityClass(taken, capacity) {
    const pct = taken / capacity;
    if (pct >= 1)    return 'full';
    if (pct >= 0.75) return 'warning';
    return '';
  }

  function renderCards(availability, userSelection) {
    const grid = document.getElementById('dineGrid');
    grid.innerHTML = '';

    RESTAURANTS.forEach(r => {
      const avail = availability[r.id] || { taken: 0 };
      const taken  = avail.taken || 0;
      const remaining = Math.max(0, r.capacity - taken);
      const isFull     = remaining === 0;
      const isChosen   = userSelection === r.id;
      const fillPct    = Math.min(100, (taken / r.capacity) * 100).toFixed(1);
      const capClass   = capacityClass(taken, r.capacity);

      const card = document.createElement('div');
      card.className = [
        'dine-card',
        isChosen ? 'dine-card--selected' : '',
        isFull && !isChosen ? 'dine-card--full' : ''
      ].filter(Boolean).join(' ');

      let btnLabel, btnClass, btnDisabled;
      if (isChosen) {
        btnLabel    = '✓ Your Selection';
        btnClass    = 'dine-card__select dine-card__select--chosen';
        btnDisabled = false;
      } else if (isFull) {
        btnLabel    = 'Fully Booked';
        btnClass    = 'dine-card__select';
        btnDisabled = true;
      } else {
        btnLabel    = 'Select This Restaurant';
        btnClass    = 'dine-card__select';
        btnDisabled = false;
      }

      const spotsLabel = isFull
        ? '<span style="color:#dc2626">Fully booked</span>'
        : `<span>${remaining} spot${remaining !== 1 ? 's' : ''} remaining</span>`;

      card.innerHTML = `
        <img class="dine-card__photo" src="${esc(r.photo)}" alt="${esc(r.name)}" loading="lazy">
        <div class="dine-card__body">
          <div class="dine-card__tagline">${esc(r.tagline)}</div>
          <div class="dine-card__name">${esc(r.name)}</div>
          <div class="dine-card__desc">${esc(r.description)}</div>
          <div class="dine-card__capacity">
            <div class="dine-card__capacity-label">
              <span>Capacity: ${r.capacity}</span>
              ${spotsLabel}
            </div>
            <div class="capacity-bar">
              <div class="capacity-bar__fill${capClass ? ' capacity-bar__fill--' + capClass : ''}"
                   style="width:${fillPct}%"></div>
            </div>
          </div>
          ${isChosen ? '<div class="dine-selected-badge">✓ You\'re registered for this dinner</div>' : ''}
          <button class="${btnClass}" data-id="${esc(r.id)}" ${btnDisabled ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    // Wire up select buttons
    grid.querySelectorAll('.dine-card__select:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => selectRestaurant(btn.dataset.id));
    });
  }

  async function loadAvailability() {
    try {
      const res = await fetch('/api/dine-around');
      if (!res.ok) throw new Error();
      return (await res.json()).availability || {};
    } catch {
      return {};
    }
  }

  async function loadUserSelection() {
    const user = getUser();
    const token = getUserToken();
    if (!user || !token) return null;

    try {
      const res = await fetch(`/api/registrations?search=${encodeURIComponent(user.email)}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const reg = (data.registrations || []).find(r => r.email === user.email.toLowerCase());
      if (!reg) return null;
      cachedRegId = reg.id; // cache for use in selectRestaurant
      return reg.dineAround || null;
    } catch {
      return null;
    }
  }

  async function selectRestaurant(restaurantId) {
    const user = getUser();
    const token = getUserToken();

    if (!user || !token || !cachedRegId) {
      showMessage('Please log in to make your selection.', 'error');
      return;
    }

    const regId = cachedRegId;

    // Disable all buttons while saving
    document.querySelectorAll('.dine-card__select').forEach(b => b.disabled = true);

    try {
      const res = await fetch(`/api/registrations/${regId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ dineAround: restaurantId })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showMessage(data.error || 'Failed to save selection. Please try again.', 'error');
        return;
      }

      const restaurant = RESTAURANTS.find(r => r.id === restaurantId);
      showMessage(`You're registered for ${restaurant ? restaurant.name : 'the selected restaurant'}!`);

      // Brief delay so DB write is fully committed before re-fetching counts
      await new Promise(r => setTimeout(r, 600));
      currentSelection = restaurantId;
      const availability = await loadAvailability();
      renderCards(availability, restaurantId);

    } catch {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      document.querySelectorAll('.dine-card__select').forEach(b => b.disabled = false);
    }
  }

  // Keep track of current selection for polling re-renders
  let currentSelection = null;

  async function refreshAvailability() {
    const availability = await loadAvailability();
    renderCards(availability, currentSelection);
  }

  async function init() {
    const user = getUser();
    const loginNotice = document.getElementById('loginNotice');

    if (!user) {
      loginNotice.hidden = false;
    }

    const [availability, userSelection] = await Promise.all([
      loadAvailability(),
      user ? loadUserSelection() : Promise.resolve(null)
    ]);

    currentSelection = userSelection;
    renderCards(availability, userSelection);

    // Auto-refresh availability every 30 seconds
    setInterval(refreshAvailability, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
