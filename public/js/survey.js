/* ============================================================
   Survey — collects answers and saves them to the survey store.
   The question set is a placeholder; collectAnswers() is the only
   function to update when the final survey design lands.
   ============================================================ */
(() => {
  'use strict';

  function getUserToken() { return localStorage.getItem('glc-user-token') || ''; }

  const form = document.getElementById('surveyForm');
  const msg = document.getElementById('surveyMessage');
  const submitBtn = document.getElementById('surveySubmitBtn');

  function showMsg(type, text) {
    msg.hidden = false;
    msg.className = `message message--${type}`;
    msg.textContent = text;
  }

  // Gather the current form into a flat answers object.
  // Keys become CSV export columns — keep them stable and readable.
  function collectAnswers() {
    const rating = form.querySelector('input[name="overallRating"]:checked');
    return {
      'Overall Rating': rating ? rating.value : '',
      'Favourite Session': document.getElementById('favoriteSession').value.trim(),
      'Comments': document.getElementById('comments').value.trim()
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;

    const token = getUserToken();
    if (!token) {
      showMsg('error', 'Please log in before submitting the survey.');
      return;
    }

    const answers = collectAnswers();
    if (Object.values(answers).every(v => !v)) {
      showMsg('error', 'Please answer at least one question.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ answers })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showMsg('success', 'Thank you! Your survey response has been saved.');
      } else if (res.status === 401) {
        showMsg('error', 'Your session has expired — please log in again and resubmit.');
      } else {
        showMsg('error', data.error || 'Could not save your response. Please try again.');
      }
    } catch {
      showMsg('error', 'Network error. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Survey';
    }
  });
})();
