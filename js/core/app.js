/**
 * App-Hülle: Hash-Router, untere Navigation, Sync-Anzeige, Einrichtung (Code/Rolle), Updates.
 * Module registrieren sich mit App.route(name, { nav, full, live, render(ctx), mount(el, ctx), unmount() }).
 */
var App = (function () {
  var routes = {};
  var active = null;      // { name, def, ctx }
  var role = null;        // 'uprava' (Team) | 'gost' (Jagdgast)
  var teamNav = null;     // ursprüngliche Navigation (Team)
  var GOST_ROUTES = ['gost', 'karta', 'lovostaj', 'wetter'];
  var syncState = 'ok';   // ok | pending | offline | error | auth

  function route(name, def) { routes[name] = def; }

  function parseHash() {
    var h = (location.hash || '#/home').replace(/^#\/?/, '');
    var q = {};
    var qi = h.indexOf('?');
    if (qi !== -1) {
      h.slice(qi + 1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
      h = h.slice(0, qi);
    }
    var parts = h.split('/').filter(Boolean);
    return { name: parts[0] || 'home', params: parts.slice(1), query: q };
  }

  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  function render(keepScroll) {
    var r = parseHash();
    // Gäste sehen nur Gästeseite, Karte und Jagdzeiten; alles andere führt zur Gästeseite.
    if (role === 'gost' && GOST_ROUTES.indexOf(r.name) === -1) { history.replaceState(null, '', '#/gost'); r = parseHash(); }
    var def = routes[r.name] || routes.home;
    var view = document.getElementById('view');
    if (active && active.def.unmount) { try { active.def.unmount(); } catch (e) { console.error(e); } }
    UI.closeSheet(true);
    var ctx = { params: r.params, query: r.query, name: r.name };
    active = { name: r.name, def: def, ctx: ctx };
    view.className = def.full ? 'full' : '';
    var y = window.scrollY;
    view.innerHTML = def.render ? def.render(ctx) : '';
    injectIcons(view);
    I18n.apply(view);
    if (def.mount) def.mount(view, ctx);
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    UI.$$('#bottomnav a').forEach(function (a) {
      if (a.getAttribute('data-nav') === (def.nav || r.name)) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /** Datenänderung → aktuelle Seite neu zeichnen (außer Formularseiten, live:false). */
  function refreshView() {
    if (!active) return;
    if (active.def.live === false) { if (active.def.onData) active.def.onData(); return; }
    if (document.querySelector('.sheet')) return; // offenes Sheet nicht wegreißen
    render(true);
  }

  function injectIcons(root) {
    UI.$$('[data-icon]', root).forEach(function (el) {
      var k = el.getAttribute('data-icon');
      if (ICONS[k]) { el.outerHTML = ICONS[k]; }
    });
  }

  /* ---------------- Sync-Anzeige ---------------- */
  function updateSyncPill() {
    var pill = document.getElementById('sync-pill');
    var text = document.getElementById('sync-pill-text');
    var n = Store.outbox().length;
    var errors = Store.outbox().filter(function (e) { return e.status === 'error'; }).length;
    var cls = '', label;
    if (syncState === 'auth') { cls = 'error'; label = I18n.t('pillCode'); }
    else if (errors) { cls = 'error'; label = I18n.t('pillErrors', { n: errors }); }
    else if (Sync.isRunning()) { cls = 'pending'; label = I18n.t('pillSending'); }
    else if (n) { cls = navigator.onLine ? 'pending' : 'offline'; label = I18n.t('pillPending', { n: n }); }
    else if (!navigator.onLine) { cls = 'offline'; label = I18n.t('pillOffline'); }
    else { label = I18n.t('pillSynced'); }
    pill.className = 'sync-pill ' + cls;
    text.textContent = label;
  }

  async function syncNow(opts) {
    if (!navigator.onLine) { updateSyncPill(); return null; }
    var res = await Sync.run();
    if (res.authError) syncState = 'auth';
    else if (res.networkError) syncState = 'offline';
    else syncState = 'ok';
    await Store.reloadOutbox();
    if (res.sent.length || (opts && opts.pull)) {
      var p = await Store.refresh();
      if (p === 'auth') syncState = 'auth';
    }
    updateSyncPill();
    if (res.warnings.length && !(opts && opts.quiet)) UI.toast(res.warnings.join(' '), { timeout: 7000 });
    return res;
  }

  /* ---------------- Einrichtung ---------------- */
  function setupLangButtons() {
    UI.$$('#setup-lang button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === I18n.lang()));
      b.onclick = function () { setLang(b.getAttribute('data-lang')); setupLangButtons(); };
    });
  }

  async function openSetup(first) {
    var el = document.getElementById('setup');
    document.getElementById('setup-error').hidden = true;
    document.getElementById('setup-notice').hidden = true;
    document.getElementById('setup-code').value = '';
    document.getElementById('setup-code').placeholder = first ? '' : I18n.t('phCodeKeep');
    document.getElementById('setup-device').value = (await DB.get('device')) || '';
    document.getElementById('setup-cancel').hidden = first;
    setupLangButtons();
    I18n.apply(el);
    el.classList.add('show');
    setTimeout(function () { document.getElementById('setup-code').focus(); }, 60);
  }
  function closeSetup() { document.getElementById('setup').classList.remove('show'); }

  document.getElementById('setup-cancel').onclick = closeSetup;
  document.getElementById('setup-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var err = document.getElementById('setup-error');
    err.hidden = true;
    var existing = await DB.get('code');
    var code = document.getElementById('setup-code').value.trim() || existing || '';
    if (!code) { err.textContent = I18n.t('errCodeEmpty'); err.hidden = false; return; }
    var btn = document.getElementById('setup-submit');
    btn.disabled = true; btn.textContent = I18n.t('checking');
    var offline = false, newRole = null;
    try {
      var res = await API.call('options', code);
      newRole = res.role;
    } catch (e) {
      if (e.kind === 'auth') {
        btn.disabled = false; btn.textContent = I18n.t('btnSave');
        err.textContent = I18n.t('errCodeWrong'); err.hidden = false;
        return;
      }
      offline = true; // ohne Netz trotzdem speichern — geprüft wird beim ersten Senden
    }
    btn.disabled = false; btn.textContent = I18n.t('btnSave');
    await DB.set('code', code);
    await DB.set('device', document.getElementById('setup-device').value.trim());
    if (newRole) { role = newRole; await DB.set('role', newRole); }
    if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
    syncState = 'ok';
    updateBrand();
    if (offline) {
      var n = document.getElementById('setup-notice');
      n.textContent = I18n.t('setupOffline'); n.hidden = false;
      setTimeout(closeSetup, 1800);
    } else closeSetup();
    syncNow({ pull: true }).then(function () { Tutorial.maybeShow(); autoSaveMap(); });
    render(true);
  });

  function updateBrand() {
    document.getElementById('brand-sub').textContent = role === 'uprava' ? I18n.t('roleUprava') : role === 'gost' ? I18n.t('roleGost') : I18n.t('brandSub');
    applyRoleNav();
  }

  /** Gäste: nur „Übersicht“ und „Karte“ in der unteren Navigation. */
  function applyRoleNav() {
    var nav = document.getElementById('bottomnav');
    if (!teamNav) teamNav = nav.innerHTML;
    var want = role === 'gost' ? 'gost' : 'team';
    if (nav.getAttribute('data-mode') !== want) {
      nav.setAttribute('data-mode', want);
      nav.innerHTML = want === 'gost'
        ? '<a href="#/gost" data-nav="gost"><span data-icon="home"></span><span data-i18n="navGost"></span><i class="ind"></i></a>' +
          '<a href="#/karta" data-nav="karta"><span data-icon="map"></span><span data-i18n="navKarta"></span><i class="ind"></i></a>'
        : teamNav;
      nav.style.gridTemplateColumns = want === 'gost' ? 'repeat(2,1fr)' : '';
      injectIcons(nav);
    }
    I18n.apply(nav);
  }

  function setLang(lang) {
    I18n.setLang(lang);
    // Gäste: Freitexte (Bemerkungen, Abholung …) kommen vom Server übersetzt → neu abrufen
    if (role === 'gost' && navigator.onLine) Store.refresh();
    I18n.apply(document);
    updateBrand();
    updateSyncPill();
    render(true);
  }

  /* ---------------- Service Worker ---------------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return; reloading = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // Neue Version: sofort übernehmen, wenn gerade nichts eingegeben wird — sonst Hinweis mit Knopf.
      // (Einträge liegen in IndexedDB und überstehen das Neuladen ohnehin.)
      function busy() { return !!document.querySelector('.sheet') || (active && active.def.live === false) || /#\/odstrjel\/(novi|uredi)/.test(location.hash) || document.getElementById('setup').classList.contains('show'); }
      function offer(worker) {
        if (!busy()) { worker.postMessage('skipWaiting'); return; }
        UI.toast(I18n.t('updateText'), { kind: 'update', sticky: true, action: I18n.t('btnUpdate'), onAction: function () { worker.postMessage('skipWaiting'); } });
      }
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (nw) nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
        });
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.update().catch(function () {});
      });
    }).catch(function () {});
  }

  /* ---------------- Start ---------------- */
  /**
   * Start-Link aus dem QR-Code: #/start?c=<Gästecode>&g=<Gast-ID>&l=<Sprache> → speichern, zur Gästeseite.
   * (Alles nach „#" bleibt auf dem Gerät und wird nicht an den Webserver übertragen.)
   */
  async function handleStartLink() {
    var r = parseHash();
    if (r.name !== 'start' || !r.query.c) return false;
    await DB.set('code', r.query.c);
    if (r.query.g) await DB.set('gostId', r.query.g);
    if (r.query.l) I18n.setLang(r.query.l);
    // Team-QR (r=uprava) führt zur Startseite, Gäste-QR zur Gästeseite; die Rolle bestätigt der Server beim ersten Abruf.
    var team = r.query.r === 'uprava';
    await DB.set('role', team ? 'uprava' : 'gost');
    if (team) await DB.set('gostId', '');
    history.replaceState(null, '', team ? '#/home' : '#/gost');
    return true;
  }

  /* ---------------- Installation ---------------- */
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvent = e; var b = document.getElementById('inst-android'); if (b) b.hidden = false; });

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  /**
   * Nicht installiert (Browser-Tab oder WhatsApp-Innenbrowser) → Hinweis, wie man installiert. Nur installiert
   * läuft die App zuverlässig ohne Netz, und iOS löscht die Daten eines Browser-Tabs nach einigen Tagen.
   */
  function showInstallHint() {
    if (isStandalone()) return;
    try { if (sessionStorage.getItem('seona_inst_later')) return; } catch (e) {}
    var ua = navigator.userAgent || '';
    var inApp = /WhatsApp|FBAN|FBAV|Instagram|Line\//i.test(ua);
    var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!ios && !/Android/i.test(ua)) return; // am Computer (Verwaltung im Browser) kein Hinweis
    var t = I18n.t, esc = UI.esc;
    var el = document.createElement('div');
    el.className = 'overlay show install';
    el.setAttribute('role', 'dialog');
    el.innerHTML = '<div class="box">' +
      '<img src="icons/icon-192.png" alt="" class="inst-icon">' +
      '<h2>' + esc(t('instTitle')) + '</h2><p>' + esc(t('instText')) + '</p>' +
      (inApp ? '<p class="notice">' + esc(t('instInApp')) + '</p>'
        : ios ? '<ol class="inst-steps"><li>' + ICONS.share + '<span>' + esc(t('instIos1')) + '</span></li><li>' + ICONS.plus + '<span>' + esc(t('instIos2')) + '</span></li><li>' + ICONS.home + '<span>' + esc(t('instIos3')) + '</span></li></ol>'
        : '<button type="button" class="btn primary block" id="inst-android"' + (installEvent ? '' : ' hidden') + '>' + ICONS.plus + esc(t('instAndroid')) + '</button>' +
          '<p class="hint" style="margin-top:10px">' + esc(t('instAndroidManual')) + '</p>') +
      '<button type="button" class="btn ghost block" id="inst-later" style="margin-top:14px">' + esc(t('instLater')) + '</button></div>';
    document.body.appendChild(el);
    var b = el.querySelector('#inst-android');
    if (b) b.onclick = async function () {
      if (!installEvent) return;
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (e) {}
      installEvent = null; el.remove();
    };
    el.querySelector('#inst-later').onclick = function () {
      try { sessionStorage.setItem('seona_inst_later', '1'); } catch (e) {}
      el.remove();
    };
    window.addEventListener('appinstalled', function () { el.remove(); });
  }

  /** Karte einmalig von selbst offline speichern (wer denkt schon an „Više → Karte speichern"). */
  var mapAuto = false;
  async function autoSaveMap() {
    if (mapAuto || !navigator.onLine || !window.MapOffline || !('caches' in window)) return;
    if (await MapOffline.status()) return;
    mapAuto = true;
    try {
      var res = await MapOffline.download(function (d, n) {
        if (d % 100 === 0) UI.toast(I18n.t('mapAutoSaving', { p: Math.round(d / n * 100) }), { timeout: 4000 });
      });
      if (!res.failed) UI.toast(I18n.t('mapAutoDone'));
    } catch (e) {}
    mapAuto = false;
  }

  async function start() {
    await handleStartLink();
    I18n.apply(document);
    injectIcons(document.getElementById('bottomnav'));
    document.getElementById('sync-pill').onclick = function () { go('#/vise?sync=1'); };
    window.addEventListener('hashchange', function () { render(); });
    window.addEventListener('online', function () { syncState = 'ok'; syncNow({ pull: true, quiet: true }); });
    window.addEventListener('offline', updateSyncPill);
    Sync.onChange(updateSyncPill);
    Store.onChange(function () {
      var s = Store.snapshot();
      if (s && s.role && s.role !== role) {
        role = s.role; updateBrand();
        if (role === 'gost' && GOST_ROUTES.indexOf(parseHash().name) === -1) { updateSyncPill(); render(); return; }
      }
      updateSyncPill();
      refreshView();
    });

    registerSW();
    role = (await DB.get('role')) || null;
    updateBrand();
    await Store.load();
    await Wetter.load();
    render();
    Wetter.refresh();
    updateSyncPill();

    showInstallHint();
    var code = await DB.get('code');
    if (!code) { openSetup(true); return; }
    Tutorial.maybeShow();
    syncNow({ pull: true, quiet: true }).then(function () { Tutorial.maybeShow(); autoSaveMap(); });
    // Solange die App offen ist: alle 90 s abgleichen (Stand anderer Jäger, Drückjagden …)
    setInterval(function () {
      if (document.visibilityState === 'visible' && navigator.onLine) syncNow({ pull: true, quiet: true });
    }, 90000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && navigator.onLine) syncNow({ pull: true, quiet: true });
    });
  }

  return {
    start: start, route: route, go: go, render: render, syncNow: syncNow, openSetup: openSetup, setLang: setLang,
    role: function () { return role; },
    isUprava: function () { return role === 'uprava'; },
    isGost: function () { return role === 'gost'; },
    syncState: function () { return syncState; },
    injectIcons: injectIcons
  };
})();
