/* Saving files from the browser, including installed (PWA / "Add to Home Screen") mode.
   A programmatic download that fires after a long render has no user gesture behind it; installed apps and iOS then ignore it silently.
   So in those contexts we show a small dialog with a real Save link and (where supported) a Share / "Save to Files" button. */
(function () {
  'use strict';
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const iOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const tr = (k, v) => (window.I18N && I18N.t) ? I18N.t(k, v) : k;
  function legacy(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
  const mb = (b) => (b / 1e6 >= 10 ? Math.round(b / 1e6) : (b / 1e6).toFixed(1)) + ' MB';
  let dlg = null, url = null;
  function build() {
    dlg = document.createElement('dialog'); dlg.className = 'modal'; dlg.id = 'dlgSave'; dlg.setAttribute('aria-labelledby', 'dlgSaveT');
    dlg.innerHTML = '<div class="modal-in narrow"><header class="modal-head"><h2 id="dlgSaveT"></h2><button class="x" type="button" data-close aria-label="Close">×</button></header>' +
      '<div class="modal-body"><section class="msec"><div class="mono" id="saveName" style="word-break:break-all"></div><div class="muted small-text" id="saveSize"></div>' +
      '<div class="btnrow"><a class="btn primary" id="saveLink"></a><button class="btn" type="button" id="saveShare" hidden></button></div>' +
      '<p class="muted small-text" id="saveNote"></p></section></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { const u = url; url = null; if (u) setTimeout(() => URL.revokeObjectURL(u), 60000); });
  }
  function offer(blob, name) {
    if (!dlg) build();
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    dlg.querySelector('#dlgSaveT').textContent = tr('save.title');
    dlg.querySelector('#saveName').textContent = name; dlg.querySelector('#saveSize').textContent = mb(blob.size);
    const a = dlg.querySelector('#saveLink'); a.href = url; a.download = name; a.textContent = tr('save.save');
    dlg.querySelector('#saveNote').textContent = tr(iOS() ? 'save.noteIOS' : 'save.note');
    const sh = dlg.querySelector('#saveShare'); sh.hidden = true;
    let file = null; try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (e) { /* old browser */ }
    if (file && navigator.canShare && navigator.share) { try { if (navigator.canShare({ files: [file] })) { sh.hidden = false; sh.textContent = tr('save.share'); sh.onclick = async () => { try { await navigator.share({ files: [file], title: name }); } catch (e) { /* cancelled */ } }; } } catch (e) { /* ignore */ } }
    if (!dlg.open) dlg.showModal();
  }
  function file(blob, name) { if (standalone() || iOS()) offer(blob, name); else legacy(blob, name); }
  window.Save = { file, offer, standalone, iOS };
})();
