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

  /* ── headshot slot helpers ──────────────────────── */
  function buildHeadshotSlots() {
    const out = [];
    for (let h = 10; h < 15; h++) {
      for (let m = 0; m < 60; m += 10) {
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return out;
  }
  function formatSlotLabel(slot) {
    const [h, m] = slot.split(':').map(Number);
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  const headshotCheckbox     = document.getElementById('headshotYes');
  const headshotSelect       = document.getElementById('headshotSlot');
  const headshotHint         = document.getElementById('headshotHint');
  const headshotQueueCount   = document.getElementById('headshotQueueCount');
  const headshotQueueCountVal = document.getElementById('headshotQueueCountValue');

  async function populateHeadshotSlots(currentSlot = '') {
    let taken = [];
    let queueCount = 0;
    try {
      const res = await fetch('/api/headshots');
      if (res.ok) {
        const data = await res.json();
        taken = data.taken || [];
        queueCount = data.queueCount || 0;
      }
    } catch { /* network — fall back to empty taken list */ }

    // Update queue counter
    headshotQueueCountVal.textContent = queueCount;

    // Clear existing options (keep the placeholder)
    headshotSelect.innerHTML = '<option value="">-- Select a time slot --</option>';

    // Queue / waitlist option at the top — always available, no capacity limit
    const queueOpt = document.createElement('option');
    queueOpt.value = 'queue';
    queueOpt.textContent = '📋 We are extending more time spots for Headshots — click here to book your spot in Queue';
    if (currentSlot === 'queue') queueOpt.selected = true;
    headshotSelect.appendChild(queueOpt);

    // Visual separator
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '──────── Time slots ────────';
    headshotSelect.appendChild(sep);

    buildHeadshotSlots().forEach(slot => {
      const opt = document.createElement('option');
      opt.value = slot;
      opt.textContent = formatSlotLabel(slot);
      const isTakenByOther = taken.includes(slot) && slot !== currentSlot;
      if (isTakenByOther) {
        opt.disabled = true;
        opt.textContent += ' — taken';
      }
      if (slot === currentSlot) opt.selected = true;
      headshotSelect.appendChild(opt);
    });
  }

  function toggleHeadshotVisibility() {
    const checked = headshotCheckbox.checked;
    headshotSelect.style.display     = checked ? '' : 'none';
    headshotHint.style.display       = checked ? '' : 'none';
    headshotQueueCount.style.display = checked ? '' : 'none';
    if (!checked) headshotSelect.value = '';
  }

  headshotCheckbox.addEventListener('change', () => {
    toggleHeadshotVisibility();
    if (headshotCheckbox.checked) populateHeadshotSlots(headshotSelect.value);
  });

  // Initial population (for fresh registrations)
  populateHeadshotSlots();

  /* ── auth state ──────────────────────────────────── */
  function getUser() {
    try { return JSON.parse(localStorage.getItem('glc-user')); }
    catch { return null; }
  }

  function setUser(user, token) {
    localStorage.setItem('glc-user', JSON.stringify(user));
    // Also set chat user for backward compat
    localStorage.setItem('glc-chat-user', JSON.stringify(user));
    if (token) localStorage.setItem('glc-user-token', token);
    updateAuthUI();
  }

  function clearUser() {
    localStorage.removeItem('glc-user');
    localStorage.removeItem('glc-chat-user');
    localStorage.removeItem('glc-user-token');
    updateAuthUI();
  }

  function getUserToken() {
    return localStorage.getItem('glc-user-token') || '';
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
    location.reload();
  });

  // Init auth UI
  updateAuthUI();

  /* ── profile mode (logged-in user) ─────────────── */
  async function loadProfile() {
    const user = getUser();
    if (!user) return;

    // Update page header
    const h1 = document.querySelector('.page-header h1');
    const sub = document.querySelector('.page-header p');
    if (h1) h1.textContent = 'Profile';
    if (sub) sub.textContent = 'Update your registration details';

    // Change submit button
    submitBtn.textContent = 'Save Edits';

    // Make password optional
    const pwGroup = document.getElementById('password').closest('.form-group');
    pwGroup.querySelector('label').innerHTML = 'New Password <small style="font-weight:normal;color:#888">(leave blank to keep current)</small>';

    // Fetch registration data (authenticated)
    try {
      const res = await fetch('/api/registrations?search=' + encodeURIComponent(user.email), {
        headers: { 'Authorization': 'Bearer ' + getUserToken() }
      });
      const result = await res.json();
      const reg = result.registrations.find(r => r.email === user.email.toLowerCase());
      if (!reg) return;

      // Store ID for PUT requests
      form.dataset.regId = reg.id;

      // Populate fields
      document.getElementById('name').value = reg.name || '';
      document.getElementById('title').value = reg.title || '';
      document.getElementById('organization').value = reg.organization || '';
      document.getElementById('email').value = reg.email || '';
      document.getElementById('arrivalDate').value = reg.arrivalDate || '';
      document.getElementById('departureDate').value = reg.departureDate || '';
      document.getElementById('phone').value = reg.phone || '';
      document.getElementById('dietary').value = reg.dietary || 'None';
      if (reg.dietary === 'Other') {
        dietaryOther.style.display = '';
        dietaryOther.value = reg.dietaryOther || '';
      }
      document.getElementById('welcomeReception').checked = !!reg.welcomeReception;
      document.getElementById('tshirtFit').value = reg.tshirtFit || '';
      document.getElementById('tshirt').value = reg.tshirt || '';
      // Headshot — populate slots and pre-select the user's current one
      const hsSlot = reg.headshotSlot || '';
      headshotCheckbox.checked = !!hsSlot;
      toggleHeadshotVisibility();
      await populateHeadshotSlots(hsSlot);
      // Check session checkboxes
      if (reg.sessions && reg.sessions.length) {
        form.querySelectorAll('input[name="sessions"]').forEach(cb => {
          cb.checked = reg.sessions.includes(cb.value);
        });
      }
    } catch (e) { console.error('Failed to load profile', e); }
  }

  loadProfile();

  /* ── profile photo ──────────────────────────────── */
  const photoSection   = document.getElementById('photoSection');
  const photoPreview   = document.getElementById('photoPreview');
  const photoInitials  = document.getElementById('photoInitials');
  const photoImg       = document.getElementById('photoImg');
  const photoFile      = document.getElementById('photoFile');
  const photoRemoveBtn = document.getElementById('photoRemoveBtn');
  const photoMessage   = document.getElementById('photoMessage');

  function showPhotoMsg(type, text) {
    photoMessage.hidden = false;
    photoMessage.className = `message message--${type}`;
    photoMessage.textContent = text;
    setTimeout(() => { photoMessage.hidden = true; }, 3000);
  }

  function setPhotoPreview(dataUrl) {
    photoImg.src = dataUrl;
    photoImg.style.display = 'block';
    photoInitials.style.display = 'none';
    photoRemoveBtn.style.display = 'inline-block';
  }

  function clearPhotoPreview() {
    photoImg.src = '';
    photoImg.style.display = 'none';
    photoInitials.style.display = '';
    photoRemoveBtn.style.display = 'none';
  }

  function resizeImageToDataUrl(file, maxSize = 200) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function initPhotoSection() {
    const user = getUser();
    if (!user) return;
    photoSection.style.display = '';
    // Set initials as placeholder
    photoInitials.textContent = user.name
      ? user.name.trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2)
      : '?';
    // Load existing photo (with cache-buster so newly uploaded photos appear immediately)
    const v = localStorage.getItem('glc-photo-bust') || '';
    fetch(`/api/profile-photo?email=${encodeURIComponent(user.email)}${v ? '&v=' + v : ''}`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPhotoPreview(url);
      })
      .catch(() => {});
  }

  photoFile.addEventListener('change', async () => {
    const file = photoFile.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showPhotoMsg('error', 'File too large. Please choose an image under 2 MB.');
      photoFile.value = '';
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPhotoPreview(dataUrl);
      // Upload immediately
      const res = await fetch('/api/profile-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getUserToken() },
        body: JSON.stringify({ photo: dataUrl })
      });
      if (res.ok) {
        // Bump cache key so all photo URLs across the app refresh
        localStorage.setItem('glc-photo-bust', Date.now().toString());
        showPhotoMsg('success', 'Photo saved!');
      } else {
        const d = await res.json();
        showPhotoMsg('error', d.error || 'Failed to upload photo.');
      }
    } catch {
      showPhotoMsg('error', 'Could not upload photo. Please try again.');
    }
    photoFile.value = '';
  });

  photoRemoveBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/profile-photo', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + getUserToken() }
      });
      localStorage.setItem('glc-photo-bust', Date.now().toString());
      clearPhotoPreview();
      showPhotoMsg('success', 'Photo removed.');
    } catch {
      showPhotoMsg('error', 'Could not remove photo.');
    }
  });

  initPhotoSection();

  /* ── dietary "Other" toggle ────────────────────── */
  const dietarySelect = document.getElementById('dietary');
  const dietaryOther = document.getElementById('dietaryOther');
  dietarySelect.addEventListener('change', () => {
    dietaryOther.style.display = dietarySelect.value === 'Other' ? '' : 'none';
    if (dietarySelect.value !== 'Other') dietaryOther.value = '';
  });

  /* ── registration form ───────────────────────────── */
  function validateForm(data, isEdit) {
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

    if (!isEdit && (!data.password || data.password.length < 4)) {
      errors.password = 'Password is required (at least 4 characters).';
    }
    if (isEdit && data.password && data.password.length > 0 && data.password.length < 4) {
      errors.password = 'Password must be at least 4 characters.';
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
      welcomeReception: document.getElementById('welcomeReception').checked,
      tshirtFit: document.getElementById('tshirtFit').value,
      tshirt: document.getElementById('tshirt').value,
      headshotSlot: headshotCheckbox.checked ? headshotSelect.value : ''
    };

    const isEdit = !!form.dataset.regId;
    const { valid, errors } = validateForm(data, isEdit);
    if (!valid) {
      for (const [field, message] of Object.entries(errors)) {
        showFieldError(field, message);
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Saving...' : 'Submitting...';

    try {
      let url, method;
      const payload = { ...data };

      const fetchHeaders = { 'Content-Type': 'application/json' };

      if (isEdit) {
        url = '/api/registrations/' + form.dataset.regId;
        method = 'PUT';
        // Don't send empty password on edit
        if (!payload.password) delete payload.password;
        fetchHeaders['Authorization'] = 'Bearer ' + getUserToken();
      } else {
        url = '/api/registrations';
        method = 'POST';
      }

      const res = await fetch(url, {
        method,
        headers: fetchHeaders,
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (isEdit && res.ok) {
        showMessage(formMessage, 'success', 'Profile updated successfully!');
        // Update localStorage if name or email changed; update token if returned
        setUser({ name: data.name.trim(), email: data.email.trim().toLowerCase() }, result.userToken);
      } else if (res.status === 201) {
        showMessage(formMessage, 'success', 'Registration complete! You are now logged in.');
        form.reset();
        // Auto-login after registration with token
        setUser({ name: data.name.trim(), email: data.email.trim().toLowerCase() }, result.userToken);
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
      submitBtn.textContent = isEdit ? 'Save Edits' : 'Register';
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
        setUser({ name: result.user.name, email: result.user.email }, result.userToken);
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
