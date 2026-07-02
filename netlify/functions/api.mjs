import { getStore } from "@netlify/blobs";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const VALID_DIETARY = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher', 'Other'];
const VALID_TSHIRT = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// 5-minute headshot slots from 9:00 AM to 3:55 PM (session ends 4:00 PM) on Wednesday July 15, 2026
function buildHeadshotSlots() {
  const out = [];
  for (let h = 9; h < 16; h++) {
    for (let m = 0; m < 60; m += 5) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}
const VALID_HEADSHOT_SLOTS = buildHeadshotSlots();

// Internal / HR fields — managed by admin + CSV import only, never shown on
// the public registration form. Stored as free-text strings.
const INTERNAL_FIELDS = [
  'employeeNumber', 'peopleLeader', 'eltMember', 'location', 'operatingGroup',
  'department', 'reportingTo', 'glcInvite', 'hotelEligible', 'hotelBooked',
  'trackAINative', 'trackELP', 'trackOperatingLeader', 'trackHQFunctional', 'trackNewCEO'
];
// Maps each internal field to its CSV column header (used for export order)
const INTERNAL_FIELD_HEADERS = [
  ['employeeNumber', 'Employee #'],
  ['peopleLeader', 'People Leader'],
  ['eltMember', 'ELT Member'],
  ['location', 'Location'],
  ['operatingGroup', 'Operating Group'],
  ['department', 'Department'],
  ['reportingTo', 'Reporting to'],
  ['glcInvite', 'GLC Invite'],
  ['hotelEligible', 'Hotel Eligible'],
  ['hotelBooked', 'Hotel Booked?'],
  ['trackAINative', 'AI Native Track (Tues Morning)'],
  ['trackELP', 'ELP Track (Tues am)'],
  ['trackOperatingLeader', 'Operating Leader Track (Tue am)'],
  ['trackHQFunctional', 'HQ Functional Sessions (Tues Afternoon)'],
  ['trackNewCEO', 'New CEO Session']
];
// Special non-exclusive value — multiple users can hold "queue" simultaneously,
// it's a waitlist for additional slots being added.
const HEADSHOT_QUEUE = 'queue';
function isValidHeadshotSlot(slot) {
  return slot === '' || slot === HEADSHOT_QUEUE || VALID_HEADSHOT_SLOTS.includes(slot);
}
const ADMIN_EMAILS = ["kkataila@banyansoftware.com", "gretchen@theexperienceagency.ca", "nkotyk@banyansoftware.com", "tcross@banyansoftware.com", "dreimer@banyansoftware.com"];
const isAdminEmail = (e) => ADMIN_EMAILS.includes((e || "").toLowerCase());
const ADMIN_PASSWORD = "GLC2026";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Stateless HMAC admin tokens (no Blobs needed) ── */
async function getHmacKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ADMIN_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function generateAdminToken() {
  const timestamp = Date.now().toString();
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}.${sigHex}`;
}

async function validateAdminToken(req) {
  const auth = req.headers.get("authorization") || "";
  const raw = auth.replace(/^Bearer\s+/i, "").trim();
  if (!raw) return false;
  const dot = raw.indexOf('.');
  if (dot === -1) return false;
  const timestamp = raw.slice(0, dot);
  const sigHex = raw.slice(dot + 1);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Date.now() - ts > TOKEN_EXPIRY_MS) return false;
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return sigHex === expected;
}

/* ── User auth helper (for profile access) ────────── */
async function validateUserToken(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  // User tokens are stored alongside registrations — token = "user:<email>:<hash>"
  if (!token.startsWith("user:")) return null;
  const parts = token.split(":");
  if (parts.length < 3) return null;
  const email = parts[1];
  const hash = parts.slice(2).join(":");
  const registrations = await getRegistrations();
  const user = registrations.find(r => r.email === email);
  if (!user || user.passwordHash !== hash) return null;
  return { email: user.email, name: user.name };
}

function validateRegistration(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push('Name is required and must be at least 2 characters.');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!body.email || typeof body.email !== 'string' || !emailRegex.test(body.email.trim())) {
    errors.push('A valid email address is required.');
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 4) {
    errors.push('Password is required (at least 4 characters).');
  }
  if (body.phone && !/^[0-9\s\-\(\)\+]{7,20}$/.test(body.phone.trim())) {
    errors.push('Phone number format is invalid.');
  }
  if (body.dietary && !VALID_DIETARY.includes(body.dietary)) {
    errors.push('Invalid dietary preference.');
  }
  if (body.tshirt && !VALID_TSHIRT.includes(body.tshirt)) {
    errors.push('Invalid t-shirt size.');
  }
  if (body.sessions && !Array.isArray(body.sessions)) {
    errors.push('Sessions must be an array.');
  }
  return { valid: errors.length === 0, errors };
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/* ── Profile photo helpers ────────────────────────── */
async function getProfilePhoto(email) {
  const store = getStore("profile-photos");
  try { return (await store.get(email, { type: "text" })) || null; }
  catch { return null; }
}
async function saveProfilePhoto(email, dataUrl) {
  const store = getStore("profile-photos");
  await store.set(email, dataUrl);
}
async function deleteProfilePhoto(email) {
  const store = getStore("profile-photos");
  try { await store.delete(email); } catch {}
}

async function getRegistrations() {
  const store = getStore("registrations");
  try {
    // Strong consistency: ensures we never return stale data after a recent write.
    // Eventually-consistent reads can return old values for several seconds after
    // a PUT, which caused admin edits to look like they hadn't saved.
    const data = await store.get("all", { type: "json", consistency: "strong" });
    return data || [];
  } catch {
    return [];
  }
}

async function saveRegistrations(registrations) {
  const store = getStore("registrations");
  await store.setJSON("all", registrations);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export default async (req, context) => {
  const url = new URL(req.url);
  // Strip the /api prefix to get the route path
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method;

  /* ── POST /api/admin-login ──────────────────────── */
  if (method === "POST" && (path === "/admin-login" || path === "/admin-login/")) {
    let body;
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON body." }, 400); }

    if (body.password !== ADMIN_PASSWORD) {
      return json({ error: "Incorrect password." }, 401);
    }

    const token = await generateAdminToken();
    return json({ success: true, token });
  }

  // POST /api/registrations (public — anyone can register)
  if (method === "POST" && (path === "/registrations" || path === "/registrations/")) {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, errors: ["Invalid JSON body."] }, 400);
    }

    const { valid, errors } = validateRegistration(body);
    if (!valid) {
      return json({ success: false, errors }, 400);
    }

    const registrations = await getRegistrations();
    const email = body.email.trim().toLowerCase();

    if (registrations.some(r => r.email.toLowerCase() === email)) {
      return json({ success: false, errors: ["This email is already registered."] }, 409);
    }

    // Validate headshot slot if provided
    const headshotSlot = body.headshotSlot || '';
    if (!isValidHeadshotSlot(headshotSlot)) {
      return json({ success: false, errors: ["Invalid headshot time slot."] }, 400);
    }
    if (headshotSlot && headshotSlot !== HEADSHOT_QUEUE && registrations.some(r => r.headshotSlot === headshotSlot)) {
      return json({ success: false, errors: ["That headshot time slot is already taken. Please pick another."] }, 409);
    }

    const registration = {
      id: crypto.randomUUID(),
      name: body.name.trim(),
      title: body.title ? body.title.trim() : '',
      email,
      passwordHash: await hashPassword(body.password),
      arrivalDate: body.arrivalDate || '',
      departureDate: body.departureDate || '',
      phone: body.phone ? body.phone.trim() : '',
      organization: body.organization ? body.organization.trim() : '',
      dietary: body.dietary || 'None',
      dietaryOther: body.dietaryOther ? body.dietaryOther.trim() : '',
      sessions: Array.isArray(body.sessions) ? body.sessions : [],
      welcomeReception: !!body.welcomeReception,
      tshirtFit: body.tshirtFit || '',
      tshirt: body.tshirt || '',
      headshotSlot,
      registeredAt: new Date().toISOString()
    };
    // Internal/HR fields default empty (not collected on the registration form)
    for (const f of INTERNAL_FIELDS) registration[f] = '';

    registrations.push(registration);
    await saveRegistrations(registrations);

    // Add new registrant to broadcast group if it already exists
    try {
      const convStore = getStore("chat-conversations");
      const convs = (await convStore.get("all", { type: "json" })) || [];
      const broadcastConv = convs.find(c => c.id === "group:broadcast-communications");
      if (broadcastConv && !broadcastConv.members.includes(email)) {
        broadcastConv.members.push(email);
        await convStore.setJSON("all", convs);
      }
    } catch {}

    // Return a user token so the client can make authenticated requests
    const userToken = `user:${email}:${registration.passwordHash}`;
    return json({ success: true, registration, userToken }, 201);
  }

  // GET /api/people  ★ USER AUTH REQUIRED — returns limited public fields only
  if (method === "GET" && (path === "/people" || path === "/people/")) {
    const isAdmin = await validateAdminToken(req);
    const userAuth = !isAdmin ? await validateUserToken(req) : null;
    if (!isAdmin && !userAuth) {
      return json({ error: "Unauthorized" }, 401);
    }

    let registrations = await getRegistrations();
    const search = url.searchParams.get("search");
    if (search) {
      const term = search.toLowerCase();
      registrations = registrations.filter(r =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        (r.organization || "").toLowerCase().includes(term)
      );
    }

    // Only expose public-safe fields
    const safe = registrations.map(r => ({
      name: r.name,
      title: r.title || '',
      organization: r.organization || '',
      email: r.email
    }));
    return json({ registrations: safe, total: safe.length });
  }

  // GET /api/registrations/export  ★ ADMIN ONLY
  if (method === "GET" && (path === "/registrations/export" || path === "/registrations/export/")) {
    if (!(await validateAdminToken(req))) {
      return json({ error: "Unauthorized" }, 401);
    }
    const registrations = await getRegistrations();
    const MC_LABELS = {
      bustour: "Hop-On City Sightseeing Bus Tour",
      morningyoga: "Morning Yoga",
      yoga1: "Yoga & Puppies — Session #1",
      yoga2: "Yoga & Puppies — Session #2",
      walking: "Downtown Toronto Walking Tour",
      canoeing: "Canoeing Toronto",
      taichi: "Tai Chi in the Park",
      paddleboard: "Stand-Up Paddleboarding"
    };
    function formatHeadshotSlot(slot) {
      if (!slot) return '';
      if (slot === HEADSHOT_QUEUE) return 'Queue (waitlist)';
      const [h, m] = slot.split(':').map(Number);
      const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    // Employee # leads (column A); People Leader follows Organization;
    // remaining internal fields are appended at the end
    const inlineKeys = ['employeeNumber', 'peopleLeader'];
    const otherInternal = INTERNAL_FIELD_HEADERS.filter(([key]) => !inlineKeys.includes(key));
    const headers = ['Employee #', 'Name', 'Title', 'Organization', 'People Leader', 'Email', 'Arrival Date', 'Departure Date', 'Phone', 'Dietary', 'Dietary Other', 'Sessions', 'Welcome Reception', 'Dine Around', 'Morning Connection', 'Headshot Slot', 'T-Shirt Fit', 'T-Shirt Size', 'Registered',
      ...otherInternal.map(([, header]) => header)];
    const rows = registrations.map(r => [
      escapeCSV(r.employeeNumber),
      escapeCSV(r.name),
      escapeCSV(r.title),
      escapeCSV(r.organization),
      escapeCSV(r.peopleLeader),
      escapeCSV(r.email),
      escapeCSV(r.arrivalDate),
      escapeCSV(r.departureDate),
      escapeCSV(r.phone),
      escapeCSV(r.dietary),
      escapeCSV(r.dietaryOther),
      escapeCSV(Array.isArray(r.sessions) ? r.sessions.join('; ') : ''),
      escapeCSV(r.welcomeReception ? 'Yes' : 'No'),
      escapeCSV(r.dineAround === 'biffs' ? "Biff's Bistro" : r.dineAround === 'jump' ? 'Jump Restaurant' : r.dineAround === 'joneses' ? 'The Joneses' : ''),
      escapeCSV(MC_LABELS[r.morningConnection] || ''),
      escapeCSV(formatHeadshotSlot(r.headshotSlot || '')),
      escapeCSV(r.tshirtFit),
      escapeCSV(r.tshirt),
      escapeCSV(r.registeredAt),
      ...otherInternal.map(([key]) => escapeCSV(r[key]))
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="registrations.csv"'
      }
    });
  }

  // GET /api/dine-around — public availability counts, no PII
  if (method === "GET" && (path === "/dine-around" || path === "/dine-around/")) {
    const registrations = await getRegistrations();
    const counts = { biffs: 0, jump: 0, joneses: 0 };
    for (const r of registrations) {
      if (r.dineAround && counts[r.dineAround] !== undefined) counts[r.dineAround]++;
    }
    return json({
      availability: {
        biffs:   { taken: counts.biffs,   capacity: 72  },
        jump:    { taken: counts.jump,    capacity: 100 },
        joneses: { taken: counts.joneses, capacity: 70  }
      }
    });
  }

  // GET /api/headshots — list of taken slots + queue size (no PII)
  if (method === "GET" && (path === "/headshots" || path === "/headshots/")) {
    const registrations = await getRegistrations();
    const taken = registrations
      .filter(r => r.headshotSlot && r.headshotSlot !== HEADSHOT_QUEUE)
      .map(r => r.headshotSlot);
    const queueCount = registrations.filter(r => r.headshotSlot === HEADSHOT_QUEUE).length;
    return json({ slots: VALID_HEADSHOT_SLOTS, taken, queueCount });
  }

  // POST /api/headshots/assign-queue  ★ ADMIN ONLY
  // Assigns every queued attendee the earliest free time slot (first-come,
  // first-served by registration time). Idempotent: no-op once queue is empty.
  if (method === "POST" && (path === "/headshots/assign-queue" || path === "/headshots/assign-queue/")) {
    if (!(await validateAdminToken(req))) return json({ error: "Unauthorized" }, 401);

    const registrations = await getRegistrations();
    const allSlots = buildHeadshotSlots();
    const taken = new Set(
      registrations
        .filter(r => r.headshotSlot && r.headshotSlot !== HEADSHOT_QUEUE)
        .map(r => r.headshotSlot)
    );
    const freeSlots = allSlots.filter(s => !taken.has(s));

    const queued = registrations
      .filter(r => r.headshotSlot === HEADSHOT_QUEUE)
      .sort((a, b) => new Date(a.registeredAt || 0) - new Date(b.registeredAt || 0));

    const assignments = [];
    let i = 0;
    for (const r of queued) {
      if (i >= freeSlots.length) break;
      r.headshotSlot = freeSlots[i++];
      assignments.push({ email: r.email, name: r.name, slot: r.headshotSlot });
    }

    await saveRegistrations(registrations);
    return json({
      success: true,
      queued: queued.length,
      assigned: assignments.length,
      unassigned: queued.length - assignments.length,
      assignments
    });
  }

  // GET /api/morning-connections — public availability counts, no PII
  if (method === "GET" && (path === "/morning-connections" || path === "/morning-connections/")) {
    const registrations = await getRegistrations();
    const counts = { bustour: 0, yoga1: 0, yoga2: 0, walking: 0, canoeing: 0, paddleboard: 0 };
    for (const r of registrations) {
      if (r.morningConnection && counts[r.morningConnection] !== undefined) counts[r.morningConnection]++;
    }
    return json({
      availability: {
        bustour:     { taken: counts.bustour,     capacity: 80 },
        yoga1:       { taken: counts.yoga1,       capacity: 22 },
        yoga2:       { taken: counts.yoga2,       capacity: 22 },
        walking:     { taken: counts.walking,     capacity: 35 },
        canoeing:    { taken: counts.canoeing,    capacity: 45 },
        paddleboard: { taken: counts.paddleboard, capacity: 41 }
      }
    });
  }

  // POST /api/morning-connections/clear  ★ ADMIN ONLY
  // Clears morningConnection for everyone holding one of the given activity ids
  // (used when an activity is removed from the offering). Body: { ids: [...] }
  if (method === "POST" && (path === "/morning-connections/clear" || path === "/morning-connections/clear/")) {
    if (!(await validateAdminToken(req))) return json({ error: "Unauthorized" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
    const ids = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) return json({ error: "ids array required." }, 400);

    const registrations = await getRegistrations();
    const cleared = [];
    for (const r of registrations) {
      if (r.morningConnection && ids.includes(r.morningConnection)) {
        cleared.push({ email: r.email, name: r.name, was: r.morningConnection });
        r.morningConnection = '';
      }
    }
    await saveRegistrations(registrations);
    return json({ success: true, cleared: cleared.length, details: cleared });
  }

  // GET /api/registrations/count (public — just a count, no PII)
  if (method === "GET" && (path === "/registrations/count" || path === "/registrations/count/")) {
    const registrations = await getRegistrations();
    return json({ count: registrations.length });
  }

  // GET /api/registrations  ★ AUTH REQUIRED
  // Admin token → full list; User token → only own record; No auth with ?search → only own record if matching
  if (method === "GET" && (path === "/registrations" || path === "/registrations/")) {
    const isAdmin = await validateAdminToken(req);
    const userAuth = !isAdmin ? await validateUserToken(req) : null;
    const search = url.searchParams.get("search");

    let registrations = await getRegistrations();

    if (isAdmin) {
      // Admin gets full access
      if (search) {
        const term = search.toLowerCase();
        registrations = registrations.filter(r =>
          r.name.toLowerCase().includes(term) ||
          r.email.toLowerCase().includes(term)
        );
      }
    } else if (userAuth) {
      // Logged-in user can only see their own record
      registrations = registrations.filter(r => r.email === userAuth.email);
    } else {
      return json({ error: "Unauthorized" }, 401);
    }

    // Strip passwordHash from response
    const safe = registrations.map(({ passwordHash, ...rest }) => rest);
    return json({ registrations: safe, total: safe.length });
  }

  // DELETE /api/registrations/:id  ★ ADMIN ONLY
  const deleteMatch = path.match(/^\/registrations\/([^/]+)\/?$/);
  if (method === "DELETE" && deleteMatch) {
    if (!(await validateAdminToken(req))) {
      return json({ error: "Unauthorized" }, 401);
    }
    const id = deleteMatch[1];
    const registrations = await getRegistrations();
    const index = registrations.findIndex(r => r.id === id);

    if (index === -1) {
      return json({ error: "Registration not found." }, 404);
    }

    registrations.splice(index, 1);
    await saveRegistrations(registrations);
    return json({ success: true });
  }

  // PUT /api/registrations/:id  ★ ADMIN or OWN RECORD
  const putMatch = path.match(/^\/registrations\/([^/]+)\/?$/);
  if (method === "PUT" && putMatch) {
    const id = putMatch[1];
    const isAdmin = await validateAdminToken(req);
    const userAuth = !isAdmin ? await validateUserToken(req) : null;

    if (!isAdmin && !userAuth) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body;
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON body." }, 400); }

    const registrations = await getRegistrations();
    const index = registrations.findIndex(r => r.id === id);

    if (index === -1) {
      return json({ error: "Registration not found." }, 404);
    }

    const reg = registrations[index];

    // Non-admin users can only edit their own record
    if (!isAdmin && reg.email !== userAuth.email) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length < 2) {
        return json({ error: "Name must be at least 2 characters." }, 400);
      }
      reg.name = body.name.trim();
    }
    if (body.email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const newEmail = body.email.trim().toLowerCase();
      if (!emailRegex.test(newEmail)) {
        return json({ error: "Invalid email address." }, 400);
      }
      if (newEmail !== reg.email.toLowerCase() && registrations.some(r => r.email.toLowerCase() === newEmail)) {
        return json({ error: "This email is already registered." }, 409);
      }
      reg.email = newEmail;
    }
    if (body.phone !== undefined) {
      if (body.phone && !/^[0-9\s\-\(\)\+]{7,20}$/.test(body.phone.trim())) {
        return json({ error: "Phone number format is invalid." }, 400);
      }
      reg.phone = body.phone ? body.phone.trim() : '';
    }
    if (body.title !== undefined) reg.title = (body.title || '').trim();
    if (body.organization !== undefined) reg.organization = (body.organization || '').trim();
    if (body.dietary !== undefined) {
      if (body.dietary && !VALID_DIETARY.includes(body.dietary)) {
        return json({ error: "Invalid dietary preference." }, 400);
      }
      reg.dietary = body.dietary || 'None';
    }
    if (body.dietaryOther !== undefined) reg.dietaryOther = (body.dietaryOther || '').trim();
    if (body.tshirtFit !== undefined) reg.tshirtFit = body.tshirtFit || '';
    if (body.tshirt !== undefined) {
      if (body.tshirt && !VALID_TSHIRT.includes(body.tshirt)) {
        return json({ error: "Invalid t-shirt size." }, 400);
      }
      reg.tshirt = body.tshirt || '';
    }
    if (body.sessions !== undefined) {
      if (!Array.isArray(body.sessions)) {
        return json({ error: "Sessions must be an array." }, 400);
      }
      reg.sessions = body.sessions;
    }
    if (body.welcomeReception !== undefined) reg.welcomeReception = !!body.welcomeReception;
    if (body.dineAround !== undefined) {
      const VALID_DINE = ['biffs', 'jump', 'joneses', ''];
      if (!VALID_DINE.includes(body.dineAround)) {
        return json({ error: "Invalid restaurant selection." }, 400);
      }
      reg.dineAround = body.dineAround || '';
    }
    if (body.morningConnection !== undefined) {
      const VALID_MC = ['bustour', 'yoga1', 'yoga2', 'walking', 'canoeing', 'paddleboard', ''];
      if (!VALID_MC.includes(body.morningConnection)) {
        return json({ error: "Invalid Morning Connections selection." }, 400);
      }
      // Selection is closed for all morning activities except the bus tour.
      // Non-admins may only newly choose 'bustour' or clear (''); admins can
      // still set any value. Existing bookings are left untouched.
      const MC_OPEN_FOR_SELF = ['bustour', ''];
      if (!isAdmin && !MC_OPEN_FOR_SELF.includes(body.morningConnection)) {
        return json({ error: "Selection for this activity is now closed." }, 403);
      }
      reg.morningConnection = body.morningConnection || '';
    }
    if (body.headshotSlot !== undefined) {
      const newSlot = body.headshotSlot || '';
      if (!isValidHeadshotSlot(newSlot)) {
        return json({ error: "Invalid headshot time slot." }, 400);
      }
      // Conflict check: only for real time slots, not the queue (multiple can queue)
      if (newSlot && newSlot !== HEADSHOT_QUEUE && newSlot !== reg.headshotSlot) {
        const taken = registrations.some(r => r.id !== reg.id && r.headshotSlot === newSlot);
        if (taken) {
          return json({ error: "That headshot time slot is already taken. Please pick another." }, 409);
        }
      }
      reg.headshotSlot = newSlot;
    }
    if (body.arrivalDate !== undefined) reg.arrivalDate = body.arrivalDate || '';
    if (body.departureDate !== undefined) reg.departureDate = body.departureDate || '';
    if (body.checkedIn !== undefined) {
      reg.checkedIn = !!body.checkedIn;
      if (reg.checkedIn && !reg.checkedInAt) reg.checkedInAt = new Date().toISOString();
      if (!reg.checkedIn) reg.checkedInAt = '';
    }
    // Internal / HR fields (admin + CSV import only)
    for (const f of INTERNAL_FIELDS) {
      if (body[f] !== undefined) reg[f] = (body[f] == null ? '' : String(body[f])).trim();
    }
    if (body.password) {
      if (body.password.length < 4) {
        return json({ error: "Password must be at least 4 characters." }, 400);
      }
      reg.passwordHash = await hashPassword(body.password);
    }

    registrations[index] = reg;
    await saveRegistrations(registrations);

    const { passwordHash, ...safe } = reg;
    // Return updated user token if password changed
    const userToken = `user:${reg.email}:${reg.passwordHash}`;
    return json({ success: true, registration: safe, userToken });
  }

  // POST /api/login (public — returns user token)
  if (method === "POST" && (path === "/login" || path === "/login/")) {
    let body;
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON body." }, 400); }

    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return json({ error: "Email and password are required." }, 400);
    }

    const registrations = await getRegistrations();
    const user = registrations.find(r => r.email.toLowerCase() === email);

    if (!user) {
      return json({ error: "Invalid email or password." }, 401);
    }

    const hash = await hashPassword(password);
    if (user.passwordHash !== hash) {
      return json({ error: "Invalid email or password." }, 401);
    }

    const userToken = `user:${user.email}:${user.passwordHash}`;
    return json({ success: true, user: { name: user.name, email: user.email }, userToken });
  }

  // ── Broadcast via Chat ────────────────────────────  ★ ADMIN ONLY
  const BROADCAST_CONV_ID = "group:broadcast-communications";

  if (method === "POST" && (path === "/broadcast" || path === "/broadcast/")) {
    if (!(await validateAdminToken(req))) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    if (!body.subject || !body.message) {
      return json({ error: "Subject and message are required." }, 400);
    }

    const registrations = await getRegistrations();
    if (registrations.length === 0) {
      return json({ error: "No registered users to send to." }, 400);
    }

    const senderEmail = body.senderEmail || "kkataila@banyansoftware.com";
    const senderName = body.senderName || "Admin";
    const allEmails = [...new Set(registrations.map(r => r.email))];
    if (!allEmails.includes(senderEmail)) allEmails.push(senderEmail);

    const convStore = getStore("chat-conversations");
    const msgStore = getStore("chat-messages");
    const convs = (await convStore.get("all", { type: "json" })) || [];
    const now = new Date().toISOString();

    // Find or create the broadcast conversation
    let conv = convs.find(c => c.id === BROADCAST_CONV_ID);
    if (!conv) {
      conv = {
        id: BROADCAST_CONV_ID,
        type: "group",
        name: "📢 Broadcast Communications",
        members: allEmails,
        createdBy: senderEmail,
        createdAt: now,
        lastMessage: null
      };
      convs.push(conv);
    } else {
      // Update members to include any new registrants
      conv.members = [...new Set([...conv.members, ...allEmails])];
    }

    // Create the message with subject as bold prefix
    const msgText = `**${body.subject.trim()}**\n${body.message.trim()}`;
    const msg = {
      id: crypto.randomUUID(),
      sender: senderEmail,
      senderName: senderName,
      text: msgText,
      type: "text",
      fileName: "",
      fileData: "",
      reactions: {},
      readBy: [{ email: senderEmail, at: now }],
      timestamp: now
    };

    conv.lastMessage = { text: msgText, senderName: msg.senderName, timestamp: msg.timestamp };

    // Append message to existing thread
    const msgs = (await msgStore.get(BROADCAST_CONV_ID, { type: "json" })) || [];
    msgs.push(msg);

    await convStore.setJSON("all", convs);
    await msgStore.setJSON(BROADCAST_CONV_ID, msgs);

    return json({ success: true, conversationId: BROADCAST_CONV_ID, memberCount: allEmails.length }, 201);
  }

  /* ── POST /api/forgot-password ──────────────────── */
  if (method === "POST" && (path === "/forgot-password" || path === "/forgot-password/")) {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const email = (body.email || "").trim().toLowerCase();
    // Always return success to prevent email enumeration
    if (!email) return json({ success: true });

    const registrations = await getRegistrations();
    const user = registrations.find(r => r.email === email);
    if (!user) return json({ success: true });

    const token = crypto.randomUUID();
    const store = getStore("password-reset-tokens");
    await store.setJSON(token, { email, expiresAt: Date.now() + 60 * 60 * 1000 });

    const resetUrl = `https://luxury-sunflower-899449.netlify.app/reset-password.html?token=${token}`;

    const ses = new SESClient({
      region: process.env.AWS_SES_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY
      }
    });

    await ses.send(new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL || "GLC Registration <noreply-glc@banyansoftware.cloud>",
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Reset your GLC 2026 password" },
        Body: {
          Html: {
            Data: `<p>Hi ${user.name},</p>
<p>Click the button below to reset your GLC 2026 password. This link expires in 1 hour.</p>
<p><a href="${resetUrl}" style="background:#395542;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;display:inline-block">Reset Password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`
          }
        }
      }
    }));

    return json({ success: true });
  }

  /* ── POST /api/reset-password ───────────────────── */
  if (method === "POST" && (path === "/reset-password" || path === "/reset-password/")) {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { token, password } = body;
    if (!token || !password) return json({ error: "Token and password are required." }, 400);
    if (password.length < 4) return json({ error: "Password must be at least 4 characters." }, 400);

    const store = getStore("password-reset-tokens");
    let record;
    try { record = await store.get(token, { type: "json" }); } catch { record = null; }

    if (!record) return json({ error: "Invalid or expired reset link." }, 400);
    if (Date.now() > record.expiresAt) {
      await store.delete(token);
      return json({ error: "This reset link has expired. Please request a new one." }, 400);
    }

    const registrations = await getRegistrations();
    const index = registrations.findIndex(r => r.email === record.email);
    if (index === -1) return json({ error: "Account not found." }, 404);

    registrations[index].passwordHash = await hashPassword(password);
    await saveRegistrations(registrations);
    await store.delete(token);

    return json({ success: true });
  }

  /* ── POST /api/registrations/import  ★ ADMIN ONLY ── */
  if (method === "POST" && (path === "/registrations/import" || path === "/registrations/import/")) {
    if (!(await validateAdminToken(req))) {
      return json({ error: "Unauthorized" }, 401);
    }
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

    const records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: "No records provided." }, 400);
    }

    const DINE_MAP = {
      "biff's bistro": 'biffs',
      "jump restaurant": 'jump',
      "the joneses": 'joneses',
      '': ''
    };
    const MC_MAP = {
      "hop-on city sightseeing bus tour": 'bustour',
      "morning yoga": 'morningyoga',
      "yoga & puppies — session #1": 'yoga1',
      "yoga & puppies - session #1": 'yoga1',
      "yoga & puppies — session #2": 'yoga2',
      "yoga & puppies - session #2": 'yoga2',
      "downtown toronto walking tour": 'walking',
      "canoeing toronto": 'canoeing',
      "tai chi in the park": 'taichi',
      "stand-up paddleboarding": 'paddleboard',
      '': ''
    };

    const registrations = await getRegistrations();
    let updated = 0;
    let skipped = 0;

    for (const rec of records) {
      const email = (rec.email || '').trim().toLowerCase();
      if (!email) { skipped++; continue; }

      const index = registrations.findIndex(r => r.email === email);
      if (index === -1) { skipped++; continue; }

      const reg = registrations[index];

      if (rec.name)                         reg.name           = rec.name.trim();
      if (rec.title         !== undefined)  reg.title          = (rec.title || '').trim();
      if (rec.organization  !== undefined)  reg.organization   = (rec.organization || '').trim();
      if (rec.arrivalDate   !== undefined)  reg.arrivalDate    = (rec.arrivalDate || '').trim();
      if (rec.departureDate !== undefined)  reg.departureDate  = (rec.departureDate || '').trim();
      if (rec.phone         !== undefined)  reg.phone          = (rec.phone || '').trim();
      if (rec.dietary !== undefined && VALID_DIETARY.includes(rec.dietary)) reg.dietary = rec.dietary;
      if (rec.dietaryOther  !== undefined)  reg.dietaryOther   = (rec.dietaryOther || '').trim();
      if (rec.sessions      !== undefined)  reg.sessions       = rec.sessions ? rec.sessions.split('; ').filter(s => s.trim()) : [];
      if (rec.welcomeReception !== undefined) reg.welcomeReception = rec.welcomeReception.toLowerCase() === 'yes';
      if (rec.dineAround !== undefined) {
        const dineKey = (rec.dineAround || '').toLowerCase();
        if (DINE_MAP[dineKey] !== undefined) reg.dineAround = DINE_MAP[dineKey];
      }
      if (rec.morningConnection !== undefined) {
        const mcKey = (rec.morningConnection || '').toLowerCase();
        if (MC_MAP[mcKey] !== undefined) reg.morningConnection = MC_MAP[mcKey];
      }
      if (rec.headshotSlot !== undefined) {
        const raw = (rec.headshotSlot || '').trim();
        if (!raw) {
          reg.headshotSlot = '';
        } else if (/^queue/i.test(raw)) {
          reg.headshotSlot = HEADSHOT_QUEUE;
        } else {
          // Accept either "HH:MM" or "H:MM AM/PM"
          let parsed = '';
          const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
          const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (m24) {
            parsed = `${String(parseInt(m24[1],10)).padStart(2,'0')}:${m24[2]}`;
          } else if (m12) {
            let h = parseInt(m12[1], 10);
            const isPm = m12[3].toUpperCase() === 'PM';
            if (isPm && h < 12) h += 12;
            if (!isPm && h === 12) h = 0;
            parsed = `${String(h).padStart(2,'0')}:${m12[2]}`;
          }
          if (isValidHeadshotSlot(parsed)) reg.headshotSlot = parsed;
        }
      }
      if (rec.tshirtFit !== undefined) reg.tshirtFit = (rec.tshirtFit || '').trim();
      if (rec.tshirt !== undefined && (VALID_TSHIRT.includes(rec.tshirt) || rec.tshirt === '')) reg.tshirt = rec.tshirt;
      // Internal / HR fields
      for (const f of INTERNAL_FIELDS) {
        if (rec[f] !== undefined) reg[f] = (rec[f] == null ? '' : String(rec[f])).trim();
      }

      registrations[index] = reg;
      updated++;
    }

    await saveRegistrations(registrations);
    return json({ success: true, updated, skipped });
  }

  /* ── POST /api/profile-photo  ★ AUTH REQUIRED ───── */
  /* Admin can supply body.email to upload on behalf of any attendee   */
  if (method === "POST" && (path === "/profile-photo" || path === "/profile-photo/")) {
    const isAdmin  = await validateAdminToken(req);
    const userAuth = !isAdmin ? await validateUserToken(req) : null;
    if (!isAdmin && !userAuth) return json({ error: "Unauthorized" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const targetEmail = isAdmin && body.email
      ? body.email.trim().toLowerCase()
      : (userAuth ? userAuth.email : null);
    if (!targetEmail) return json({ error: "Target email required." }, 400);
    if (!body.photo || !body.photo.startsWith("data:image/")) {
      return json({ error: "Invalid photo data." }, 400);
    }
    if (body.photo.length > 700000) {
      return json({ error: "Photo too large. Please use a smaller image." }, 400);
    }
    await saveProfilePhoto(targetEmail, body.photo);
    return json({ success: true });
  }

  /* ── DELETE /api/profile-photo  ★ AUTH REQUIRED ─── */
  if (method === "DELETE" && (path === "/profile-photo" || path === "/profile-photo/")) {
    const userAuth = await validateUserToken(req);
    if (!userAuth) return json({ error: "Unauthorized" }, 401);
    await deleteProfilePhoto(userAuth.email);
    return json({ success: true });
  }

  /* ── GET /api/profile-photo  ★ PUBLIC ────────────── */
  if (method === "GET" && (path === "/profile-photo" || path === "/profile-photo/")) {
    const email = (url.searchParams.get("email") || "").trim().toLowerCase();
    if (!email) return new Response(null, { status: 400 });
    const photo = await getProfilePhoto(email);
    if (!photo) return new Response(null, { status: 404 });
    const mimeMatch = photo.match(/^data:(image\/[^;]+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const base64 = photo.replace(/^data:image\/[^;]+;base64,/, "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Response(bytes.buffer, {
      status: 200,
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=60, must-revalidate" }
    });
  }

  return json({ error: "Not found" }, 404);
};
