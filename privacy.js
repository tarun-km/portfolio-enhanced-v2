document.getElementById('forget').addEventListener('click', () => {
  try { ['tk.vid', 'tk.profile', 'sound'].forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  document.getElementById('forgetMsg').textContent = 'Done. This browser no longer remembers you.';
});
