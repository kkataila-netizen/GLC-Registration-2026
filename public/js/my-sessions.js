/* ============================================================
   My Sessions — personalized agenda from the user's own selections
   ============================================================ */
(() => {
  'use strict';

  const MC_LABELS = {
    bustour: 'Hop-On City Sightseeing Bus Tour',
    yoga1: 'Yoga & Puppies — Session #1',
    yoga2: 'Yoga & Puppies — Session #2',
    walking: 'Downtown Toronto Walking Tour',
    canoeing: 'Canoeing Toronto',
    paddleboard: 'Stand-Up Paddleboarding'
  };
  const MC_TIMES = {
    bustour: '7:00 – 8:30 AM',
    yoga1: '8:00 – 8:25 AM',
    yoga2: '8:30 – 9:00 AM',
    walking: '7:30 – 9:00 AM',
    canoeing: '7:30 – 9:00 AM',
    paddleboard: '7:00 – 8:00 AM'
  };
  const DINE_LABELS = { biffs: "Biff's Bistro", jump: 'Jump Restaurant', joneses: 'The Joneses' };

  // Tuesday track/session assignments come from the HR/admin fields. A person
  // is attending when the field has any non-empty, non-negative value.
  const TUESDAY_TRACKS = [
    { key: 'trackAINative',        tag: 'Track',   title: 'AI Native Track',              time: 'Morning',           rank: 1 },
    { key: 'trackELP',             tag: 'Track',   title: 'ELP Track',                    time: 'Morning',           rank: 1 },
    { key: 'trackOperatingLeader', tag: 'Track',   title: 'Operating Leader Track',       time: 'Morning',           rank: 1 },
    { key: 'trackHQFunctional',    tag: 'Session', title: 'HQ Functional Sessions',       time: 'Afternoon',         rank: 3 },
    { key: 'trackNewCEO',          tag: 'Session', title: 'New CEO Session',              time: 'Afternoon',         rank: 3 },
    { key: 'trackHQEvening',       tag: 'Event',   title: 'HQ Evening Event',             time: 'Evening',           rank: 5 },
    { key: 'ceoWelcome',           tag: 'Event',   title: 'CEO Welcome Event & Dinner',   time: 'Evening',           rank: 5 }
  ];

  function isAffirmative(v) {
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    return !['no', 'n', '0', 'false', '-', 'none', 'n/a', 'na'].includes(s);
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem('glc-user')); } catch { return null; }
  }
  function getUserToken() { return localStorage.getItem('glc-user-token') || ''; }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function formatHeadshot(slot) {
    if (!slot) return null;
    if (slot === 'queue') return 'Waitlist (time to be assigned)';
    const [h, m] = slot.split(':').map(Number);
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  // Build the day → events structure from the registration record
  function buildAgenda(reg) {
    const tue = [], wed = [], thu = [];

    // Tuesday, July 14 — track/session assignments from HR fields
    TUESDAY_TRACKS.forEach(t => {
      if (isAffirmative(reg[t.key])) {
        tue.push({ tag: t.tag, time: t.time, title: t.title, rank: t.rank });
      }
    });
    if (Array.isArray(reg.sessions) && reg.sessions.includes('Tue: Banyan Fundamentals Workshop')) {
      tue.push({ tag: 'Session', time: '12:00 – 5:00 PM', title: 'Banyan Operating System (BOS) Fundamentals', rank: 2 });
    }
    if (reg.welcomeReception) {
      tue.push({ tag: 'Reception', time: '6:00 – 9:00 PM', title: 'Welcome Reception', rank: 4 });
    }
    tue.sort((a, b) => (a.rank || 99) - (b.rank || 99));

    // Wednesday, July 15
    if (reg.morningConnection && MC_LABELS[reg.morningConnection]) {
      wed.push({ tag: 'Morning Activity', time: MC_TIMES[reg.morningConnection] || 'Morning', title: MC_LABELS[reg.morningConnection] });
    }
    const hs = formatHeadshot(reg.headshotSlot);
    if (hs) {
      wed.push({ tag: 'Headshot', time: hs, title: 'Professional Headshot' });
    }

    // Thursday, July 16
    if (reg.dineAround && DINE_LABELS[reg.dineAround]) {
      thu.push({ tag: 'Dine Around', time: 'Evening', title: DINE_LABELS[reg.dineAround] });
    }

    return [
      { day: 'Tuesday, July 14', events: tue },
      { day: 'Wednesday, July 15', events: wed },
      { day: 'Thursday, July 16', events: thu }
    ];
  }

  function renderAgenda(agenda) {
    const container = document.getElementById('msAgenda');
    const totalEvents = agenda.reduce((n, d) => n + d.events.length, 0);

    if (totalEvents === 0) {
      container.innerHTML = `
        <div class="ms-empty">
          <p>You haven't selected any sessions or activities yet.</p>
          <p style="margin-top:.5rem">Head to <a href="/activities.html">Activities</a> or your
          <a href="/register.html">profile</a> to make your selections.</p>
        </div>`;
      return;
    }

    container.innerHTML = agenda.map(d => {
      if (!d.events.length) return '';
      const rows = d.events.map(e => `
        <div class="event-row">
          <span class="event-row__tag">${esc(e.tag)}</span>
          <div class="event-row__time">${esc(e.time)}</div>
          <div class="event-row__title">${esc(e.title)}</div>
        </div>
      `).join('');
      return `
        <div>
          <div class="agenda__day">${esc(d.day)}</div>
          <div class="track-block" style="margin-top:1rem">
            <div class="track-block__label">GLC</div>
            <div class="track-block__content">${rows}</div>
          </div>
        </div>`;
    }).join('');
  }

  async function init() {
    const user = getUser();
    const token = getUserToken();
    const subtitle = document.getElementById('msSubtitle');
    const container = document.getElementById('msAgenda');

    if (!user || !token) {
      container.innerHTML = `<div class="ms-empty"><p>Please <a href="/register.html">log in</a> to view your schedule.</p></div>`;
      return;
    }

    if (user.name) subtitle.textContent = `${user.name}'s personal schedule for GLC 2026`;

    try {
      const res = await fetch(`/api/registrations?search=${encodeURIComponent(user.email)}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const reg = (data.registrations || []).find(r => r.email === user.email.toLowerCase());
      if (!reg) {
        container.innerHTML = `<div class="ms-empty"><p>We couldn't find your registration record.</p></div>`;
        return;
      }
      renderAgenda(buildAgenda(reg));
    } catch {
      container.innerHTML = `<div class="ms-empty"><p>Could not load your schedule. Please try again later.</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
