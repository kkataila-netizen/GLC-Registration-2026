import { getStore } from "@netlify/blobs";

const VALID_DIETARY = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher', 'Other'];
const VALID_TSHIRT = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

function validateRegistration(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push('Name is required and must be at least 2 characters.');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!body.email || typeof body.email !== 'string' || !emailRegex.test(body.email.trim())) {
    errors.push('A valid email address is required.');
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
      email,
      arrivalDate: body.arrivalDate || '',
      departureDate: body.departureDate || '',
      phone: body.phone ? body.phone.trim() : '',
      organization: body.organization ? body.organization.trim() : '',
      dietary: body.dietary || 'None',
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
    const headers = ['Name', 'Email', 'Arrival Date', 'Departure Date', 'Phone', 'Organization', 'Dietary', 'Sessions', 'T-Shirt', 'Registered'];
    const rows = registrations.map(r => [
      escapeCSV(r.name),
      escapeCSV(r.email),
      escapeCSV(r.arrivalDate),
      escapeCSV(r.departureDate),
      escapeCSV(r.phone),
      escapeCSV(r.organization),
      escapeCSV(r.dietary),
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

    return json({ registrations, total: registrations.length });
  }

  return json({ error: "Not found" }, 404);
};
