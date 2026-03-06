document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registrationForm');
  const submitBtn = document.getElementById('submitBtn');
  const formMessage = document.getElementById('formMessage');

  function validateForm(data) {
    const errors = {};

    if (!data.name || data.name.trim().length < 2) {
      errors.name = 'Name is required and must be at least 2 characters.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email.trim())) {
      errors.email = 'A valid email address is required.';
    }

    if (data.phone && !/^[0-9\s\-\(\)\+]{7,20}$/.test(data.phone.trim())) {
      errors.phone = 'Phone number format is invalid.';
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

  function showMessage(type, text) {
    formMessage.hidden = false;
    formMessage.className = `message message--${type}`;
    formMessage.textContent = text;
  }

  function hideMessage() {
    formMessage.hidden = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    hideMessage();

    const data = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      arrivalDate: document.getElementById('arrivalDate').value,
      phone: document.getElementById('phone').value,
      organization: document.getElementById('organization').value,
      dietary: document.getElementById('dietary').value,
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
        showMessage('success', 'Registration complete! You are now registered for GLC Conference 2026.');
        form.reset();
      } else if (res.status === 409) {
        showMessage('error', result.errors?.[0] || 'This email is already registered.');
      } else if (res.status === 400) {
        showMessage('error', result.errors?.join(' ') || 'Please check your input and try again.');
      } else {
        showMessage('error', 'Something went wrong. Please try again.');
      }
    } catch {
      showMessage('error', 'Could not connect to the server. Please try again later.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register';
    }
  });
});
