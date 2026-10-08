/* Shows the legal-page block that matches the site language (midimovie.lang), with a small switcher. */
(function () {
  var L = [['ja', '日本語'], ['en', 'English'], ['zh', '中文']];
  function cur() { try { var s = localStorage.getItem('midimovie.lang'); if (s && /^(ja|en|zh)$/.test(s)) return s; } catch (e) {} return 'en'; }
  function show(l) {
    document.documentElement.lang = l === 'zh' ? 'zh-Hans' : l;
    document.querySelectorAll('[data-l]').forEach(function (e) { var on = e.getAttribute('data-l') === l; e.style.display = on ? 'block' : 'none'; if (on) document.title = e.getAttribute('data-title') + ' – MidiMovie'; });
    document.querySelectorAll('#lg button').forEach(function (b) { b.classList.toggle('on', b.dataset.k === l); });
    try { localStorage.setItem('midimovie.lang', l); } catch (e) {}
  }
  var lg = document.getElementById('lg');
  L.forEach(function (x) { var b = document.createElement('button'); b.textContent = x[1]; b.dataset.k = x[0]; b.onclick = function () { show(x[0]); }; lg.appendChild(b); });
  var c = (window.MM_LICENSE || {}).contactEmail, h = c ? '<a href="mailto:' + c + '">' + c + '</a>' : '<a href="https://github.com/aratius/MidiMovie/issues">GitHub Issues</a>';
  document.querySelectorAll('.contact').forEach(function (e) { e.innerHTML = h; });
  show(cur());
})();
