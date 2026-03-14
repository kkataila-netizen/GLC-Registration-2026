import { getStore } from "@netlify/blobs";

const VALID_DIETARY = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher', 'Other'];
const VALID_TSHIRT = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

async function hashPassword(password) {
  const encoded = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
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

  // POST /api/registrations
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
      tshirt: body.tshirt || '',
      registeredAt: new Date().toISOString()
    };

    registrations.push(registration);
    await saveRegistrations(registrations);

    return json({ success: true, registration }, 201);
  }

  // GET /api/registrations/export
  if (method === "GET" && (path === "/registrations/export" || path === "/registrations/export/")) {
    const registrations = await getRegistrations();
    const headers = ['Name', 'Title', 'Organization', 'Email', 'Arrival Date', 'Departure Date', 'Phone', 'Dietary', 'Dietary Other', 'Sessions', 'T-Shirt', 'Registered'];
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

  // GET /api/registrations/count
  if (method === "GET" && (path === "/registrations/count" || path === "/registrations/count/")) {
    const registrations = await getRegistrations();
    return json({ count: registrations.length });
  }

  // GET /api/registrations
  if (method === "GET" && (path === "/registrations" || path === "/registrations/")) {
    let registrations = await getRegistrations();
    const search = url.searchParams.get("search");

    if (search) {
      const term = search.toLowerCase();
      registrations = registrations.filter(r =>
        r.name.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term)
      );
    }

    // Strip passwordHash from response
    const safe = registrations.map(({ passwordHash, ...rest }) => rest);
    return json({ registrations: safe, total: safe.length });
  }

  // DELETE /api/registrations/:id
  const deleteMatch = path.match(/^\/registrations\/([^/]+)\/?$/);
  if (method === "DELETE" && deleteMatch) {
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

  // PUT /api/registrations/:id
  const putMatch = path.match(/^\/registrations\/([^/]+)\/?$/);
  if (method === "PUT" && putMatch) {
    const id = putMatch[1];
    let body;
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON body." }, 400); }

    const registrations = await getRegistrations();
    const index = registrations.findIndex(r => r.id === id);

    if (index === -1) {
      return json({ error: "Registration not found." }, 404);
    }

    const reg = registrations[index];

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
    return json({ success: true, registration: safe });
  }

  // POST /api/login
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

    return json({ success: true, user: { name: user.name, email: user.email } });
  }

  // ── Broadcast via Chat ────────────────────────────
  // POST /api/broadcast — create a group chat with all users and send the message
  if (method === "POST" && (path === "/broadcast" || path === "/broadcast/")) {
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
    // Ensure sender is in members
    if (!allEmails.includes(senderEmail)) allEmails.push(senderEmail);

    const convStore = getStore("chat-conversations");
    const msgStore = getStore("chat-messages");
    const convs = (await convStore.get("all", { type: "json" })) || [];

    // Create group conversation
    const convId = `group:${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const groupName = `📢 ${body.subject.trim()}`;

    const conv = {
      id: convId,
      type: "group",
      name: groupName,
      members: allEmails,
      createdBy: senderEmail,
      createdAt: now,
      lastMessage: null
    };

    // Create the message
    const msg = {
      id: crypto.randomUUID(),
      sender: senderEmail,
      senderName: senderName,
      text: body.message.trim(),
      type: "text",
      fileName: "",
      fileData: "",
      reactions: {},
      readBy: [{ email: senderEmail, at: now }],
      timestamp: now
    };

    conv.lastMessage = { text: msg.text, senderName: msg.senderName, timestamp: msg.timestamp };
    convs.push(conv);

    await convStore.setJSON("all", convs);
    await msgStore.setJSON(convId, [msg]);

    return json({ success: true, conversationId: convId, memberCount: allEmails.length }, 201);
  }

  return json({ error: "Not found" }, 404);
};
