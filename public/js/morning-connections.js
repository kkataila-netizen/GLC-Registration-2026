/* ============================================================
   Morning Connections — activity selection
   ============================================================ */
(() => {
  'use strict';

  const ACTIVITIES = [
    {
      id: 'bustour',
      name: "Hop-On City Sightseeing Bus Tour",
      tagline: "Private Open-Top Double Decker",
      time: "7:00 – 8:30 am",
      description: "See Toronto from the top down. Climb aboard a private open-top double decker and take in the city's landmarks, neighbourhoods, and waterfront views as a local guide brings it all to life. Sit back, soak up the skyline, and let the city roll by before the day begins.",
      capacity: 80,
      photo: "https://images.unsplash.com/photo-1776625723470-711a3543a71d?w=800&q=80&fit=crop&crop=center"
    },
    {
      id: 'yoga1',
      name: "Yoga & Puppies — Session #1",
      tagline: "Stretches, Smiles & Tail Wags",
      time: "8:00 – 8:25 am",
      description: "Start your morning with stretches, smiles, and a whole lot of tail wags. Join a guided yoga session alongside adorable rescue puppies for a truly one-of-a-kind way to set the tone for the day ahead.",
      note: "Please wear socks for the puppy yoga sessions",
      capacity: 22,
      photo: "/images/puppy_yoga.webp"
    },
    {
      id: 'yoga2',
      name: "Yoga & Puppies — Session #2",
      tagline: "Stretches, Smiles & Tail Wags",
      time: "8:30 – 9:00 am",
      description: "Start your morning with stretches, smiles, and a whole lot of tail wags. Join a guided yoga session alongside adorable rescue puppies for a truly one-of-a-kind way to set the tone for the day ahead.",
      note: "Please wear socks for the puppy yoga sessions",
      capacity: 22,
      photo: "/images/puppy_yoga.webp"
    },
    {
      id: 'walking',
      name: "Downtown Toronto Walking Tour",
      tagline: "Iconic Streets & Hidden Gems",
      time: "7:30 – 9:00 am",
      description: "Lace up and explore the city on foot. Led by local experts from the Royal York Hotel, this 90-minute guided tour winds through Toronto's most iconic streets and hidden gems. The perfect way to get your steps in and your bearings on this incredible city.",
      capacity: 35,
      photo: "https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=800&q=80&fit=crop&crop=center"
    },
    {
      id: 'canoeing',
      name: "Canoeing Toronto",
      tagline: "Adventure on Lake Ontario",
      time: "7:30 – 9:00 am",
      description: "Hit the water before the day hits you. Meet your guide at Harbourfront for a group canoe experience on Lake Ontario that's equal parts adventure and fresh air. No experience needed, just show up ready to paddle.",
      capacity: 45,
      photo: "/images/canoe.jpg"
    },
    {
      id: 'paddleboard',
      name: "Stand-Up Paddleboarding",
      tagline: "Balance, Splash & Fresh Air",
      time: "7:00 – 8:00 am",
      description: "Ready to test your balance? Join Toronto SUP at the waterfront for a fun and energizing intro to stand-up paddleboarding. Whether you're a first-timer or a seasoned paddler, this one is guaranteed to make a splash. Note: this activity requires transportation to and from Cherry Beach.",
      capacity: 41,
      photo: "/images/SUP.jpg"
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

  // Only these activities are still open for new selections. Existing
  // bookings for other activities are kept, but can't be newly chosen.
  const OPEN_ACTIVITY_IDS = ['bustour'];

  // Cached after first fetch
  let cachedRegId = null;

  // Last known availability counts — updated on load and after selection
  let cachedAvailability = {};

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showMessage(text, type = 'success') {
    const el = document.getElementById('mcMessage');
    el.textContent = text;
    el.className = `mc-message mc-message--${type}`;
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
    const grid = document.getElementById('mcGrid');
    grid.innerHTML = '';

    ACTIVITIES.forEach(a => {
      const avail = availability[a.id] || { taken: 0 };
      const taken  = avail.taken || 0;
      const remaining = Math.max(0, a.capacity - taken);
      const isFull     = remaining === 0;
      const isChosen   = userSelection === a.id;
      const isClosed   = !OPEN_ACTIVITY_IDS.includes(a.id);
      const fillPct    = Math.min(100, (taken / a.capacity) * 100).toFixed(1);
      const capClass   = capacityClass(taken, a.capacity);

      const card = document.createElement('div');
      card.className = [
        'mc-card',
        isChosen ? 'mc-card--selected' : '',
        (isFull || isClosed) && !isChosen ? 'mc-card--full' : ''
      ].filter(Boolean).join(' ');

      let btnLabel, btnClass, btnDisabled;
      if (isChosen) {
        // Keep showing the user's existing selection; if it's a closed
        // activity it's display-only (they can still switch to an open one).
        btnLabel    = '✓ Your Selection';
        btnClass    = 'mc-card__select mc-card__select--chosen';
        btnDisabled = isClosed;
      } else if (isClosed) {
        btnLabel    = 'Selection Closed';
        btnClass    = 'mc-card__select';
        btnDisabled = true;
      } else if (isFull) {
        btnLabel    = 'Fully Booked';
        btnClass    = 'mc-card__select';
        btnDisabled = true;
      } else {
        btnLabel    = 'Select This Activity';
        btnClass    = 'mc-card__select';
        btnDisabled = false;
      }

      const spotsLabel = isFull
        ? '<span style="color:#dc2626">Fully booked</span>'
        : `<span>${remaining} spot${remaining !== 1 ? 's' : ''} remaining</span>`;

      card.innerHTML = `
        <img class="mc-card__photo" src="${esc(a.photo)}" alt="${esc(a.name)}" loading="lazy">
        <div class="mc-card__body">
          <div class="mc-card__tagline">${esc(a.tagline)}</div>
          <div class="mc-card__name">${esc(a.name)}</div>
          <span class="mc-card__time">🕒 ${esc(a.time)}</span>
          <div class="mc-card__desc">${esc(a.description)}${a.note ? `<div style="margin-top:.5rem;font-weight:600;color:#395542">${esc(a.note)}</div>` : ''}</div>
          <div class="mc-card__capacity">
            <div class="mc-card__capacity-label">
              <span>Capacity: ${a.capacity}</span>
              ${spotsLabel}
            </div>
            <div class="capacity-bar">
              <div class="capacity-bar__fill${capClass ? ' capacity-bar__fill--' + capClass : ''}"
                   style="width:${fillPct}%"></div>
            </div>
          </div>
          ${isChosen ? '<div class="mc-selected-badge">✓ You\'re registered for this activity</div>' : ''}
          <button class="${btnClass}" data-id="${esc(a.id)}" ${btnDisabled ? 'disabled' : ''}>
            ${btnLabel}
          </button>
        </div>
      `;

      grid.appendChild(card);
    });

    // Wire up select buttons
    grid.querySelectorAll('.mc-card__select:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => selectActivity(btn.dataset.id));
    });
  }

  async function loadAvailability() {
    try {
      const res = await fetch('/api/morning-connections');
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
      cachedRegId = reg.id; // cache for use in selectActivity
      return reg.morningConnection || null;
    } catch {
      return null;
    }
  }

  async function selectActivity(activityId) {
    const user = getUser();
    const token = getUserToken();

    if (!user || !token || !cachedRegId) {
      showMessage('Please log in to make your selection.', 'error');
      return;
    }

    const regId = cachedRegId;
    const prevSelection = currentSelection;

    // Disable all buttons while saving
    document.querySelectorAll('.mc-card__select').forEach(b => b.disabled = true);

    try {
      const res = await fetch(`/api/registrations/${regId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ morningConnection: activityId })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showMessage(data.error || 'Failed to save selection. Please try again.', 'error');
        return;
      }

      const activity = ACTIVITIES.find(a => a.id === activityId);
      showMessage(`You're registered for ${activity ? activity.name : 'the selected activity'}!`);

      // Optimistically update counts immediately — no reload needed
      const optimistic = {};
      ACTIVITIES.forEach(a => {
        optimistic[a.id] = { taken: cachedAvailability[a.id]?.taken || 0 };
      });
      // Free up the previous selection
      if (prevSelection && prevSelection !== activityId && optimistic[prevSelection]) {
        optimistic[prevSelection].taken = Math.max(0, optimistic[prevSelection].taken - 1);
      }
      // Claim the new selection (only add if this is a new pick, not a re-select)
      if (prevSelection !== activityId) {
        optimistic[activityId].taken = (optimistic[activityId].taken || 0) + 1;
      }
      cachedAvailability = optimistic;
      currentSelection = activityId;
      renderCards(cachedAvailability, currentSelection);

      // Reset the 30s poll so it doesn't fire immediately with stale server data
      resetPoll();

    } catch {
      showMessage('Network error. Please try again.', 'error');
    } finally {
      document.querySelectorAll('.mc-card__select').forEach(b => b.disabled = false);
    }
  }

  // Keep track of current selection for polling re-renders
  let currentSelection = null;
  let pollInterval = null;

  async function refreshAvailability() {
    cachedAvailability = await loadAvailability();
    renderCards(cachedAvailability, currentSelection);
  }

  function resetPoll() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(refreshAvailability, 30000);
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

    cachedAvailability = availability;
    currentSelection = userSelection;
    renderCards(availability, userSelection);

    // Auto-refresh availability every 30 seconds
    resetPoll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
