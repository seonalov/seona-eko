/**
 * Kurze Einführung für das Team (nicht für Gäste): jede Funktion eine Karte, in der gewählten Sprache.
 * Erscheint einmal nach der ersten Anmeldung mit Team-Code, jederzeit überspringbar, erneut über Više → „Kratki vodič".
 * Die Karte sitzt über der unteren Navigation; der passende Menüpunkt (bzw. die Sync-Anzeige) wird hervorgehoben.
 */
var Tutorial = (function () {
  var esc = UI.esc, t = I18n.t;
  // [Symbol, Schlüssel der Texte (tut_<key>_t / tut_<key>_x), hervorzuhebendes Element]
  var STEPS = [
    ['logo', 'welcome', null],
    ['home', 'home', '#bottomnav [data-nav="home"]'],
    ['plus', 'unos', '#bottomnav [data-nav="home"]'],
    ['list', 'strecke', '#bottomnav [data-nav="odstrjel"]'],
    ['map', 'karta', '#bottomnav [data-nav="karta"]'],
    ['group', 'lovovi', '#bottomnav [data-nav="lovovi"]'],
    ['cold', 'cold', '#bottomnav [data-nav="vise"]'],
    ['qr', 'gosti', '#bottomnav [data-nav="vise"]'],
    ['sync', 'sync', '#sync-pill'],
    ['more', 'vise', '#bottomnav [data-nav="vise"]'],
    ['check', 'end', null]
  ];

  var el = null, i = 0;

  function icon(k) {
    if (k === 'logo') return '<img src="icons/icon-192.png" alt="">';
    return ICONS[k] || '';
  }

  function highlight(sel) {
    UI.$$('.tut-focus').forEach(function (x) { x.classList.remove('tut-focus'); });
    var target = sel ? document.querySelector(sel) : null;
    if (target) target.classList.add('tut-focus');
  }

  function draw() {
    var s = STEPS[i], last = i === STEPS.length - 1;
    el.innerHTML = '<div class="tut-card" role="dialog" aria-modal="true" aria-labelledby="tut-title">' +
      '<div class="tut-top"><span class="tut-count">' + (i + 1) + ' / ' + STEPS.length + '</span>' +
      (last ? '' : '<button type="button" class="tut-skip" data-skip>' + esc(t('tutSkip')) + '</button>') + '</div>' +
      '<div class="tut-icon">' + icon(s[0]) + '</div>' +
      '<h2 id="tut-title">' + esc(t('tut_' + s[1] + '_t')) + '</h2>' +
      '<p>' + esc(t('tut_' + s[1] + '_x')) + '</p>' +
      '<div class="tut-dots">' + STEPS.map(function (_, k) { return '<i' + (k === i ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
      '<div class="btn-row">' + (i ? '<button type="button" class="btn" data-back>' + esc(t('back')) + '</button>' : '') +
      '<button type="button" class="btn primary" data-next>' + esc(last ? t('tutStart') : t('tutNext')) + '</button></div></div>';
    highlight(s[2]);
    var skip = el.querySelector('[data-skip]'); if (skip) skip.onclick = close;
    var back = el.querySelector('[data-back]'); if (back) back.onclick = function () { i--; draw(); };
    el.querySelector('[data-next]').onclick = function () { if (last) close(); else { i++; draw(); } };
    el.querySelector('[data-next]').focus();
  }

  function open() {
    if (el) return;
    i = 0;
    el = document.createElement('div');
    el.className = 'tut-scrim';
    document.body.appendChild(el);
    document.body.classList.add('tut-open');
    draw();
  }

  async function close() {
    highlight(null);
    document.body.classList.remove('tut-open');
    if (el) { el.remove(); el = null; }
    await DB.set('tutorialDone', Date.now());
  }

  /** Einmal automatisch zeigen: nur Team, nur wenn noch nicht gesehen und gerade keine Einrichtung offen ist. */
  async function maybeShow() {
    if (!App.isUprava() || el) return;
    if (await DB.get('tutorialDone')) return;
    if (document.getElementById('setup').classList.contains('show')) return;
    App.go('#/home');
    open();
  }

  return { open: open, maybeShow: maybeShow, steps: function () { return STEPS.map(function (s) { return s[1]; }); } };
})();
