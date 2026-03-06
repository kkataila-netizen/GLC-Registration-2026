document.addEventListener('DOMContentLoaded', () => {
  const cards = document.querySelectorAll('.session-card');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const isOpen = card.classList.contains('session-card--open');

      // Close all cards
      cards.forEach(c => c.classList.remove('session-card--open'));

      // Toggle clicked card (if it wasn't already open)
      if (!isOpen) {
        card.classList.add('session-card--open');
      }
    });
  });
});
