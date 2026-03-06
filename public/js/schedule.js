document.addEventListener('DOMContentLoaded', () => {
  const dayBtns = document.querySelectorAll('.day-btn');
  const scheduleLists = document.querySelectorAll('.schedule-list');

  dayBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.day;

      dayBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      scheduleLists.forEach(list => {
        list.hidden = list.dataset.day !== day;
      });
    });
  });
});
