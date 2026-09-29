/**
 * Revierkarte: Kartenbild der QField-Feldkarte (tools/karte_bauen.py → tiles/), Reviergrenzen,
 * Waldabteilungen (antippbar, Verjüngung hervorgehoben), Einrichtungen, Abschussorte, eigener Standort.
 * Einrichtungen werden über ein Fadenkreuz in der Kartenmitte eingetragen (einhändig bedienbar).
 */
var MapOffline = (function () {
  var CACHE = 'seona-karta-v1';
  // Team: tiles/ (QField-Karte mit Reviergrenzen) · Gäste: tiles_gast/ (dieselbe Karte ohne Grenzen)
  function prefix() { return App.isGost() ? 'tiles_gast' : 'tiles'; }
  function flag() { return App.isGost() ? 'mapSavedGast' : 'mapSaved'; }
  async function status() {
    var saved = await DB.get(flag());
    return saved || null;
  }
  /** Alle Kacheln + Kartendaten in den Offline-Cache laden. onProgress(done, total). */
  async function download(onProgress) {
    var pre = prefix();
    var index = await (await fetch(pre + '/index.json', { cache: 'no-store' })).json();
    var meta = await (await fetch('map/meta.json', { cache: 'no-store' })).json();
    var urls = ['map/reviere.geojson', 'map/odjeli.geojson', 'map/namen.geojson', 'map/meta.json'].concat(index.map(function (p) { return pre + '/' + p + '.jpg'; }));
    var cache = await caches.open(CACHE);
    var done = 0, failed = 0, i = 0;
    async function worker() {
      while (i < urls.length) {
        var u = urls[i++];
        try {
          var hit = await cache.match(u);
          if (!hit) {
            var res = await fetch(u);
            if (!res.ok) throw new Error(res.status);
            await cache.put(u, res);
          }
        } catch (e) { failed++; }
        done++;
        if (onProgress && (done % 20 === 0 || done === urls.length)) onProgress(done, urls.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    if (!failed) await DB.set(flag(), { at: Date.now(), gebaut: meta.gebaut, tiles: index.length });
    return { total: urls.length, failed: failed };
  }
  return { status: status, download: download, prefix: prefix, CACHE: CACHE };
})();

var Karta = (function () {
  var esc = UI.esc, t = I18n.t;
  var map = null, layers = {}, watchId = null, meMarker = null, meCircle = null, mode = null, focusMarker = null;
  var show = { objekti: true, odstrjel: false, odjeli: false };
  try { var saved = JSON.parse(localStorage.getItem('seona_map_layers') || 'null'); if (saved) show = Object.assign(show, saved); } catch (e) {}

  function saveLayers() { try { localStorage.setItem('seona_map_layers', JSON.stringify(show)); } catch (e) {} }

  // Gäste: nur Kartenbild (Namen, Wege, Gewässer, Relief) und eigener Standort.
  // Keine Reviergrenzen, Einrichtungen, Abschussorte, Abteilungen, Treffpunkte, kein Eintragen.
  function guest() { return App.isGost(); }

  function render(ctx) {
    var g = guest();
    return '<div class="map-wrap"><div id="map" aria-label="' + esc(t('navKarta')) + '"></div>' +
      (g ? '' : '<div class="map-top"><div class="chips" id="layer-chips">' +
      ['objekti', 'odstrjel', 'odjeli'].map(function (k) {
        return '<button type="button" class="chip" data-layer="' + k + '" aria-pressed="' + show[k] + '">' + esc(t('layer_' + k)) + '</button>';
      }).join('') + '</div></div>') +
      '<div class="map-fab" id="map-fab">' +
      '<button type="button" class="fab" id="fab-locate" aria-label="' + esc(t('myLocation')) + '">' + ICONS.locate + '</button>' +
      (g ? '' : '<button type="button" class="fab primary" id="fab-add" aria-label="' + esc(t('addObjekt')) + '">' + ICONS.plus + '</button>') + '</div>' +
      '<button type="button" class="fab map-full-btn" id="fab-full" aria-label="' + esc(t('fullscreen')) + '">' + ICONS.expand + '</button>' +
      '<div id="map-overlay"></div></div>';
  }

  /* ---------- Vollbild: Android/Chrome echtes Vollbild, iPhone per CSS (Kopfzeile/Navigation ausgeblendet) ---------- */
  var usedApi = false;
  function isFull() { return document.body.classList.contains('map-full'); }
  function setFull(on) {
    var wrap = document.querySelector('.map-wrap');
    document.body.classList.toggle('map-full', on);
    var btn = document.getElementById('fab-full');
    if (btn) { btn.innerHTML = on ? ICONS.collapse : ICONS.expand; btn.setAttribute('aria-label', t(on ? 'fullscreenExit' : 'fullscreen')); }
    if (on && wrap && wrap.requestFullscreen && !document.fullscreenElement) {
      wrap.requestFullscreen().then(function () { usedApi = true; }).catch(function () { usedApi = false; });
    } else if (!on && document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
      usedApi = false;
    }
    setTimeout(function () { if (map) map.invalidateSize(); }, 260);
  }
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && usedApi && isFull()) { usedApi = false; setFull(false); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isFull() && !document.fullscreenElement) setFull(false); });

  /** Treffpunkte der kommenden Drückjagden (und einer ausdrücklich gewählten). */
  function drawMeet(ctx) {
    if (layers.meet) { map.removeLayer(layers.meet); layers.meet = null; }
    if (guest()) return; // Treffpunkte für Gäste erst mit der Drückjagd-Fassung (Welle 2)
    var focusId = ctx && ctx.query && ctx.query.meet;
    var today = UI.todayISO();
    var g = L.layerGroup();
    Store.lovovi().forEach(function (l) {
      if (!(Number(l.sastanakLat) && Number(l.sastanakLon))) return;
      if (String(l.datum).slice(0, 10) < today && l.id !== focusId) return;
      var m = L.marker([l.sastanakLat, l.sastanakLon], { icon: L.divIcon({ className: '', html: '<div class="meet-marker"></div>', iconSize: [30, 30], iconAnchor: [15, 30] }), zIndexOffset: 900, title: t('gMeeting') });
      m.on('click', function () { openMeet(l); });
      g.addLayer(m);
    });
    layers.meet = g.addTo(map);
  }

  function openMeet(l) {
    UI.openSheet('<div class="eyebrow-sm">' + esc(t('gMeeting')) + '</div><h2>' + esc(l.naziv || t('lovDefaultName')) + '</h2>' +
      '<p class="sheet-sub">' + esc(UI.fmtDate(String(l.datum).slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' })) + '</p>' +
      (l.sastanak ? '<p style="margin:0 0 12px">' + esc(l.sastanak) + '</p>' : '') +
      '<a class="btn primary block" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + l.sastanakLat + ',' + l.sastanakLon + '">' + ICONS.pin + esc(t('gRoute')) + '</a>', null, { noFocus: true });
  }

  function objIcon(o) {
    var cls = 'obj-marker' + (o.stanje === 'uklonjen' ? ' removed' : '') + (o.stanje === 'popravak' || o.stanje === 'neupotrebljivo' ? ' bad' : '');
    return L.divIcon({ className: '', html: '<div class="' + cls + '" style="position:relative"><img alt="" src="' + (ICONS.objekt[o.art] || ICONS.objekt.kanzel) + '"></div>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }

  function drawData(ctx) {
    if (!map) return;
    ['objekti', 'odstrjel', 'lovFocus'].forEach(function (k) { if (layers[k]) { map.removeLayer(layers[k]); layers[k] = null; } });
    drawMeet(ctx);
    if (guest()) return;
    var lovFocus = ctx && ctx.query && ctx.query.lov ? Store.lovovi().filter(function (l) { return l.id === ctx.query.lov; })[0] : null;
    if (show.objekti || lovFocus) {
      var g = L.layerGroup();
      Store.objekti().forEach(function (o) {
        if (!(Number(o.lat) && Number(o.lon))) return;
        var m = L.marker([o.lat, o.lon], { icon: objIcon(o), keyboard: true, title: I18n.objekt(o.art) + (o.broj ? ' ' + o.broj : '') });
        m.on('click', function () { Objekti.openDetail(o.id); });
        g.addLayer(m);
      });
      layers.objekti = g.addTo(map);
    }
    if (lovFocus && Array.isArray(lovFocus.stajalista)) {
      var ring = L.layerGroup(), pts = [];
      Store.objekti().forEach(function (o) {
        if (lovFocus.stajalista.indexOf(o.id) === -1) return;
        pts.push([o.lat, o.lon]);
        ring.addLayer(L.circleMarker([o.lat, o.lon], { radius: 20, color: '#471b28', weight: 3, fill: false, interactive: false }));
      });
      layers.lovFocus = ring.addTo(map);
      if (pts.length && !ctx._fitted) { map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 }); ctx._fitted = true; }
    }
    if (show.odstrjel) {
      var k = L.layerGroup();
      Stats.inJJ(Store.strecke()).forEach(function (r) {
        if (!(Number(r.lat) && Number(r.lon))) return;
        var m = L.marker([r.lat, r.lon], { icon: L.divIcon({ className: '', html: '<div class="kill-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), title: Strecke.title(r) });
        m.on('click', function () { Strecke.openDetail(r.id); });
        k.addLayer(m);
      });
      layers.odstrjel = k.addTo(map);
    }
  }

  async function drawOdjeli() {
    if (layers.odjeli) { map.removeLayer(layers.odjeli); layers.odjeli = null; }
    if (!show.odjeli || guest()) return;
    try {
      var fc = await Geo.loadGeo('odjeli');
      if (!map || !show.odjeli) return;
      layers.odjeli = L.geoJSON(fc, {
        style: function (f) {
          var v = f.properties.verj;
          return { color: '#2d6a2d', weight: 1, dashArray: '2 3', opacity: .8,
            fillColor: v === 'pomladak' ? '#dd985f' : v === 'oplodna' ? '#d9b400' : '#2d6a2d',
            fillOpacity: v ? .28 : .02 };
        },
        onEachFeature: function (f, layer) { layer.on('click', function () { openOdjel(f.properties); }); }
      }).addTo(map);
      if (layers.reviere) layers.reviere.bringToFront();
    } catch (e) { UI.toast(t('mapDataMissing')); }
  }

  function openOdjel(p) {
    var verj = p.verj === 'pomladak' ? t('verjPomladak') : p.verj === 'oplodna' ? t('verjOplodna') : '';
    var kv = [[t('odGj'), p.gj], [t('odOdjel'), (p.odjel || '') + (p.odsjek ? ' ' + p.odsjek : '')], [t('odHa'), p.ha != null ? p.ha + ' ha' : ''],
      [t('odRazred'), p.razred], [t('odStarost'), p.starost ? p.starost + ' ' + t('years') : ''], [t('odDobni'), p.dr ? p.dr + '.' : ''],
      [t('odSklop'), p.sklop], [t('odBonitet'), p.bonitet], [t('odUzgoj'), p.uzgoj], [t('odGodina'), p.godina]].filter(function (x) { return x[1]; });
    UI.openSheet('<h2>' + esc(t('odOdjel') + ' ' + (p.odjel || '') + (p.odsjek ? ' ' + p.odsjek : '')) + '</h2>' +
      '<p class="sheet-sub">' + esc(p.gj || '') + '</p>' +
      (verj ? '<p><span class="badge warn">' + esc(verj) + '</span></p><p class="hint">' + esc(t('verjHint')) + '</p>' : '') +
      '<dl class="kv">' + kv.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
      '<p class="source">' + esc(t('odSource')) + '</p>', null, { noFocus: true });
  }

  function locate(pan) {
    if (!navigator.geolocation) { UI.toast(t('gpsFailed')); return; }
    if (watchId !== null) { if (pan && meMarker) map.setView(meMarker.getLatLng(), Math.max(map.getZoom(), 15)); return; }
    var first = true;
    document.getElementById('fab-locate').classList.add('active');
    watchId = navigator.geolocation.watchPosition(function (p) {
      var ll = [p.coords.latitude, p.coords.longitude];
      if (!meMarker) {
        meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
        meCircle = L.circle(ll, { radius: p.coords.accuracy, color: '#2f6fc0', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
      } else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(p.coords.accuracy); }
      if (first && pan) { map.setView(ll, Math.max(map.getZoom(), 15)); first = false; }
    }, function (err) {
      UI.toast(err && err.code === 1 ? t('gpsDenied') : t('gpsFailed'));
      stopLocate();
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  }
  function stopLocate() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    var f = document.getElementById('fab-locate'); if (f) f.classList.remove('active');
  }

  /** Platzierungsmodus: Fadenkreuz in der Mitte, Leiste unten. onPlace(latlng). */
  function placeMode(text, onPlace) {
    mode = 'place';
    var ov = document.getElementById('map-overlay');
    document.getElementById('map-fab').hidden = true;
    ov.innerHTML = '<svg class="crosshair" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="24" cy="24" r="10"/><path d="M24 2v12M24 34v12M2 24h12M34 24h12"/></svg>' +
      '<div class="place-bar"><p>' + esc(text) + '</p><div class="btn-row">' +
      '<button type="button" class="btn small" data-gps>' + ICONS.locate + esc(t('myLocation')) + '</button>' +
      '<button type="button" class="btn small ghost" data-cancel>' + esc(t('cancel')) + '</button>' +
      '<button type="button" class="btn small primary" data-place>' + esc(t('placeHere')) + '</button></div></div>';
    ov.querySelector('[data-cancel]').onclick = endPlace;
    ov.querySelector('[data-gps]').onclick = async function () {
      try { var p = await Geo.position(); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 17)); }
      catch (e) { UI.toast(e && e.code === 1 ? t('gpsDenied') : t('gpsFailed')); }
    };
    ov.querySelector('[data-place]').onclick = function () { var c = map.getCenter(); endPlace(); onPlace({ lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) }); };
  }
  function endPlace() {
    mode = null;
    var ov = document.getElementById('map-overlay'); if (ov) ov.innerHTML = '';
    var fab = document.getElementById('map-fab'); if (fab) fab.hidden = false;
  }

  async function offlineBanner() {
    var st = await MapOffline.status();
    if (st || !map) return;
    var ov = document.getElementById('map-overlay');
    if (!ov || mode) return;
    var b = document.createElement('div');
    b.className = 'map-banner';
    b.innerHTML = '<span>' + esc(t('mapNotSaved')) + '</span><button type="button" class="btn small dark">' + esc(t('saveMap')) + '</button>';
    ov.appendChild(b);
    b.querySelector('button').onclick = async function () {
      var btn = this; btn.disabled = true;
      var span = b.querySelector('span');
      try {
        var res = await MapOffline.download(function (d, n) { span.textContent = t('savingMap', { p: Math.round(d / n * 100) }); });
        if (res.failed) { span.textContent = t('saveMapPartial', { n: res.failed }); btn.disabled = false; }
        else { b.remove(); UI.toast(t('mapSaved')); }
      } catch (e) { span.textContent = t('saveMapFailed'); btn.disabled = false; }
    };
  }

  async function mount(el, ctx) {
    var meta;
    try { meta = await (await fetch('map/meta.json')).json(); }
    catch (e) { el.querySelector('#map').innerHTML = UI.emptyState('map', t('mapDataMissing'), t('mapDataMissingText')); return; }
    if (!document.getElementById('map')) return; // inzwischen weiter navigiert
    map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: meta.minZoom, maxZoom: 18, maxBounds: L.latLngBounds(meta.bounds).pad(0.15), preferCanvas: true });
    L.tileLayer(MapOffline.prefix() + '/{z}/{x}/{y}.jpg', {
      minZoom: meta.minZoom, maxZoom: 18, maxNativeZoom: meta.maxNativeZoom, bounds: meta.bounds,
      attribution: 'Seona Eko · QField-karta (DGU, OSM, HŠ)'
    }).addTo(map);
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    var view = null;
    try { view = JSON.parse(sessionStorage.getItem('seona_map_view') || 'null'); } catch (e) {}
    if (ctx.query.lat && ctx.query.lon) {
      var ll = [Number(ctx.query.lat), Number(ctx.query.lon)];
      map.setView(ll, 16);
      focusMarker = L.circleMarker(ll, { radius: 16, color: '#471b28', weight: 3, fill: false }).addTo(map);
    } else if (view) map.setView(view.c, view.z);
    else map.fitBounds(meta.reviere, { padding: [20, 20] });
    map.on('moveend', function () { try { sessionStorage.setItem('seona_map_view', JSON.stringify({ c: map.getCenter(), z: map.getZoom() })); } catch (e) {} });

    if (!guest()) try {
      var rev = await Geo.loadGeo('reviere');
      layers.reviere = L.geoJSON(rev, { interactive: false, style: function (f) { return { color: f.properties.boja, weight: 3, opacity: .9, fillOpacity: 0 }; } }).addTo(map);
    } catch (e) {}
    drawOdjeli();
    drawData(ctx);

    UI.$$('#layer-chips .chip', el).forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-layer');
        show[k] = !show[k]; saveLayers();
        b.setAttribute('aria-pressed', String(show[k]));
        if (k === 'odjeli') drawOdjeli(); else drawData(ctx);
        if (k === 'odjeli' && show.odjeli) UI.toast(t('odjeliLegend'), { timeout: 6000 });
      };
    });
    el.querySelector('#fab-locate').onclick = function () { locate(true); };
    el.querySelector('#fab-full').onclick = function () { setFull(!isFull()); };
    var add = el.querySelector('#fab-add');
    if (add) add.onclick = function () { startAdd(); };
    if (ctx.query.meet) focusMeet(ctx.query.meet);
    if (guest()) { offlineBanner(); return; }
    if (ctx.query.add) startAdd();
    if (ctx.query.move) startMove(ctx.query.move);
    offlineBanner();
  }

  /** Treffpunkt zeigen; fehlt er und ist das Team angemeldet: per Fadenkreuz setzen. */
  function focusMeet(id) {
    var l = Store.lovovi().filter(function (x) { return x.id === id; })[0];
    if (!l || !map) return;
    if (Number(l.sastanakLat) && Number(l.sastanakLon)) { map.setView([l.sastanakLat, l.sastanakLon], 16); return; }
    if (!App.isUprava()) return;
    placeMode(t('meetPlaceHint'), async function (pos) {
      await Store.queueUpsert('lov', { id: l.id, sastanakLat: pos.lat, sastanakLon: pos.lon });
      App.syncNow({ quiet: true });
      UI.toast(t('meetSaved'));
      drawMeet({ query: { meet: l.id } });
    });
  }

  function startAdd() {
    if (!map) return;
    if (!show.objekti) { show.objekti = true; saveLayers(); drawData({ query: {} }); var c = document.querySelector('[data-layer="objekti"]'); if (c) c.setAttribute('aria-pressed', 'true'); }
    placeMode(t('placeHint'), function (pos) { Objekti.openForm({ lat: pos.lat, lon: pos.lon }); });
  }

  function startMove(id) {
    var o = Store.objekti().filter(function (x) { return x.id === id; })[0];
    if (!o || !map) return;
    map.setView([o.lat, o.lon], Math.max(map.getZoom(), 17));
    placeMode(t('moveHint', { name: I18n.objekt(o.art) + (o.broj ? ' ' + o.broj : '') }), async function (pos) {
      var lok = await Geo.lovisteAt(pos.lat, pos.lon);
      await Store.queueUpsert('objekt', { id: o.id, lat: pos.lat, lon: pos.lon, lokacija: lok || o.lokacija });
      App.syncNow({ quiet: true });
      UI.toast(t('moved'));
    });
  }

  function unmount() {
    if (isFull()) setFull(false);
    stopLocate();
    if (map) { map.remove(); map = null; }
    layers = {}; meMarker = null; meCircle = null; mode = null; focusMarker = null;
  }

  App.route('karta', {
    nav: 'karta', full: true, live: false,
    render: render, mount: mount, unmount: unmount,
    onData: function () { if (map && mode !== 'place') drawData({ query: {} }); }
  });

  return { startMove: startMove, isOpen: function () { return !!map; } };
})();

/**
 * Kartenauswahl für Formulare (z. B. Abschussort, wenn erst an der Kühlzelle gemeldet wird):
 * Vollbild-Karte mit Fadenkreuz → MapPicker.open({ lat, lon }) liefert { lat, lon } oder null (abgebrochen).
 */
var MapPicker = (function () {
  var esc = UI.esc, t = I18n.t;
  function open(start) {
    return new Promise(async function (resolve) {
      var meta;
      try { meta = await (await fetch('map/meta.json')).json(); } catch (e) { UI.toast(t('mapDataMissing')); return resolve(null); }
      var ov = document.createElement('div');
      ov.className = 'picker';
      ov.innerHTML = '<div class="picker-map" id="picker-map"></div>' +
        '<svg class="crosshair" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="24" cy="24" r="10"/><path d="M24 2v12M24 34v12M2 24h12M34 24h12"/></svg>' +
        '<div class="place-bar"><p>' + esc(t('pickHint')) + '</p><div class="btn-row">' +
        '<button type="button" class="btn small" data-gps>' + ICONS.locate + esc(t('myLocation')) + '</button>' +
        '<button type="button" class="btn small ghost" data-cancel>' + esc(t('cancel')) + '</button>' +
        '<button type="button" class="btn small primary" data-ok>' + esc(t('placeHere')) + '</button></div></div>';
      document.body.appendChild(ov);
      document.body.classList.add('picker-open');
      var map = L.map('picker-map', { zoomControl: false, minZoom: meta.minZoom, maxZoom: 18, maxBounds: L.latLngBounds(meta.bounds).pad(0.15), attributionControl: false });
      L.tileLayer(MapOffline.prefix() + '/{z}/{x}/{y}.jpg', { minZoom: meta.minZoom, maxZoom: 18, maxNativeZoom: meta.maxNativeZoom, bounds: meta.bounds }).addTo(map);
      L.control.zoom({ position: 'topright' }).addTo(map);
      if (start && Number(start.lat) && Number(start.lon)) map.setView([start.lat, start.lon], 16);
      else map.fitBounds(meta.reviere, { padding: [20, 20] });
      setTimeout(function () { map.invalidateSize(); }, 50);
      function done(v) { map.remove(); ov.remove(); document.body.classList.remove('picker-open'); resolve(v); }
      ov.querySelector('[data-cancel]').onclick = function () { done(null); };
      ov.querySelector('[data-ok]').onclick = function () { var c = map.getCenter(); done({ lat: +c.lat.toFixed(6), lon: +c.lng.toFixed(6) }); };
      ov.querySelector('[data-gps]').onclick = async function () {
        try { var p = await Geo.position(); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 17)); }
        catch (e) { UI.toast(e && e.code === 1 ? t('gpsDenied') : t('gpsFailed')); }
      };
    });
  }
  return { open: open };
})();
