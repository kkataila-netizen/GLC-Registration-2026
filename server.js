const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function readRegistrations() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeRegistrations(registrations) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(registrations, null, 2), 'utf8');
}

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

// CSV helper
function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Routes

// Create registration
app.post('/api/registrations', (req, res) => {
  const { valid, errors } = validateRegistration(req.body);
  if (!valid) {
    return res.status(400).json({ success: false, errors });
  }

  const registrations = readRegistrations();
  const email = req.body.email.trim().toLowerCase();

  if (registrations.some(r => r.email.toLowerCase() === email)) {
    return res.status(409).json({ success: false, errors: ['This email is already registered.'] });
  }

  const registration = {
    id: crypto.randomUUID(),
    name: req.body.name.trim(),
    email: email,
    arrivalDate: req.body.arrivalDate || '',
    phone: req.body.phone ? req.body.phone.trim() : '',
    organization: req.body.organization ? req.body.organization.trim() : '',
    dietary: req.body.dietary || 'None',
    sessions: Array.isArray(req.body.sessions) ? req.body.sessions : [],
    tshirt: req.body.tshirt || '',
    registeredAt: new Date().toISOString()
  };

  registrations.push(registration);
  writeRegistrations(registrations);

  res.status(201).json({ success: true, registration });
});

// List registrations
app.get('/api/registrations', (req, res) => {
  let registrations = readRegistrations();
  const search = req.query.search;

  if (search) {
    const term = search.toLowerCase();
    registrations = registrations.filter(r =>
      r.name.toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term)
    );
  }

  res.json({ registrations, total: registrations.length });
});

// Registration count
app.get('/api/registrations/count', (req, res) => {
  const registrations = readRegistrations();
  res.json({ count: registrations.length });
});

// Export CSV
app.get('/api/registrations/export', (req, res) => {
  const registrations = readRegistrations();
  const headers = ['Name', 'Email', 'Arrival Date', 'Phone', 'Organization', 'Dietary', 'Sessions', 'T-Shirt', 'Registered'];
  const rows = registrations.map(r => [
    escapeCSV(r.name),
    escapeCSV(r.email),
    escapeCSV(r.arrivalDate),
    escapeCSV(r.phone),
    escapeCSV(r.organization),
    escapeCSV(r.dietary),
    escapeCSV(Array.isArray(r.sessions) ? r.sessions.join('; ') : ''),
    escapeCSV(r.tshirt),
    escapeCSV(r.registeredAt)
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
