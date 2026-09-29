/**
 * Gästeansicht für die Ansitzjagd (Rolle „gost", nur lesen) + Kontakt-Baustein (auch Team-Ansicht).
 * Oben „Ihr Ansitz heute" (vom Team eingetragen: Abholung, Sitz als Name, Rückkehr, Begleiter), dann Wetter & Wind,
 * Kontakt, heute offene Jagdzeiten (ohne Planzahlen — was geschossen wird, bespricht der Begleiter) und Hinweise
 * für den Ansitz. Der Server liefert Gästen nur Kontakte und die eigenen Ansitz-Termine (keine Koordinaten).
 * Die Drückjagd-Fassung liegt in _archiv/pwa_2026-09-24_gast-drueckjagd/ (kommt in Welle 2 zurück).
 */
var Kontakt = (function () {
  var esc = UI.esc, t = I18n.t;
  function digits(tel) { return String(tel || '').replace(/[^\d]/g, ''); }
  function waUrl(tel) { return 'https://wa.me/' + digits(tel); }
  function telUrl(tel) { return 'tel:+' + digits(tel); }

  /** Große Kontaktknöpfe (erster Kontakt hervorgehoben) + Notruf. */
  function block(list, opts) {
    opts = opts || {};
    var html = (list || []).map(function (k, i) {
      var main = i === 0 && opts.big;
      return '<div class="contact' + (main ? ' main' : '') + '">' +
        '<div class="c-who"><b>' + esc(k.ime) + '</b><span>' + esc(k.uloga || '') + '</span><span class="num">' + esc(k.telefon) + '</span></div>' +
        '<div class="c-actions">' +
        (k.whatsapp ? '<a class="btn ' + (main ? 'wa' : 'small') + '" href="' + esc(waUrl(k.telefon)) + '" target="_blank" rel="noopener">' + ICONS.chat + esc(t('whatsapp')) + '</a>' : '') +
        '<a class="btn ' + (main ? '' : 'small ') + 'ghost" href="' + esc(telUrl(k.telefon)) + '">' + ICONS.phone + esc(t('call')) + '</a>' +
        '</div></div>';
    }).join('');
    if (!html) html = '<p class="hint" style="margin:0">' + esc(t('noContacts')) + '</p>';
    if (opts.emergency) html += '<a class="row emergency" href="tel:112"><span class="r-icon">' + ICONS.alert + '</span><span class="r-main"><span class="r-title">' + esc(t('emergency')) + ' 112</span><span class="r-sub">' + esc(t('emergencySub')) + '</span></span></a>';
    return html;
  }
  return { block: block, waUrl: waUrl, telUrl: telUrl };
})();

var Gost = (function () {
  var esc = UI.esc, t = I18n.t;

  function langSeg() {
    return '<div class="seg" id="g-lang" style="max-width:180px;flex:none">' + ['hr', 'en', 'de'].map(function (l) {
      return '<button type="button" data-lang="' + l + '" aria-pressed="' + (I18n.lang() === l) + '">' + l.toUpperCase() + '</button>';
    }).join('') + '</div>';
  }

  function openToday() {
    var today = UI.todayISO(), out = [];
    LOVOSTAJ.groups.forEach(function (g) {
      if (g.vrsta === 'Ostalo') return;
      g.rows.forEach(function (r) { if (Lovostaj.isOpen(r, today)) out.push({ g: g, r: r }); });
    });
    return out;
  }

  /** Kontakt des Begleiters, falls er in den Kontakten steht (Name gleich oder enthalten). */
  function guideContact(name) {
    var n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return Store.kontakti().filter(function (k) {
      var i = String(k.ime || '').trim().toLowerCase();
      return i && (i === n || n.indexOf(i) !== -1 || i.indexOf(n) !== -1);
    })[0] || null;
  }

  function ansitzCard(a, isToday) {
    var guide = guideContact(a.pratitelj);
    var o = a.orig || {};
    var translated = ['napomena', 'polazak', 'povratak'].some(function (f) { return o[f] && o[f] !== a[f]; });
    var d = String(a.datum).slice(0, 10);
    return '<div class="panel next-hunt">' +
      '<div class="eyebrow-sm">' + esc(isToday ? t('gToday') : UI.fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>' +
      '<dl class="kv big">' +
      (a.polazak ? '<dt>' + esc(t('gPickup')) + '</dt><dd>' + esc(a.polazak) + '</dd>' : '') +
      (a.ceka ? '<dt>' + esc(t('gSeat')) + '</dt><dd>' + esc(a.ceka) + '</dd>' : '') +
      (a.povratak ? '<dt>' + esc(t('gReturn')) + '</dt><dd>' + esc(a.povratak) + '</dd>' : '') +
      (a.pratitelj ? '<dt>' + esc(t('gGuide')) + '</dt><dd>' + esc(a.pratitelj) + '</dd>' : '') + '</dl>' +
      (a.napomena ? '<p style="margin:0 0 10px;white-space:pre-wrap">' + esc(a.napomena) + '</p>' : '') +
      (translated ? '<details class="orig"><summary>' + esc(t('showOriginal')) + '</summary>' +
        [o.polazak, o.povratak, o.napomena].filter(Boolean).map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</details>' : '') +
      (guide && guide.whatsapp ? '<a class="btn wa block" target="_blank" rel="noopener" href="' + esc(Kontakt.waUrl(guide.telefon)) + '">' + ICONS.chat + esc(t('gWriteGuide', { n: guide.ime })) + '</a>' : '') +
      '</div>';
  }

  App.route('gost', {
    nav: 'gost',
    render: function () {
      var today = new Date(), todayIso = UI.todayISO();
      var snap = Store.snapshot() || {};
      var me = App.isGost() ? snap.gost : null;
      var list = App.isGost() ? (snap.ansitzi || []) : [];
      var heute = list.filter(function (a) { return String(a.datum).slice(0, 10) === todayIso; });
      var spaeter = list.filter(function (a) { return String(a.datum).slice(0, 10) > todayIso; });
      var open = openToday();
      var contacts = Store.kontakti().filter(function (k) { return App.isGost() || k.zaGoste; });
      var rest = spaeter.slice(heute.length ? 0 : 1);

      return '<div class="page-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
        '<div><div class="eyebrow">' + esc(UI.fmtLong(today)) + '</div><h1>' + esc(me && me.ime ? t('gWelcomeName', { n: me.ime }) : t('gWelcome')) + '</h1>' +
        '<p>' + WetterUI.sun(today) + '</p></div>' + langSeg() + '</div>' +
        (App.isGost() ? '' : '<p class="hint" style="margin:-4px 0 10px">' + esc(t('guestPreviewNote')) + '</p>') +

        (heute.length ? '<div class="section-title" style="margin-top:4px"><h2>' + esc(t('gYourAnsitz')) + '</h2></div>' + heute.map(function (a) { return ansitzCard(a, true); }).join('')
          : spaeter.length ? '<div class="section-title" style="margin-top:4px"><h2>' + esc(t('gNextAnsitz')) + '</h2></div>' + ansitzCard(spaeter[0], false) : '') +

        WetterUI.tile() +

        '<div class="section-title"><h2>' + esc(t('gContact')) + '</h2></div>' +
        '<div class="panel contact-panel">' + Kontakt.block(contacts, { big: true, emergency: true }) + '</div>' +

        '<div class="section-title"><h2>' + esc(t('gSeasonToday')) + '</h2><a href="#/lovostaj">' + esc(t('allSeasons')) + '</a></div>' +
        '<div class="panel"><div class="chips" style="flex-wrap:wrap">' +
        (open.length ? open.map(function (x) { return '<span class="badge ok">' + esc(t(x.r.key)) + '</span>'; }).join('') : '<span class="hint">' + esc(t('nothingOpen')) + '</span>') +
        '</div><p class="hint" style="margin:10px 0 0">' + esc(t('gSeasonHint')) + '</p></div>' +

        '<div class="section-title"><h2>' + esc(t('gAnsitzRules')) + '</h2></div>' +
        '<div class="panel"><details class="more" style="border:none;margin:0;padding:0"><summary>' + esc(t('gSafetyOpen')) + '</summary>' +
        '<ol class="safety">' + ['gA1', 'gA2', 'gA3', 'gA4', 'gA5', 'gA6'].map(function (k) { return '<li>' + esc(t(k)) + '</li>'; }).join('') + '</ol>' +
        '<p class="hint" style="margin:8px 0 0">' + esc(t('gAnsitzNote')) + '</p></details></div>' +

        (rest.length ? '<div class="section-title"><h2>' + esc(t('gMoreAnsitz')) + '</h2></div><div class="stack">' +
          rest.map(function (a) { return ansitzCard(a, false); }).join('') + '</div>' : '') +

        '<p class="legal" style="margin-top:22px">' + esc(t('gLegalAnsitz')) + '</p>' +
        '<div class="btn-row" style="margin-top:10px"><button type="button" class="btn small ghost" id="g-code">' + esc(t('changeCode')) + '</button></div>';
    },
    mount: function (el) {
      UI.$$('#g-lang button', el).forEach(function (b) { b.onclick = function () { App.setLang(b.getAttribute('data-lang')); }; });
      var c = el.querySelector('#g-code'); if (c) c.onclick = function () { App.openSetup(false); };
      Wetter.refresh();
    }
  });

  return { guideContact: guideContact };
})();
