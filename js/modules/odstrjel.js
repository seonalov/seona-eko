/**
 * Schnellerfassung Abschuss (aus der ersten Fassung übernommen) + GPS, Drückjagd/Stand,
 * Kühlzelle/ASK-Probe. Auch Bearbeiten: wartende Einträge (jeder), gesendete (nur Verwaltung).
 * Gespeicherte Werte bleiben Kroatisch — Formeln im Sheet hängen daran.
 */
var Odstrjel = (function () {
  var esc = UI.esc, t = I18n.t;
  var SPECIES = ['Jelen obični', 'Srna', 'Divlja svinja', 'Jelen lopatar', 'Muflon', 'Ostalo'];
  // Drei Stufen: jung · Jährling · älter (Beschriftung je Wildart, I18n.klasaFor); „Srednja klasa" alter Einträge wird zugeordnet
  var KLASE = ['Tele/prase', 'Mlađa klasa', 'Zrela klasa'];
  var NACINI = ['Dočeka (usjedanje)', 'Prigon/pogon', 'Šuljanje', 'Uginula divljač'];
  var st = null; // Formularzustand

  function editTarget(ctx) {
    if (ctx.params[0] !== 'uredi') return null;
    var id = decodeURIComponent(ctx.params[1] || '');
    return Store.strecke().filter(function (r) { return r.id === id; })[0] || null;
  }

  /** Kleine Vorschau: die z15-Kachel um den Punkt, Punkt in der Mitte. */
  function miniMap(lat, lon) {
    var z = 15, n = 256 * Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    var x = (lon + 180) / 360 * n, y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    var tx = Math.floor(x / 256), ty = Math.floor(y / 256), ox = x - tx * 256, oy = y - ty * 256;
    var url = MapOffline.prefix() + '/' + z + '/' + tx + '/' + ty + '.jpg';
    if (window.PREVIEW_TILES) url = (App.isGost() ? PREVIEW_TILES_GAST : PREVIEW_TILES)[z + '/' + tx + '/' + ty] || '';
    return '<div class="loc-mini" style="background:url(' + url + ') ' + Math.round(48 - ox) + 'px ' + Math.round(48 - oy) + 'px no-repeat #efe9d8"><span class="pin"></span></div>';
  }

  function render(ctx) {
    var edit = editTarget(ctx);
    if (ctx.params[0] === 'uredi' && !edit) {
      return '<div class="page-head"><h1>' + esc(t('notFound')) + '</h1></div><a class="btn" href="#/odstrjel">' + esc(t('back')) + '</a>';
    }
    var d = edit || {};
    var isOther = edit && SPECIES.indexOf(edit.vrsta) === -1;
    var sp = isOther ? 'Ostalo' : d.vrsta;
    var canPhoto = !edit || edit._pending;
    return '<div class="page-head"><div class="eyebrow"><a href="#/odstrjel" style="color:inherit">' + esc(t('navOdstrjel')) + '</a></div>' +
      '<h1>' + esc(edit ? t('editOdstrjel') : t('newOdstrjel')) + '</h1>' +
      (edit && !edit._pending ? '<p>' + esc(t('editSentHint')) + '</p>' : '') + '</div>' +
      '<form id="unos-form" novalidate class="stack">' +
      '<div class="panel"><span class="field-label req">' + esc(t('lblVrsta')) + '</span><div class="species-grid">' +
      SPECIES.map(function (v) {
        return '<button type="button" class="species-btn" data-sp="' + esc(v) + '" aria-pressed="' + (sp === v) + '">' + ICONS.forSpecies(v) + '<span>' + esc(v === 'Ostalo' ? t('spOstalo') : I18n.species(v)) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="field" id="ostalo-wrap" style="margin-top:14px"' + (sp === 'Ostalo' ? '' : ' hidden') + '><label class="field-label req" for="vrstaOstalo">' + esc(t('lblKojaVrsta')) + '</label>' +
      '<input type="text" id="vrstaOstalo" value="' + esc(isOther ? d.vrsta : '') + '" placeholder="' + esc(t('phVrsta')) + '"></div></div>' +

      '<div class="panel">' +
      '<div class="field"><span class="field-label req">' + esc(t('lblSpol')) + '</span><div class="radio-group">' +
      '<label><input type="radio" name="spol" value="m"' + (d.spol === 'm' ? ' checked' : '') + '><span>' + esc(t('spolM')) + '</span></label>' +
      '<label><input type="radio" name="spol" value="ž"' + (d.spol === 'ž' ? ' checked' : '') + '><span>' + esc(t('spolZ')) + '</span></label></div></div>' +
      // Altersklasse als große Knöpfe und Pflichtfeld — die Planerfüllung (Frischlinge, Klassen) hängt daran
      '<div class="field"><span class="field-label req" id="klasa-label">' + esc(t('klasa')) + '</span><div class="radio-group klasa-group">' +
      KLASE.map(function (k) { return '<label><input type="radio" name="dobnaKlasa" value="' + esc(k) + '"' + (I18n.klasaStufe(d.vrsta, d.dobnaKlasa) === k ? ' checked' : '') + '><span data-klasa="' + esc(k) + '">' + esc(I18n.klasaFor(sp, k)) + '</span></label>'; }).join('') + '</div></div>' +
      '<div id="trofej-wrap"></div>' +
      '<div class="grid-2"><div class="field"><label class="field-label req" for="tezina">' + esc(t('lblTezinaShort')) + '</label><div class="unit-wrap"><input type="number" id="tezina" inputmode="decimal" min="1" step="0.5" value="' + esc(d.tezina || '') + '"><span>kg</span></div></div>' +
      '<div class="field"><label class="field-label req" for="brojMarkice">' + esc(t('lblMarkica')) + '</label><input type="text" id="brojMarkice" inputmode="numeric" value="' + esc(d.brojMarkice || '') + '"></div></div>' +
      '<div class="field"><label class="field-label req" for="lokacija">' + esc(t('lblLoviste')) + '</label><select id="lokacija">' +
      Store.lovista().map(function (l) { return '<option' + (d.lokacija === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></div>' +
      // Ort des Abschusses: aktueller Standort ODER auf der Karte wählen (Meldung oft erst an der Kühlzelle)
      '<div class="field loc-block"><span class="field-label">' + esc(t('lblMjesto')) + '</span>' +
      '<div class="loc-buttons"><button type="button" class="btn" id="loc-gps">' + ICONS.locate + esc(t('myLocation')) + '</button>' +
      '<button type="button" class="btn" id="loc-map">' + ICONS.map + esc(t('pickOnMap')) + '</button></div>' +
      '<div id="loc-result"></div></div>' +
      '<div class="grid-2"><div class="field"><label class="field-label req" for="datum">' + esc(t('lblDatum')) + '</label><input type="date" id="datum" value="' + esc(d.datum || '') + '"></div>' +
      '<div class="field"><label class="field-label" for="vrijemeOdstrjela">' + esc(t('lblVrijeme')) + '</label><input type="time" id="vrijemeOdstrjela" value="' + esc(d.vrijemeOdstrjela || '') + '"></div></div>' +
      '<div class="field"><label class="field-label req" for="lovac">' + esc(t('lblLovac')) + '</label><input type="text" id="lovac" list="lovci-list" autocomplete="off" value="' + esc(d.lovac || '') + '" placeholder="' + esc(t('phLovac')) + '"><datalist id="lovci-list"></datalist></div>' +
      '<div class="field"><label class="field-label" id="napomena-label" for="napomena">' + esc(t('lblNapomena')) + '</label><textarea id="napomena">' + esc(d.napomena || '') + '</textarea>' +
      '<button type="button" class="btn small" id="napomena-ok" style="margin-top:8px"' + (sp === 'Divlja svinja' ? '' : ' hidden') + '>' + ICONS.check + esc(t('btnNoAnomalies')) + '</button></div>' +
      '</div>' +

      (edit ? '' : '<div class="panel" id="cold-panel"><label style="display:flex;gap:12px;align-items:center;font-weight:600;cursor:pointer;min-height:44px"><input type="checkbox" id="cold" checked style="width:22px;height:22px">' +
        '<span>' + esc(t('coldCheck')) + '<span class="hint" style="display:block;font-weight:400;margin:0">' + esc(t('coldHint')) + '</span></span></label>' +
        '<div class="field" id="asp-wrap" style="margin-top:12px" hidden><label class="field-label" for="aspUzorak">' + esc(t('lblAspUzorak')) + '</label><input type="text" id="aspUzorak" placeholder="' + esc(t('phAspUzorak')) + '"></div></div>') +

      // Drückjagd-Strecke wird auf der Drückjagdseite erfasst — hier nur Jagdart und Foto
      '<div class="panel">' +
      '<div class="field"><label class="field-label" for="nacinLova">' + esc(t('lblNacinLova')) + '</label><select id="nacinLova"><option value=""></option>' +
      NACINI.map(function (n) { return '<option value="' + esc(n) + '"' + (d.nacinLova === n ? ' selected' : '') + '>' + esc(I18n.nacin(n)) + '</option>'; }).join('') + '</select></div>' +
      (canPhoto ? '<div class="field"><label class="field-label" for="foto">' + esc(t('lblFoto')) + '</label><input type="file" id="foto" accept="image/*" capture="environment"><div class="photo-preview" id="foto-preview"></div></div>' : '') +
      '</div>' +
      '<div class="error-msg" id="error-msg" hidden></div>' +
      '<button type="submit" class="btn primary block" id="submit-btn" style="min-height:56px;font-size:1.05rem">' + esc(edit ? t('btnSaveChanges') : t('btnSaveOdstrjel')) + '</button>' +
      '</form>';
  }

  /**
   * Geweih/Trophäe: 'vrhovi' (Rothirsch: Enden), 'lopata' (Damhirsch: Schaufelstufe), 'foto' (Rehbock, Widder,
   * älterer Keiler: nur Foto-Knopf) oder ''. Nüchtern gehalten — Dokumentation, keine Trophäenschau.
   */
  function trofejNacin(vrsta, spol, klasa) {
    if (spol !== 'm') return '';
    var jung = klasa === 'Tele/prase';
    if (vrsta === 'Jelen obični') return jung ? '' : 'vrhovi';
    if (vrsta === 'Jelen lopatar') return jung ? '' : 'lopata';
    if (vrsta === 'Srna' || vrsta === 'Muflon') return jung ? '' : 'foto';
    if (vrsta === 'Divlja svinja') return klasa === 'Zrela klasa' ? 'foto' : '';
    return '';
  }

  /** HTML des Geweih-Blocks. v = { rogovlje, masa, cic, foto }, o = { photo: Foto-Knopf zeigen, ocjena: Bewertung zeigen } */
  function trofejHtml(nacin, v, o) {
    if (!nacin) return '';
    var h = '';
    if (nacin === 'vrhovi') {
      h += '<div class="field"><label class="field-label req" for="rog-vrhovi">' + esc(t('lblVrhovi')) + '</label>' +
        '<input type="number" id="rog-vrhovi" inputmode="numeric" min="2" max="30" step="1" value="' + esc(v.rogovlje || '') + '" style="max-width:140px">' +
        '<p class="hint">' + esc(t('hintVrhovi')) + '</p></div>';
    }
    if (nacin === 'lopata') {
      h += '<div class="field"><span class="field-label req">' + esc(t('lblLopata')) + '</span><div class="radio-group klasa-group">' +
        I18n.LOPATA_STUFEN.map(function (k) { return '<label><input type="radio" name="lopata" value="' + esc(k) + '"' + (v.rogovlje === k ? ' checked' : '') + '><span>' + esc(I18n.lopata(k)) + '</span></label>'; }).join('') + '</div></div>';
    }
    if (o.photo) h += '<div class="field"><button type="button" class="btn small ghost" id="trofej-foto">' + ICONS.camera + (v.foto ? '✓ ' : '') + esc(t('lblFoto')) + '</button></div>';
    if (o.ocjena) {
      h += '<div class="field"><span class="field-label">' + esc(t('trofejTitle')) + '</span><div class="grid-2">' +
        '<div><label class="hint" for="rog-masa" style="display:block;margin:0 0 4px">' + esc(t('lblTrofejMasa')) + '</label><input type="number" id="rog-masa" inputmode="decimal" step="0.01" min="0" value="' + esc(v.masa || '') + '"></div>' +
        '<div><label class="hint" for="rog-cic" style="display:block;margin:0 0 4px">' + esc(t('lblCic')) + '</label><input type="number" id="rog-cic" inputmode="decimal" step="0.01" min="0" value="' + esc(v.cic || '') + '"></div></div></div>';
    }
    return h;
  }

  /** Geweih-Block neu zeichnen, wenn Wildart, Geschlecht oder Klasse wechseln (eingegebene Werte bleiben erhalten). */
  function updateTrofej(el) {
    var wrap = el.querySelector('#trofej-wrap');
    if (!wrap || !st) return;
    readTrofej(el);
    var spol = el.querySelector('input[name=spol]:checked'), klasa = el.querySelector('input[name=dobnaKlasa]:checked');
    var nacin = trofejNacin(st.species, spol ? spol.value : '', klasa ? klasa.value : '');
    if (nacin === st.trofejNacin) return;
    st.trofejNacin = nacin;
    wrap.innerHTML = trofejHtml(nacin, { rogovlje: st.rogovlje, masa: st.masa, cic: st.cic, foto: st.foto },
      { photo: !!el.querySelector('#foto'), ocjena: !!(st.edit && !st.edit._new) });
    var fb = wrap.querySelector('#trofej-foto');
    if (fb) fb.onclick = function () { el.querySelector('#foto').click(); };
  }
  function readTrofej(el) {
    var x;
    if ((x = el.querySelector('#rog-vrhovi'))) st.rogovlje = x.value.trim();
    if ((x = el.querySelector('input[name=lopata]:checked'))) st.rogovlje = x.value;
    if ((x = el.querySelector('#rog-masa'))) st.masa = x.value.trim();
    if ((x = el.querySelector('#rog-cic'))) st.cic = x.value.trim();
  }

  function setSpecies(el, v) {
    st.species = v;
    UI.$$('.species-btn', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sp') === v)); });
    el.querySelector('#ostalo-wrap').hidden = v !== 'Ostalo';
    var svinja = v === 'Divlja svinja';
    el.querySelector('#napomena-label').classList.toggle('req', svinja);
    el.querySelector('#napomena').placeholder = svinja ? t('phNapomenaSvinja') : t('phNapomena');
    el.querySelector('#napomena-ok').hidden = !svinja;
    el.querySelector('#klasa-label').classList.toggle('req', v !== 'Ostalo');
    UI.$$('[data-klasa]', el).forEach(function (x) { x.textContent = I18n.klasaFor(v, x.getAttribute('data-klasa')); });
    var asp = el.querySelector('#asp-wrap');
    if (asp) asp.hidden = !svinja;
    updateTrofej(el);
  }

  async function mount(el, ctx) {
    var edit = editTarget(ctx);
    if (ctx.params[0] === 'uredi' && !edit) return;
    st = { species: null, foto: '', lat: edit ? edit.lat : '', lon: edit ? edit.lon : '', zona: edit ? edit.zona : '', acc: null, edit: edit,
      rogovlje: edit && edit.rogovlje !== undefined ? String(edit.rogovlje) : '', masa: edit && edit.trofejMasa !== undefined ? String(edit.trofejMasa) : '',
      cic: edit && edit.trofejCic !== undefined ? String(edit.trofejCic) : '', trofejNacin: null };
    var list = el.querySelector('#lovci-list');
    var local = (await DB.get('lovciLocal')) || [];
    var seen = {};
    Store.lovci().concat(local).forEach(function (n) {
      var k = String(n).trim().toLowerCase(); if (!k || seen[k]) return; seen[k] = 1;
      var o = document.createElement('option'); o.value = n; list.appendChild(o);
    });

    if (edit) {
      setSpecies(el, SPECIES.indexOf(edit.vrsta) === -1 ? 'Ostalo' : edit.vrsta);
      st.lovId = edit.lovId || ''; st.stajaliste = edit.stajaliste || '';
    } else {
      // „wie letzter Eintrag": Lovište, Jäger, Jagdart; Datum nur, wenn < 12 h her
      var last = (await DB.get('last')) || {};
      var q = ctx.query || {};
      if (last.lokacija) el.querySelector('#lokacija').value = last.lokacija;
      if (last.lovac) el.querySelector('#lovac').value = last.lovac;
      if (last.nacinLova) el.querySelector('#nacinLova').value = last.nacinLova;
      var recent = last.at && Date.now() - last.at < 12 * 3600e3;
      el.querySelector('#datum').value = (recent && last.datum) || UI.todayISO();
      st.lovId = ''; st.stajaliste = '';
      if (q.lov) { // alter Link „#/odstrjel/novi?lov=…" funktioniert weiter
        var lov = Store.lovovi().filter(function (l) { return l.id === q.lov; })[0];
        if (lov) { st.lovId = lov.id; el.querySelector('#nacinLova').value = 'Prigon/pogon'; if (lov.lokacija) el.querySelector('#lokacija').value = lov.lokacija; el.querySelector('#datum').value = String(lov.datum).slice(0, 10); }
      }
      if (q.vrsta) setSpecies(el, q.vrsta);
    }

    UI.$$('.species-btn', el).forEach(function (b) { b.onclick = function () { setSpecies(el, b.getAttribute('data-sp')); }; });
    UI.$$('input[name=spol], input[name=dobnaKlasa]', el).forEach(function (r) { r.addEventListener('change', function () { updateTrofej(el); }); });
    updateTrofej(el);
    // Schwarzwild: Pflichtbemerkung mit einem Tipp (Wert bleibt Kroatisch, wie alles im Sheet)
    el.querySelector('#napomena-ok').onclick = function () {
      var n = el.querySelector('#napomena');
      if (!n.value.trim()) n.value = I18n._dict.hr.btnNoAnomalies.toLowerCase();
    };

    async function setLoc(pos, acc) {
      st.lat = pos.lat; st.lon = pos.lon; st.acc = acc || null;
      var box = el.querySelector('#loc-result');
      box.innerHTML = '<p class="hint">' + esc(t('loading')) + '</p>';
      var lov = await Geo.lovisteAt(pos.lat, pos.lon);
      if (lov) el.querySelector('#lokacija').value = lov;
      st.zona = await Geo.ortLabel(pos.lat, pos.lon);
      renderLoc(lov);
    }
    function renderLoc(lov) {
      var box = el.querySelector('#loc-result');
      if (!st.lat) { box.innerHTML = ''; return; }
      box.innerHTML = '<div class="loc-result">' + miniMap(st.lat, st.lon) + '<div class="loc-text"><b>' + esc(st.zona || t('locUnnamed')) + '</b>' +
        '<span class="hint">' + esc((lov === '' ? t('gpsOutside') + ' · ' : lov ? Strecke.shortLov(lov) + ' · ' : '') + st.lat + ', ' + st.lon + (st.acc ? ' (±' + st.acc + ' m)' : '')) + '</span>' +
        '<div class="btn-row"><button type="button" class="btn small" id="loc-change">' + esc(t('locChange')) + '</button><button type="button" class="btn small ghost" id="loc-clear">' + esc(t('locClear')) + '</button></div></div></div>';
      box.querySelector('#loc-change').onclick = pickMap;
      box.querySelector('#loc-clear').onclick = function () { st.lat = ''; st.lon = ''; st.zona = ''; st.acc = null; renderLoc(); };
    }
    async function pickMap() {
      var last = st.lat ? { lat: st.lat, lon: st.lon } : ((await DB.get('lastPos')) || null);
      var pos = await MapPicker.open(last);
      if (pos) { await DB.set('lastPos', pos); setLoc(pos); }
    }
    el.querySelector('#loc-map').onclick = pickMap;
    el.querySelector('#loc-gps').onclick = async function () {
      var btn = this; btn.disabled = true;
      el.querySelector('#loc-result').innerHTML = '<p class="hint">' + esc(t('gpsWaiting')) + '</p>';
      try { var p = await Geo.precise(); await setLoc(p, p.acc); }
      catch (e) { el.querySelector('#loc-result').innerHTML = '<p class="hint">' + esc(e && e.code === 1 ? t('gpsDenied') : t('gpsFailed')) + '</p>'; }
      btn.disabled = false;
    };
    if (st.lat) renderLoc(null);

    var foto = el.querySelector('#foto');
    if (foto) foto.onchange = async function (ev) {
      var prev = el.querySelector('#foto-preview');
      prev.innerHTML = ''; st.foto = '';
      try { st.foto = await UI.readPhoto(ev.target.files[0]); if (st.foto) prev.innerHTML = '<img alt="" src="' + st.foto + '">'; } catch (e) {}
      var fb = el.querySelector('#trofej-foto');
      if (fb) fb.innerHTML = ICONS.camera + (st.foto ? '✓ ' : '') + esc(t('lblFoto'));
    };

    el.querySelector('#unos-form').addEventListener('submit', function (ev) { ev.preventDefault(); save(el); });
  }

  function showError(el, msg) {
    var e = el.querySelector('#error-msg');
    e.textContent = msg; e.hidden = false;
    e.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function save(el) {
    el.querySelector('#error-msg').hidden = true;
    var v = function (id) { var x = el.querySelector('#' + id); return x ? x.value.trim() : ''; };
    if (!st.species) return showError(el, t('errSelectVrsta'));
    if (st.species === 'Ostalo' && !v('vrstaOstalo')) return showError(el, t('errOstalo'));
    var spol = el.querySelector('input[name=spol]:checked');
    var klasa = el.querySelector('input[name=dobnaKlasa]:checked');
    var data = {
      vrsta: st.species === 'Ostalo' ? v('vrstaOstalo') : st.species,
      tezina: v('tezina'), spol: spol ? spol.value : '', dobnaKlasa: klasa ? klasa.value : '',
      brojMarkice: v('brojMarkice'), lokacija: v('lokacija'), datum: v('datum'), lovac: v('lovac'),
      napomena: v('napomena'), nacinLova: v('nacinLova'), zona: st.lat ? (st.zona || '') : (st.edit ? st.edit.zona || '' : ''),
      vrijemeOdstrjela: v('vrijemeOdstrjela'),
      lovId: st.lovId || '', stajaliste: st.stajaliste || '',
      lat: st.lat || '', lon: st.lon || ''
    };
    if (data.vrsta === 'Divlja svinja' && !data.napomena) return showError(el, t('errSvinjaNapomena'));
    if (!data.tezina || !data.spol || !data.lokacija || !data.datum || !data.lovac || !data.brojMarkice) return showError(el, t('errRequired'));
    if (!(Number(data.tezina) > 0)) return showError(el, t('errTezina'));
    if (!data.dobnaKlasa && st.species !== 'Ostalo') return showError(el, t('errKlasa'));
    // Geweih: Enden (Rothirsch) bzw. Schaufelstufe (Damhirsch) Pflicht; Gewicht/CIC nur beim Bearbeiten
    readTrofej(el);
    var nacin = trofejNacin(data.vrsta, data.spol, data.dobnaKlasa);
    if (nacin === 'vrhovi') {
      var n = Number(st.rogovlje);
      if (!st.rogovlje || !(n >= 2 && n <= 30) || Math.round(n) !== n) return showError(el, t('errVrhovi'));
      data.rogovlje = String(n);
    } else if (nacin === 'lopata') {
      if (I18n.LOPATA_STUFEN.indexOf(st.rogovlje) === -1) return showError(el, t('errLopata'));
      data.rogovlje = st.rogovlje;
    } else if (st.edit) data.rogovlje = '';
    if (st.edit && !st.edit._new && nacin) { data.trofejMasa = st.masa || ''; data.trofejCic = st.cic || ''; }

    var btn = el.querySelector('#submit-btn');
    btn.disabled = true;
    try {
      if (st.edit) {
        await Store.queueUpsert('odstrjel', Object.assign({ id: st.edit.id }, data, st.foto ? { foto: st.foto } : {}));
        App.syncNow({ quiet: true });
        UI.toast(t('savedChanges'));
        App.go('#/odstrjel');
        return;
      }
      data.id = Store.uuid();
      if (st.foto) data.foto = st.foto;
      await Store.queueSubmit(data);
      var cold = el.querySelector('#cold');
      if (cold && cold.checked) {
        var asp = v('aspUzorak');
        await Store.queueUpsert('wildbret', { id: data.id, hladnjacaOd: UI.nowLocalISO(), aspUzorak: asp, aspNalaz: (asp || data.vrsta === 'Divlja svinja') ? 'ceka' : '' });
      }
      await DB.set('last', { lokacija: data.lokacija, lovac: data.lovac, nacinLova: data.nacinLova, datum: data.datum, lovId: data.lovId, at: Date.now() });
      var local = (await DB.get('lovciLocal')) || [];
      if (local.map(function (n) { return n.toLowerCase(); }).indexOf(data.lovac.toLowerCase()) === -1) { local.push(data.lovac); await DB.set('lovciLocal', local); }
    } catch (e) {
      btn.disabled = false;
      return showError(el, t('errSaveFailed') + ' ' + (e && e.message ? e.message : ''));
    }
    btn.disabled = false;
    showDone(false, [], data);
    if (navigator.onLine) {
      var res = await App.syncNow({ quiet: true });
      if (res && res.sent.indexOf('odstrjel:' + data.id) !== -1) showDone(true, res.warnings, data);
    }
  }

  function showDone(sent, warnings, data) {
    var o = document.getElementById('done');
    document.getElementById('done-icon').innerHTML = ICONS.check.replace('<svg', '<svg class="success-icon"');
    document.getElementById('done-title').textContent = sent ? t('doneSent') : t('doneLocal');
    document.getElementById('done-text').textContent = kategorija(data.vrsta, data.spol, data.dobnaKlasa, I18n.lang()) + ' · ' + data.tezina + ' kg · #' + data.brojMarkice + ' — ' + (sent ? t('doneSentText') : t('doneLocalText'));
    var w = document.getElementById('done-warn');
    w.hidden = !(warnings && warnings.length);
    w.textContent = warnings && warnings.length ? warnings.join(' ') : '';
    o.classList.add('show');
    document.getElementById('done-again').onclick = function () { o.classList.remove('show'); App.render(); };
    document.getElementById('done-close').onclick = function () { o.classList.remove('show'); App.go(data.lovId ? '#/lov/' + data.lovId : '#/odstrjel'); };
  }

  return { render: render, mount: mount, trofejNacin: trofejNacin, trofejHtml: trofejHtml };
})();
