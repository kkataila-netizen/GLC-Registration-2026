/* ============================================================
   My Sessions — personalized agenda synced to the GLC 2026
   Agenda v3 (titles / times / speakers) plus per-person detail
   from the planning workbook (rooms, meeting instructions).

   Each agenda item has an `audience` predicate deciding whether
   it appears on this person's schedule. Items are sorted by
   start time (sort = minutes since midnight).
   ============================================================ */
(() => {
  'use strict';

  function getUser() {
    try { return JSON.parse(localStorage.getItem('glc-user')); } catch { return null; }
  }
  function getUserToken() { return localStorage.getItem('glc-user-token') || ''; }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // A person is "in" when the field has any non-empty, non-negative value
  function yes(v) {
    if (v == null) return false;
    const s = String(v).trim().toLowerCase();
    if (!s) return false;
    return !['no', 'n', '0', 'false', '-', 'none', 'n/a', 'na'].includes(s);
  }

  const all = () => true;

  // New CEO block shows for the trackNewCEO field OR the original
  // registration-form workshop checkbox (same audience, two signals)
  function isNewCEO(reg) {
    return yes(reg.trackNewCEO) ||
      (Array.isArray(reg.sessions) && reg.sessions.includes('Tue: Banyan Fundamentals Workshop'));
  }

  function isHQ(reg) {
    return yes(reg.trackAINative) || yes(reg.trackHQFunctional);
  }

  // Which HQ functional room, from the free-text trackHQFunctional value
  function hqFunction(reg) {
    const v = String(reg.trackHQFunctional || '').trim().toLowerCase();
    if (!v || ['no', 'n', '0', 'false', '-', 'none', 'n/a', 'na'].includes(v)) return null;
    if (/m\s*&\s*a|m&a|\bbd\b|business dev/.test(v)) return 'bdma';
    if (/fin/.test(v)) return 'finance';
    if (/legal/.test(v)) return 'legal';
    if (/hr|\bit\b|\bta\b|ops|internal/.test(v)) return 'internalops';
    return 'generic'; // affirmative but not a specific function
  }

  // Breakout assignment: the explicit "Operating Group Breakout Session"
  // field wins; falls back to matching the Operating Group field.
  function inOpGroup(reg, leader) {
    const explicit = String(reg.opGroupBreakout || '').trim().toLowerCase();
    if (explicit) return explicit.includes(leader.toLowerCase());
    const og = String(reg.operatingGroup || '').toLowerCase();
    return og.includes(leader.toLowerCase());
  }

  /* ── the agenda (Agenda v3 + workbook detail) ────── */

  const DAYS = ['Tuesday, July 14', 'Wednesday, July 15', 'Thursday, July 16', 'Friday, July 17'];

  const AGENDA = [
    /* ── Day 0 · Tuesday, July 14 ─────────────────── */
    { day: 0, sort: 450,  tag: 'Event', time: '7:30 – 9:00 AM', title: 'Huddle Event', loc: 'Confederation 5 & 6 · Mezzanine Floor', audience: r => yes(r.huddleEvent) },
    { day: 0, sort: 450,  tag: 'Meal', time: '7:30 – 9:00 AM', title: 'Registration & Breakfast', loc: 'Manitoba · Mezzanine Floor', audience: r => yes(r.trackOperatingLeader) || yes(r.trackELP) },
    { day: 0, sort: 540,  tag: 'Track', time: '9:00 AM – 12:00 PM', title: 'Morning Track 1: Driving OpCo Performance — The OL Playbook', who: 'David / Darren', loc: 'Library · Mezzanine Floor', audience: r => yes(r.trackOperatingLeader) },
    { day: 0, sort: 540,  tag: 'Track', time: '9:00 AM – 12:00 PM', title: 'Morning Track 2: ELP Track Sessions', who: 'Ryan', loc: 'York · Mezzanine Floor', audience: r => yes(r.trackELP) },
    { day: 0, sort: 540,  tag: 'Track', time: '9:00 AM – 12:00 PM', title: 'Morning Track 3: Becoming an AI-Native HQ', who: 'Kaz & Kristian', loc: 'Tudor 7 & 8 · Mezzanine Floor', audience: r => yes(r.trackAINative) },
    { day: 0, sort: 705,  tag: 'Meal', time: '11:45 AM – 1:00 PM', title: 'Registration & Lunch (New CEOs + OLs + ELPs)', loc: 'Concert Hall · Convention Floor', audience: r => isNewCEO(r) || yes(r.trackOperatingLeader) || yes(r.trackELP) },
    { day: 0, sort: 705,  tag: 'Meal', time: '11:45 AM – 1:00 PM', title: 'HQ Lunch', loc: 'Manitoba · Mezzanine Floor', audience: isHQ },
    { day: 0, sort: 780,  tag: 'Session', time: '1:00 – 5:00 PM', title: 'HQ Functional Leadership: Business Development (BD) & M&A', loc: 'Tudor 7 & 8 · Mezzanine Floor', audience: r => hqFunction(r) === 'bdma' },
    { day: 0, sort: 780,  tag: 'Session', time: '1:00 – 5:00 PM', title: 'HQ Functional Leadership: Finance', loc: 'Confederation 5 · Mezzanine Floor', audience: r => hqFunction(r) === 'finance' },
    { day: 0, sort: 780,  tag: 'Session', time: '1:00 – 5:00 PM', title: 'HQ Functional Leadership: Legal', loc: 'Confederation 3 · Mezzanine Floor', audience: r => hqFunction(r) === 'legal' },
    { day: 0, sort: 780,  tag: 'Session', time: '1:00 – 5:00 PM', title: 'HQ Functional Leadership: Internal Ops (HR, TA, IT)', loc: 'Confederation 6 · Mezzanine Floor', audience: r => hqFunction(r) === 'internalops' },
    { day: 0, sort: 780,  tag: 'Session', time: '1:00 – 5:00 PM', title: 'HQ Functional Leadership Sessions', loc: 'See your functional room · Mezzanine Floor', audience: r => hqFunction(r) === 'generic' },
    { day: 0, sort: 780,  tag: 'Session', time: '1:00 – 1:15 PM', title: 'Setting the Stage — Driving Performance with the BOS', who: 'David', loc: 'Concert Hall · Convention Floor', audience: isNewCEO },
    { day: 0, sort: 795,  tag: 'Session', time: '1:15 – 1:30 PM', title: 'Ice Breaker', who: 'Darren', loc: 'Concert Hall · Convention Floor', audience: isNewCEO },
    { day: 0, sort: 810,  tag: 'Session', time: '1:30 – 2:15 PM', title: 'Know Your Numbers — Four Metrics That Matter', who: 'Darren', loc: 'Concert Hall · Convention Floor', audience: isNewCEO },
    { day: 0, sort: 870,  tag: 'Session', time: '2:30 – 3:45 PM', title: 'Get Traction — The EOS Method to Focus & Scale', who: 'Tristan', loc: 'Concert Hall · Convention Floor', details: 'Please bring your laptop', audience: isNewCEO },
    { day: 0, sort: 960,  tag: 'Session', time: '4:00 – 5:15 PM', title: 'Grow the Top Line — Four Levers to Grow Revenue', who: 'Reed & Luke', loc: 'Concert Hall · Convention Floor', audience: isNewCEO },
    { day: 0, sort: 1035, tag: 'Session', time: '5:15 – 5:30 PM', title: 'Closing', who: 'Darren & David', loc: 'Concert Hall · Convention Floor', audience: isNewCEO },
    { day: 0, sort: 1080, tag: 'Event', time: '6:00 – 9:00 PM', title: 'Welcome Reception & Dinner', loc: 'SixtyEight at Scotia Plaza · 68th Floor, 40 King St W, Toronto', audience: r => r.welcomeReception || yes(r.ceoWelcome) },

    /* ── Day 1 · Wednesday, July 15 ───────────────── */
    { day: 1, sort: 420,  tag: 'Meal', time: '7:00 – 8:30 AM', title: 'Registration & Breakfast', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 510,  tag: 'Session', time: '8:30 – 9:00 AM', title: 'Welcome & Ice Breaker', who: 'David', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 540,  tag: 'Session', time: '9:00 – 10:00 AM', title: 'Build the Next Version — Our Re-Founding Moment', who: 'David', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 615,  tag: 'Session', time: '10:15 – 11:00 AM', title: 'Pivotal Decisions — CEO Decisions That Changed the Trajectory', who: 'Bricey', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 660,  tag: 'Session', time: '11:00 – 11:30 AM', title: 'Bold Moves — Resetting Your Dev Org for Innovation', who: 'Kay · Fireside Chat', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 690,  tag: 'Session', time: '11:30 AM – 12:00 PM', title: 'One Seat Away — Raise the Talent Bar, Unlock Your Business', who: 'Tonya', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 720,  tag: 'Meal', time: '12:00 – 1:00 PM', title: 'Lunch', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 780,  tag: 'Session', time: '1:00 – 2:00 PM', title: 'Price Like You Mean It — Strategies That Accelerate Growth', who: 'Claire', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 840,  tag: 'Session', time: '2:00 – 2:45 PM', title: 'From the Board Room — How Boards Think About Growth', who: 'David · Panel', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 915,  tag: 'Session', time: '3:15 – 4:00 PM', title: 'Birds of a Feather — Peer Problem Solving', who: 'Table discussions', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 960,  tag: 'Session', time: '4:00 – 4:15 PM', title: 'Closing', who: 'David', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: Darren', loc: 'Confederation 5 · Mezzanine Floor', audience: r => inOpGroup(r, 'Darren') },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: Arun', loc: 'Tudor 7 · Mezzanine Floor', audience: r => inOpGroup(r, 'Arun') },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: Tristan', loc: 'Tudor 8 · Mezzanine Floor', audience: r => inOpGroup(r, 'Tristan') },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: Reed', loc: 'Confederation 3 · Mezzanine Floor', audience: r => inOpGroup(r, 'Reed') },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: Bricey', loc: 'Confederation 6 · Mezzanine Floor', audience: r => inOpGroup(r, 'Bricey') },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: Tobi', loc: 'Salon B · Convention Floor', audience: r => inOpGroup(r, 'Tobi') },
    { day: 1, sort: 990,  tag: 'Breakout', time: '4:30 – 5:30 PM', title: 'Operating Group Breakout: EMEA', loc: 'Concert Hall · Convention Floor', audience: r => inOpGroup(r, 'EMEA') },
    { day: 1, sort: 1095, tag: 'Event', time: '6:15 – 11:00 PM', title: 'GLC Awards Dinner', loc: 'Steam Whistle Brewing, Locomotive Hall · 255 Bremner Blvd, Toronto', audience: all },

    /* ── Day 2 · Thursday, July 16 ────────────────── */
    { day: 2, sort: 360,  tag: 'Meal', time: '6:00 – 8:00 AM', title: 'Breakfast', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 420,  tag: 'Activity', time: '7:00 – 8:30 AM', title: 'Hop-On City Sightseeing Bus Tour', loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator',
      details: 'Meeting time: 6:50 AM · Host: Emily Campbell 905-325-2660 · Attire: casual and comfortable', audience: r => r.morningConnection === 'bustour' },
    { day: 2, sort: 420,  tag: 'Activity', time: '7:00 – 8:00 AM', title: 'Stand-Up Paddleboarding', loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator · Cherry Beach, 1 Cherry St',
      details: 'Meeting time: 6:30 AM (Uber to/from activity) · Host: Kiara 647-573-1369 · Attire: activewear, light jacket, hotel towel, water shoes (optional). Boards, paddles and life jackets provided.',
      link: { href: 'https://waiver.smartwaiver.com/w/60d9e27106749/web/', label: 'Complete the waiver' }, audience: r => r.morningConnection === 'paddleboard' },
    { day: 2, sort: 450,  tag: 'Activity', time: '7:30 – 9:00 AM', title: 'Downtown Toronto Walking Tour', loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator',
      details: 'Meeting time: 7:20 AM · Host: Zuzu Wilson 416-356-2642 · Attire: casual and comfortable', audience: r => r.morningConnection === 'walking' },
    { day: 2, sort: 450,  tag: 'Activity', time: '7:30 – 9:00 AM', title: 'Canoeing Toronto', loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator · 283a Queens Quay W',
      details: 'Meeting time: 7:15 AM · Host: Emily Campbell 905-325-2660 · Attire: activewear, light jacket, hotel towel, water shoes (optional). Canoes and life jackets provided.', audience: r => r.morningConnection === 'canoeing' },
    { day: 2, sort: 480,  tag: 'Activity', time: '8:00 – 8:25 AM', title: 'Yoga & Puppies — Session #1', loc: 'Tudor 7 · Mezzanine Floor',
      details: 'Meeting time: 7:55 AM · Host: Zuzu Wilson 416-356-2642 · Attire: yoga clothes / activewear', audience: r => r.morningConnection === 'yoga1' },
    { day: 2, sort: 510,  tag: 'Activity', time: '8:30 – 9:00 AM', title: 'Yoga & Puppies — Session #2', loc: 'Tudor 7 · Mezzanine Floor',
      details: 'Meeting time: 8:30 AM · Host: Zuzu Wilson 416-356-2642 · Attire: yoga clothes / activewear', audience: r => r.morningConnection === 'yoga2' },
    { day: 2, sort: 600,  tag: 'Session', time: '10:00 – 10:10 AM', title: 'Welcome to Day 2', who: 'David', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 610,  tag: 'Session', time: '10:10 – 11:05 AM', title: 'Keynote — AI Disruption in Action', who: 'Mike Murchison', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 665,  tag: 'Session', time: '11:05 AM – 12:00 PM', title: 'Modern Product Management — From Feature Factory to Future Forward', who: 'Arun & Xavi', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 720,  tag: 'Meal', time: '12:00 – 1:00 PM', title: 'Lunch', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 780,  tag: 'Session', time: '1:00 – 1:30 PM', title: 'Opex & AI Challenge — Real Outcomes', who: 'Claire & Ryan', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 810,  tag: 'Session', time: '1:30 – 2:45 PM', title: 'Golden Age of Vertical SaaS', who: 'Kaz', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 885,  tag: 'Session', time: '2:45 – 3:00 PM', title: 'Banyan Foundation Updates', who: 'David', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 930,  tag: 'Session', time: '3:30 – 4:15 PM', title: 'Reaching Buyers in the AI Era — Win the AI-Assisted Journey', who: 'Luke & Tristan', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 975,  tag: 'Session', time: '4:15 – 4:35 PM', title: 'Bringing It All Together — Reflections on the GLC', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 995,  tag: 'Session', time: '4:35 – 4:45 PM', title: 'Closing', who: 'David', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 1005, tag: 'Event', time: '4:45 – 5:00 PM', title: 'Group Photo', loc: 'Concert Hall · Convention Floor', audience: all },
    { day: 2, sort: 1110, tag: 'Dinner', time: '6:30 – 9:00 PM', title: "Dine-Around Dinner: Biff's Bistro", loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator · 2 Front St E, Toronto',
      details: 'Meeting time: 6:30 PM · Host: Zuzu Wilson 416-356-2642', audience: r => r.dineAround === 'biffs' },
    { day: 2, sort: 1110, tag: 'Dinner', time: '6:30 – 9:00 PM', title: 'Dine-Around Dinner: Jump Restaurant', loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator · 18 Wellington St W, Toronto',
      details: 'Meeting time: 6:30 PM · Host: Kiara 647-573-1369', audience: r => r.dineAround === 'jump' },
    { day: 2, sort: 1110, tag: 'Dinner', time: '6:30 – 9:00 PM', title: 'Dine-Around Dinner: The Joneses', loc: 'Meeting spot: Avenues Floor (lower level) — "A" on elevator · 33 Yonge St #100, Toronto',
      details: 'Meeting time: 6:30 PM · Host: Emily Campbell 905-325-2660', audience: r => r.dineAround === 'joneses' },
    { day: 2, sort: 1260, tag: 'Event', time: '9:00 PM', title: 'After Party', loc: "Kelly's Landing · 123 Front St W, Toronto", audience: all },

    /* ── Friday, July 17 (Friday OP Strategy Session field) ── */
    { day: 3, sort: 480,  tag: 'Meal', time: '8:00 – 9:00 AM', title: 'Breakfast', loc: 'Manitoba · Mezzanine Floor', audience: r => yes(r.fridayStrategy) },
    { day: 3, sort: 540,  tag: 'Session', time: '9:00 AM – 12:00 PM', title: 'Strategy Session: David & Tonya', loc: 'Manitoba · Mezzanine Floor', audience: r => yes(r.fridayStrategy) },
    { day: 3, sort: 720,  tag: 'Meal', time: '12:00 PM', title: 'Take-Away Lunch', loc: 'Manitoba · Mezzanine Floor', audience: r => yes(r.fridayStrategy) }
  ];

  /* ── HQ evening event (Tuesday) — the field's value names the
     event ("Medieval Times", "M&A/BD", …), so build it dynamically ── */
  function hqEveningEvent(reg) {
    const v = String(reg.trackHQEvening || '').trim();
    if (!yes(v)) return null;
    const generic = ['yes', 'y', 'x', 'true', '1'].includes(v.toLowerCase());
    return {
      day: 0, sort: 1080, tag: 'Event', time: '6:00 – 9:00 PM',
      title: generic ? 'HQ Evening Event' : `HQ Evening Event: ${v}`,
      loc: /mediev/i.test(v) ? 'Medieval Times · 10 Dufferin St, Toronto' : ''
    };
  }

  /* ── personal headshot (Wednesday) ───────────────── */
  function headshotEvent(reg) {
    const slot = reg.headshotSlot;
    if (!slot) return null;
    if (slot === 'queue') {
      return { day: 1, sort: 540, tag: 'Headshot', time: 'Waitlist (time to be assigned)', title: 'Professional Headshot', loc: '' };
    }
    const [h, m] = slot.split(':').map(Number);
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return { day: 1, sort: h * 60 + m, tag: 'Headshot', time: `${h12}:${String(m).padStart(2, '0')} ${ampm}`, title: 'Professional Headshot', loc: '' };
  }

  /* ── build + render ─────────────────────────────── */
  function buildAgenda(reg) {
    const events = AGENDA.filter(item => item.audience(reg));
    const hs = headshotEvent(reg);
    if (hs) events.push(hs);
    const hqEve = hqEveningEvent(reg);
    if (hqEve) events.push(hqEve);

    return DAYS.map((day, i) => ({
      day,
      events: events.filter(e => e.day === i).sort((a, b) => a.sort - b.sort)
    }));
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
          ${e.who ? `<div class="event-row__details">${esc(e.who)}</div>` : ''}
          ${e.loc ? `<div class="event-row__loc">📍 ${esc(e.loc)}</div>` : ''}
          ${e.details ? `<div class="event-row__details">${esc(e.details)}</div>` : ''}
          ${e.link ? `<div class="event-row__details"><a href="${esc(e.link.href)}" target="_blank" rel="noopener">${esc(e.link.label)} ↗</a></div>` : ''}
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
