// Applies the saved theme before first paint (loaded synchronously in <head>), so there is no flash.
(function () {
  var t = null;
  try { t = localStorage.getItem('tk.theme'); } catch (e) {}
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.setAttribute('data-theme', 'dark'); // the signal is dark by default
})();
