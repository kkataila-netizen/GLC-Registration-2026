/* ============================================================
   GLC 2026 Participant Survey — ported from the design handoff
   (Multi-day agenda layout / GLC 2026 Participant Survey.dc.html).

   Star-rates every session across the three days plus social
   events and logistics; free-text wrap-up questions; draft
   autosaves to this device; submission is ANONYMOUS via
   POST /api/survey (no name/email stored with answers).
   ============================================================ */
(() => {
  'use strict';

  function getUserToken() { return localStorage.getItem('glc-user-token') || ''; }

  /* ── survey content (from the design file) ────────── */
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

  // v2: question list changed in the 2026-07-17 design sync — old positional
  // draft keys would land on the wrong sessions, so v1 drafts are discarded.
  const DRAFT_KEY = 'glc2026_survey_v2';
  try { localStorage.removeItem('glc2026_survey_v1'); } catch { /* ignore */ }

  /* ── state ─────────────────────────────────────────── */
  let state = {
    attendeeType: '',
    ratings: {}, na: {},
    overallRating: 0,
    mvs1: '', mvs2: '', mvs3: '',
    nextLocation: '',
    topicsWanted: '', onboarding: '', formatFeedback: '',
    surprise: '', changes: '', comments: ''
  };

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) state = { ...state, ...JSON.parse(raw) };
    } catch { /* ignore */ }
  }
  function persist() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  /* ── item helpers ──────────────────────────────────── */
  function dayItems() {
    const out = [];
    DAYS.forEach(d => d.items.forEach((it, i) => out.push({
      key: d.id + '_' + i, day: d.label, title: it[0],
      meta: (it[1].split('·')[1] || '').trim(), group: it[2] || ''
    })));
    return out;
  }
  function eventItems() {
    return EVENTS.map((e, i) => ({ key: 'ev_' + i, title: e[0], meta: e[1], morning: !!e[2] }));
  }
  function logisticItems() {
    return LOGISTICS.map((l, i) => ({ key: 'log_' + i, title: l }));
  }

  /* ── rendering ─────────────────────────────────────── */
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function starHtml(key, current, na) {
    let h = '<span class="sv-stars" data-stars="' + esc(key) + '">';
    for (let n = 1; n <= 5; n++) {
      const on = !na && n <= current;
      h += '<button type="button" class="sv-star' + (on ? ' sv-star--on' : '') + '" data-key="' + esc(key) + '" data-val="' + n + '" aria-label="' + n + ' star' + (n > 1 ? 's' : '') + '">&#9733;</button>';
    }
    return h + '</span>';
  }

  function rowHtml(item, withNA) {
    const rating = state.ratings[item.key] || 0;
    const na = !!state.na[item.key];
    return (item.group !== undefined && item.groupHeader ? '<div class="sv-group">' + esc(item.groupHeader) + '</div>' : '') +
      '<div class="sv-row">' +
      '<div class="sv-row__text"><div class="sv-row__title">' + esc(item.title) + '</div>' +
      (item.meta ? '<div class="sv-row__meta">' + esc(item.meta) + '</div>' : '') + '</div>' +
      '<div class="sv-row__actions">' + starHtml(item.key, rating, na) +
      (withNA ? '<button type="button" class="sv-na' + (na ? ' sv-na--on' : '') + '" data-na="' + esc(item.key) + '">N/A</button>' : '') +
      '</div></div>';
  }

  function render() {
    // Role dropdown
    const roleSel = document.getElementById('roleSelect');
    roleSel.innerHTML = '<option value="">Select your role&hellip;</option>' +
      ROLES.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
    roleSel.value = state.attendeeType || '';

    // Overall 1-10 scale
    document.getElementById('overallScale').innerHTML = (() => {
      let h = '';
      for (let n = 1; n <= 10; n++) {
        const on = n === state.overallRating;
        h += '<button type="button" class="sv-scale__btn' + (on ? ' sv-scale__btn--active' : '') + '" data-overall="' + n + '">' + n + '</button>';
      }
      return h;
    })();

    // Day blocks with group headers
    document.getElementById('dayBlocks').innerHTML = DAYS.map(d => {
      let prevG = null;
      const rows = d.items.map((it, i) => {
        const item = {
          key: d.id + '_' + i, title: it[0],
          // design renders only the presenter (text after the '·'), never the time
          meta: ((it[1] || '').split('·')[1] || '').trim(), group: it[2] || ''
        };
        item.groupHeader = (item.group && item.group !== prevG) ? item.group : null;
        prevG = item.group || prevG;
        return rowHtml(item, true);
      }).join('');
      return '<div class="sv-section" style="margin-top:1.5rem">' +
        '<div class="sv-day"><span class="sv-day__label">' + esc(d.label) + '</span>' +
        '<span class="sv-day__date">' + esc(d.date) + '</span>' +
        '<span class="sv-day__theme">' + esc(d.theme) + '</span></div>' + rows + '</div>';
    }).join('');

    // Events (main + morning) — design shows title + stars only (no day/time, no N/A)
    const evs = eventItems();
    document.getElementById('eventRows').innerHTML = evs.filter(e => !e.morning).map(e => rowHtml({ key: e.key, title: e.title }, false)).join('');
    document.getElementById('morningRows').innerHTML = evs.filter(e => e.morning).map(e => rowHtml({ key: e.key, title: e.title }, false)).join('');

    // Logistics (no N/A)
    document.getElementById('logisticsRows').innerHTML = logisticItems().map(l => rowHtml(l, false)).join('');

    // Top-3 selects
    const opts = dayItems().map(it =>
      '<option value="' + esc(it.key) + '">' + esc(it.day + ' · ' + it.title) + '</option>'
    ).join('');
    [['mvs1', '1st'], ['mvs2', '2nd'], ['mvs3', '3rd']].forEach(([id, rank]) => {
      const sel = document.getElementById(id);
      sel.innerHTML = '<option value="">' + rank + ' choice…</option>' + opts;
      sel.value = state[id] || '';
    });

    // Preferred location pills
    document.getElementById('locationPills').innerHTML = LOCATIONS.map(label =>
      '<button type="button" class="sv-pill' + (state.nextLocation === label ? ' sv-pill--active' : '') + '" data-location="' + esc(label) + '">' + esc(label) + '</button>'
    ).join('');

    // Free text
    document.getElementById('svSurprise').value = state.surprise || '';
    document.getElementById('svTopics').value = state.topicsWanted || '';
    document.getElementById('svOnboarding').value = state.onboarding || '';
    document.getElementById('svFormat').value = state.formatFeedback || '';
    document.getElementById('svChanges').value = state.changes || '';
    document.getElementById('svComments').value = state.comments || '';

    updateProgress();
  }

  function updateProgress() {
    let total = 0, done = 0;
    const tick = key => { total++; if (state.na[key] || state.ratings[key]) done++; };
    dayItems().forEach(it => tick(it.key));
    eventItems().forEach(e => tick(e.key));
    logisticItems().forEach(l => tick(l.key));
    const pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('progressLabel').textContent = done + ' of ' + total + ' items rated';
    document.getElementById('progressPct').textContent = pct + '%';
    document.getElementById('progressFill').style.width = pct + '%';
    return { total, done };
  }

  /* ── interactions (event delegation) ───────────────── */
  document.addEventListener('click', (e) => {
    const star = e.target.closest('.sv-star');
    if (star && star.dataset.key) {
      const key = star.dataset.key, val = parseInt(star.dataset.val, 10);
      delete state.na[key];
      state.ratings[key] = val;
      persist(); render();
      return;
    }
    const scale = e.target.closest('.sv-scale__btn');
    if (scale) {
      state.overallRating = parseInt(scale.dataset.overall, 10);
      persist(); render();
      return;
    }
    const na = e.target.closest('.sv-na');
    if (na) {
      const key = na.dataset.na;
      if (state.na[key]) delete state.na[key];
      else { state.na[key] = true; delete state.ratings[key]; }
      persist(); render();
      return;
    }
    const pill = e.target.closest('.sv-pill');
    if (pill && pill.dataset.location) {
      state.nextLocation = pill.dataset.location;
      persist(); render();
    }
  });

  document.getElementById('roleSelect').addEventListener('change', (e) => {
    state.attendeeType = e.target.value; persist();
  });

  ['mvs1', 'mvs2', 'mvs3'].forEach(id => {
    document.getElementById(id).addEventListener('change', (e) => {
      state[id] = e.target.value; persist();
    });
  });
  [['svSurprise', 'surprise'], ['svTopics', 'topicsWanted'], ['svOnboarding', 'onboarding'],
   ['svFormat', 'formatFeedback'], ['svChanges', 'changes'], ['svComments', 'comments']].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', (e) => {
      state[key] = e.target.value; persist();
    });
  });

  /* ── submit ───────────────────────────────────────── */
  function buildAnswers() {
    const answers = {};
    answers['Role'] = state.attendeeType || '';
    answers['How valuable was GLC (1-10)'] = state.overallRating ? String(state.overallRating) : '';
    dayItems().forEach(it => {
      answers[it.day + ' — ' + it.title] = state.na[it.key] ? 'N/A' : (state.ratings[it.key] ? String(state.ratings[it.key]) : '');
    });
    eventItems().forEach(ev => {
      answers['Event — ' + ev.title] = state.na[ev.key] ? 'N/A' : (state.ratings[ev.key] ? String(state.ratings[ev.key]) : '');
    });
    const all = dayItems();
    [['1st', state.mvs1], ['2nd', state.mvs2], ['3rd', state.mvs3]].forEach(([rank, key]) => {
      const it = all.find(x => x.key === key);
      answers[rank + ' most valuable session'] = it ? (it.day + ' — ' + it.title) : '';
    });
    logisticItems().forEach(l => {
      answers['Logistics — ' + l.title] = state.na[l.key] ? 'N/A' : (state.ratings[l.key] ? String(state.ratings[l.key]) : '');
    });
    answers['Preferred location next year'] = state.nextLocation || '';
    answers['Format feedback (tracks + days together)'] = state.formatFeedback || '';
    answers['Interest in longer new-CEO onboarding'] = state.onboarding || '';
    answers['Topics to cover next time'] = state.topicsWanted || '';
    answers['Surprise / light-bulb moment'] = state.surprise || '';
    answers['What to change'] = state.changes || '';
    answers['General comments'] = state.comments || '';
    return answers;
  }

  const msg = document.getElementById('surveyMessage');
  function showMsg(type, text) {
    msg.hidden = false;
    msg.className = 'message message--' + type;
    msg.textContent = text;
    msg.scrollIntoView({ block: 'nearest' });
  }

  document.getElementById('surveySubmitBtn').addEventListener('click', async () => {
    msg.hidden = true;
    const token = getUserToken();
    if (!token) { showMsg('error', 'Please log in before submitting the survey.'); return; }

    const answers = buildAnswers();
    const hasContent = state.overallRating || state.attendeeType || state.nextLocation ||
      Object.keys(state.ratings).length || state.topicsWanted || state.onboarding ||
      state.formatFeedback || state.surprise || state.changes || state.comments;
    if (!hasContent) { showMsg('error', 'Please answer at least one question.'); return; }

    const btn = document.getElementById('surveySubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ answers })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const prog = updateProgress();
        clearDraft(); // anonymity hygiene: nothing lingers on shared devices
        document.getElementById('surveyMain').hidden = true;
        const thanks = document.getElementById('surveyThanks');
        document.getElementById('thanksSummary').textContent =
          'You rated ' + prog.done + ' of ' + prog.total + " items. Your feedback goes straight to the team planning next year's GLC.";
        thanks.hidden = false;
        window.scrollTo(0, 0);
      } else if (res.status === 409) {
        showMsg('error', data.error || 'You have already submitted the survey.');
      } else if (res.status === 401) {
        showMsg('error', 'Your session has expired — please log in again and resubmit.');
      } else {
        showMsg('error', data.error || 'Could not save your response. Please try again.');
      }
    } catch {
      showMsg('error', 'Network error. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit survey';
    }
  });

  /* ── init ─────────────────────────────────────────── */
  loadDraft();
  render();
})();
