import { getStore } from "@netlify/blobs";

const VALID_DIETARY = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher', 'Other'];
const VALID_TSHIRT = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const ADMIN_EMAIL = "kkataila@banyansoftware.com";
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

async function getRegistrations() {
  const store = getStore("registrations");
  try {
    const data = await store.get("all", { type: "json" });
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
      registeredAt: new Date().toISOString()
    };

    registrations.push(registration);
    await saveRegistrations(registrations);

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
    const headers = ['Name', 'Title', 'Organization', 'Email', 'Arrival Date', 'Departure Date', 'Phone', 'Dietary', 'Dietary Other', 'Sessions', 'Welcome Reception', 'T-Shirt Fit', 'T-Shirt Size', 'Registered'];
    const rows = registrations.map(r => [
      escapeCSV(r.name),
      escapeCSV(r.title),
      escapeCSV(r.organization),
      escapeCSV(r.email),
      escapeCSV(r.arrivalDate),
      escapeCSV(r.departureDate),
      escapeCSV(r.phone),
      escapeCSV(r.dietary),
      escapeCSV(r.dietaryOther),
      escapeCSV(Array.isArray(r.sessions) ? r.sessions.join('; ') : ''),
      escapeCSV(r.welcomeReception ? 'Yes' : 'No'),
      escapeCSV(r.tshirtFit),
      escapeCSV(r.tshirt),
      escapeCSV(r.registeredAt)
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
    if (body.arrivalDate !== undefined) reg.arrivalDate = body.arrivalDate || '';
    if (body.departureDate !== undefined) reg.departureDate = body.departureDate || '';
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

  return json({ error: "Not found" }, 404);
};
