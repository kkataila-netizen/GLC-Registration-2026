/* ============================================================
   Survey Results — live tabulation of anonymous survey responses.
   Mirrors the survey layout; shows averages and counts per item,
   attendee-type totals, a weighted top-3 leaderboard, and all
   free-text comments. Polls for new responses every 30 seconds.
   ============================================================ */
(() => {
  'use strict';

  function getAdminToken() { return localStorage.getItem('glc-admin-token') || ''; }

  /* ── survey content (must match survey.js keys) ───── */
  const DAYS = [
    { id: 'd0', label: 'DAY 0', date: 'Tuesday, July 14', theme: 'Learning the Banyan Way', items: [
      ['Track 1: Driving OpCo Performance — The OL Playbook', '9:00 – 12:00 · David / Darren', 'OL Track'],
      ['Track 2: ELP Track Sessions', '9:00 – 12:00 · Ryan', 'ELP Track'],
      ['Track 3: Becoming an AI-Native HQ', '9:00 – 12:00 · Kaz & Kristian', 'AI-Native HQ Track'],
      ['Setting the Stage: Driving Performance with the BOS', '1:00 – 1:15 p.m. · David', 'New CEO Session'],
      ['Know Your Numbers: Four Metrics That Matter', '1:30 – 2:15 p.m. · Darren', 'New CEO Session'],
      ['Get Traction: The EOS Method to Focus & Scale', '2:30 – 3:45 p.m. · Tristan', 'New CEO Session'],
      ['Grow the Top Line: Four Levers to Grow Revenue', '4:00 – 5:15 p.m. · Reed & Luke', 'New CEO Session'],
      ['M&A / BD', '', 'HQ Functional Breakouts'],
      ['Legal', '', 'HQ Functional Breakouts'],
      ['Finance', '', 'HQ Functional Breakouts'],
      ['Ops (HR / TA / IT)', '', 'HQ Functional Breakouts']
    ]},
    { id: 'd1', label: 'DAY 1', date: 'Wednesday, July 15', theme: 'Accelerating through Talent, Product & Velocity', items: [
      ['Build the Next Version: Our Re-Founding Moment', '9:00 – 10:00 a.m. · David', ''],
      ['Pivotal Decisions: CEO Decisions That Changed the Trajectory', '10:15 – 11:00 a.m. · Bricey', ''],
      ['Bold Moves: Resetting Your Dev Org for Innovation', '11:00 – 11:30 a.m. · Kay', ''],
      ['One Seat Away: Raise the Talent Bar. Unlock Your Business', '11:30 – 12:00 p.m. · Tonya', ''],
      ['Price Like You Mean It: Strategies That Accelerate Growth', '1:00 – 2:00 p.m. · Claire', ''],
      ['From the Board Room: How Boards Think About Growth', '2:00 – 2:45 p.m. · David', ''],
      ['Birds of a Feather: Peer Problem Solving', '3:15 – 4:00 p.m.', ''],
      ['Operating Group Breakout Sessions', '4:30 – 5:30 p.m.', '']
    ]},
    { id: 'd2', label: 'DAY 2', date: 'Thursday, July 16', theme: 'Leveraging AI to Accelerate Product & Velocity', items: [
      ['Keynote: AI Disruption in Action', '10:10 – 11:05 a.m. · Mike Murchison', ''],
      ['Modern Product Management: From Feature Factory to Future Forward', '11:05 – 12:00 p.m. · Arun & Xavi', ''],
      ['Opex & AI Challenge: Real Outcomes', '1:15 – 1:45 p.m. · Claire & Ryan', ''],
      ['Golden Age of Vertical SaaS', '1:45 – 3:00 p.m. · Kaz', ''],
      ['Banyan Foundation Updates', '3:00 – 3:15 p.m. · David', ''],
      ['Reaching Buyers in the AI Era: Win the AI-Assisted Journey', '3:45 – 4:30 p.m. · Luke', ''],
      ['Bringing It All Together: Reflections on the GLC', '4:30 – 4:50 p.m.', '']
    ]}
  ];
  const EVENTS = [
    ['Huddle Event (HQ)', 'Day 0 · 7:30 – 9:00 a.m.', false],
    ['Welcome Reception & Dinner', 'Day 0 · 6:00 – 9:00 p.m.', false],
    ['Awards Dinner', 'Day 1 · 6:15 p.m.', false],
    ['Puppy Yoga', 'Day 2 · Morning', true],
    ['Canoeing', 'Day 2 · Morning', true],
    ['Paddle Boarding', 'Day 2 · Morning', true],
    ['Bus Tour', 'Day 2 · Morning', true],
    ['Walking Tour', 'Day 2 · Morning', true],
    ['Dine-Around Dinners', 'Day 2 · 6:30 p.m.', false],
    ['After Party', 'Day 2 · Late', false]
  ];
  const LOGISTICS = ['Event Communications', 'GLC Application', 'Hotel', 'Registration & Check-in'];

  const LOCATIONS = ['North America (Toronto)', 'North America (Florida)', 'Western Europe', 'Caribbean / Mexico'];

  const ROLES = [
    'New CEO (joined Banyan in the last 12 months)',
    'Tenured Banyan CEO', 'OL', 'ELP', 'Finance', 'M&A', 'BD', 'HR / Legal / Other'
  ];

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  /* ── aggregation ───────────────────────────────────── */
  function stat(responses, field) {
    let sum = 0, n = 0, na = 0;
    for (const r of responses) {
      const v = (r.answers || {})[field];
      if (v === 'N/A') { na++; continue; }
      const num = parseInt(v, 10);
      if (num >= 1 && num <= 5) { sum += num; n++; }
    }
    return { avg: n ? sum / n : 0, n, na };
  }

  function starsHtml(avg) {
    const rounded = Math.round(avg);
    let h = '<span class="sv-stars">';
    for (let i = 1; i <= 5; i++) {
      h += '<span class="' + (i <= rounded && avg > 0 ? 'sv-star-on' : 'sv-star-off') + '">&#9733;</span>';
    }
    return h + '</span>';
  }

  function scoreHtml(st) {
    return '<div class="sv-row__score">' + starsHtml(st.avg) +
      '<span class="sv-avg">' + (st.n ? st.avg.toFixed(1) : '–') + '</span>' +
      '<span class="sv-n">' + st.n + ' rating' + (st.n === 1 ? '' : 's') + (st.na ? ' · ' + st.na + ' N/A' : '') + '</span></div>';
  }

  function rowHtml(title, meta, st, groupHeader) {
    return (groupHeader ? '<div class="sv-group">' + esc(groupHeader) + '</div>' : '') +
      '<div class="sv-row"><div class="sv-row__text">' +
      '<div class="sv-row__title">' + esc(title) + '</div>' +
      (meta ? '<div class="sv-row__meta">' + esc(meta) + '</div>' : '') +
      '</div>' + scoreHtml(st) + '</div>';
  }

  function render(responses) {
    // Response count
    document.getElementById('responseCount').innerHTML =
      '<strong>' + responses.length + '</strong> anonymous response' + (responses.length === 1 ? '' : 's') + ' received';

    // Role counts
    const roleCounts = {};
    ROLES.forEach(r => { roleCounts[r] = 0; });
    responses.forEach(r => {
      const t = (r.answers || {})['Role'];
      if (roleCounts[t] !== undefined) roleCounts[t]++;
    });
    document.getElementById('attendeeStats').innerHTML = Object.entries(roleCounts).map(([label, count]) =>
      '<span class="sv-pill-stat">' + esc(label) + ': <strong>' + count + '</strong></span>'
    ).join('');

    // Overall rating (1-10 scale)
    let oSum = 0, oN = 0;
    responses.forEach(r => {
      const num = parseInt((r.answers || {})['How valuable was GLC (1-10)'], 10);
      if (num >= 1 && num <= 10) { oSum += num; oN++; }
    });
    const oAvg = oN ? oSum / oN : 0;
    const oPct = Math.round(oAvg * 10);
    document.getElementById('overallStat').innerHTML =
      '<div style="display:flex;align-items:center;gap:0.75rem;padding:0.35rem 0;max-width:520px">' +
      '<div style="flex:1;height:10px;background:#e9e9e2;border-radius:99px;overflow:hidden">' +
      '<div style="height:100%;width:' + oPct + '%;background:#395542;border-radius:99px"></div></div>' +
      '<span class="sv-avg" style="min-width:4.2rem">' + (oN ? oAvg.toFixed(1) + ' / 10' : '&ndash;') + '</span>' +
      '<span class="sv-n">' + oN + ' rating' + (oN === 1 ? '' : 's') + '</span></div>';

    // Top 3 leaderboard (weighted 3/2/1)
    const points = {}, votes = {};
    responses.forEach(r => {
      const a = r.answers || {};
      [['1st most valuable session', 3], ['2nd most valuable session', 2], ['3rd most valuable session', 1]].forEach(([field, w]) => {
        const v = (a[field] || '').trim();
        if (!v) return;
        points[v] = (points[v] || 0) + w;
        votes[v] = (votes[v] || 0) + 1;
      });
    });
    const ranked = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    document.getElementById('top3').innerHTML = ranked.length
      ? ranked.map(([title, pts], i) =>
          '<div class="sv-top3__item"><span class="sv-top3__rank">' + medals[i] + '</span>' +
          '<span class="sv-top3__title">' + esc(title) + '</span>' +
          '<span class="sv-top3__votes">' + votes[title] + ' vote' + (votes[title] === 1 ? '' : 's') + ' · ' + pts + ' pts</span></div>'
        ).join('')
      : '<div class="sv-empty">No picks yet.</div>';

    // Day blocks
    document.getElementById('dayBlocks').innerHTML = DAYS.map(d => {
      let prevG = null;
      const rows = d.items.map(it => {
        const groupHeader = (it[2] && it[2] !== prevG) ? it[2] : null;
        prevG = it[2] || prevG;
        // design renders only the presenter (text after the '·'), never the time
        const presenter = ((it[1] || '').split('·')[1] || '').trim();
        return rowHtml(it[0], presenter, stat(responses, d.label + ' — ' + it[0]), groupHeader);
      }).join('');
      return '<div class="sv-section" style="margin-top:1.5rem">' +
        '<div class="sv-day"><span class="sv-day__label">' + esc(d.label) + '</span>' +
        '<span class="sv-day__date">' + esc(d.date) + '</span>' +
        '<span class="sv-day__theme">' + esc(d.theme) + '</span></div>' + rows + '</div>';
    }).join('');

    // Events
    const evHtml = flag => EVENTS
      .filter(e => !!e[2] === flag)
      .map(e => rowHtml(e[0], '', stat(responses, 'Event — ' + e[0]), null))
      .join('');
    document.getElementById('eventRows').innerHTML = evHtml(false);
    document.getElementById('morningRows').innerHTML = evHtml(true);

    // Logistics
    document.getElementById('logisticsRows').innerHTML =
      LOGISTICS.map(l => rowHtml(l, '', stat(responses, 'Logistics — ' + l), null)).join('');

    // Preferred region counts
    const locCounts = {};
    LOCATIONS.forEach(l => { locCounts[l] = 0; });
    responses.forEach(r => {
      const v = (r.answers || {})['Preferred location next year'];
      if (locCounts[v] !== undefined) locCounts[v]++;
    });
    document.getElementById('locationStats').innerHTML = Object.entries(locCounts).map(([label, count]) =>
      '<span class="sv-pill-stat">' + esc(label) + ': <strong>' + count + '</strong></span>'
    ).join('');

    // Free-text answers are intentionally not rendered here — they are
    // available only via the Survey Export (CSV/JSON) on the Admin page.
  }

  /* ── load + poll ───────────────────────────────────── */
  async function load() {
    try {
      const res = await fetch('/api/survey/export?format=json&_=' + Date.now(), {
        headers: { 'Authorization': 'Bearer ' + getAdminToken() },
        cache: 'no-store'
      });
      if (res.status === 401) { location.replace('/admin.html'); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      render(data.responses || []);
    } catch {
      document.getElementById('responseCount').textContent = 'Could not load responses — retrying shortly…';
    }
  }

  load();
  setInterval(load, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
