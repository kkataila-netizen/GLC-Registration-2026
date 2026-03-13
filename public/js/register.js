document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registrationForm');
  const submitBtn = document.getElementById('submitBtn');
  const formMessage = document.getElementById('formMessage');
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const loginMessage = document.getElementById('loginMessage');
  const loginSection = document.getElementById('loginSection');
  const loggedInSection = document.getElementById('loggedInSection');
  const loggedInName = document.getElementById('loggedInName');
  const loggedInEmail = document.getElementById('loggedInEmail');
  const logoutBtn = document.getElementById('logoutBtn');

  /* ── auth state ──────────────────────────────────── */
  function getUser() {
    try { return JSON.parse(localStorage.getItem('glc-user')); }
    catch { return null; }
  }

  function setUser(user) {
    localStorage.setItem('glc-user', JSON.stringify(user));
    // Also set chat user for backward compat
    localStorage.setItem('glc-chat-user', JSON.stringify(user));
    updateAuthUI();
  }

  function clearUser() {
    localStorage.removeItem('glc-user');
    localStorage.removeItem('glc-chat-user');
    updateAuthUI();
  }

  function updateAuthUI() {
    const user = getUser();
    if (user) {
      loginSection.hidden = true;
      loggedInSection.hidden = false;
      loggedInName.textContent = user.name;
      loggedInEmail.textContent = user.email;
    } else {
      loginSection.hidden = false;
      loggedInSection.hidden = true;
    }
  }

  logoutBtn.addEventListener('click', () => {
    clearUser();
  });

  // Init auth UI
  updateAuthUI();

  /* ── dietary "Other" toggle ────────────────────── */
  const dietarySelect = document.getElementById('dietary');
  const dietaryOther = document.getElementById('dietaryOther');
  dietarySelect.addEventListener('change', () => {
    dietaryOther.style.display = dietarySelect.value === 'Other' ? '' : 'none';
    if (dietarySelect.value !== 'Other') dietaryOther.value = '';
  });

  /* ── registration form ───────────────────────────── */
  function validateForm(data) {
    const errors = {};

    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Name is required and must be at least 2 characters.';
    }

    if (!data.title || data.title.trim().length < 2) {
      errors.title = 'Title is required.';
    }

    if (!data.organization || data.organization.trim().length < 2) {
      errors.organization = 'Organization / Company is required.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email.trim())) {
      errors.email = 'A valid email address is required.';
    }

    if (!data.password || data.password.length < 4) {
      errors.password = 'Password is required (at least 4 characters).';
    }

    if (!data.arrivalDate) {
      errors.arrivalDate = 'Arrival date is required.';
    }

    if (!data.departureDate) {
      errors.departureDate = 'Departure date is required.';
    }

    if (data.phone && !/^[0-9\s\-\(\)\+]{7,20}$/.test(data.phone.trim())) {
      errors.phone = 'Phone number format is invalid.';
    }

    if (!data.tshirt) {
      errors.tshirt = 'T-Shirt size is required.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function clearErrors() {
    form.querySelectorAll('.form-group--error').forEach(g => g.classList.remove('form-group--error'));
    form.querySelectorAll('.field-error').forEach(e => e.remove());
  }

  function showFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const group = input.closest('.form-group');
    group.classList.add('form-group--error');
    const span = document.createElement('span');
    span.className = 'field-error';
    span.textContent = message;
    group.appendChild(span);
  }

  function showMessage(el, type, text) {
    el.hidden = false;
    el.className = `message message--${type}`;
    el.textContent = text;
  }

  function hideMessage(el) {
    el.hidden = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    hideMessage(formMessage);

    const data = {
      name: document.getElementById('name').value,
      title: document.getElementById('title').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      arrivalDate: document.getElementById('arrivalDate').value,
      departureDate: document.getElementById('departureDate').value,
      phone: document.getElementById('phone').value,
      organization: document.getElementById('organization').value,
      dietary: document.getElementById('dietary').value,
      dietaryOther: document.getElementById('dietaryOther').value,
      sessions: Array.from(form.querySelectorAll('input[name="sessions"]:checked')).map(cb => cb.value),
      tshirt: document.getElementById('tshirt').value
    };

    const { valid, errors } = validateForm(data);
    if (!valid) {
      for (const [field, message] of Object.entries(errors)) {
        showFieldError(field, message);
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (res.status === 201) {
        showMessage(formMessage, 'success', 'Registration complete! You are now logged in.');
        form.reset();
        // Auto-login after registration
        setUser({ name: data.name.trim(), email: data.email.trim().toLowerCase() });
      } else if (res.status === 409) {
        showMessage(formMessage, 'error', result.errors?.[0] || 'This email is already registered.');
      } else if (res.status === 400) {
        showMessage(formMessage, 'error', result.errors?.join(' ') || 'Please check your input and try again.');
      } else {
        showMessage(formMessage, 'error', 'Something went wrong. Please try again.');
      }
    } catch {
      showMessage(formMessage, 'error', 'Could not connect to the server. Please try again later.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register';
    }
  });

  /* ── login form ──────────────────────────────────── */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage(loginMessage);

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      showMessage(loginMessage, 'error', 'Email and password are required.');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await res.json();

      if (res.ok) {
        setUser({ name: result.user.name, email: result.user.email });
        showMessage(loginMessage, 'success', `Welcome back, ${result.user.name}!`);
        loginForm.reset();
      } else {
        showMessage(loginMessage, 'error', result.error || 'Invalid email or password.');
      }
    } catch {
      showMessage(loginMessage, 'error', 'Could not connect to the server.');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Log In';
    }
  });
});
