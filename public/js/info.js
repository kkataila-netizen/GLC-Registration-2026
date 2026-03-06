document.addEventListener('DOMContentLoaded', () => {
  const headers = document.querySelectorAll('.accordion-header');

  headers.forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const isOpen = item.classList.contains('accordion-item--open');

      // Close all items
      document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('accordion-item--open');
      });

      // Toggle clicked item (if it wasn't already open)
      if (!isOpen) {
        item.classList.add('accordion-item--open');
      }
    });
  });
});
