/**
 * Skupni lovovi (Drückjagden): Liste, Detail mit Strecke der Jagd, Stände auf der Karte.
 * Anlegen/Ändern nur Verwaltung (Server prüft). Strecke = Abschüsse mit lovId.
 */
(function () {
  var esc = UI.esc, t = I18n.t;

  function lovById(id) { return Store.lovovi().filter(function (l) { return l.id === id; })[0]; }
  function streckeOf(id) { return Store.strecke().filter(function (r) { return r.lovId === id; }); }
  function dateBlock(iso) {
    var d = UI.parseISO(String(iso).slice(0, 10));
    return '<span class="r-icon" style="flex-direction:column;background:var(--forest-2);color:var(--accent-ink);width:44px;height:44px;line-height:1">' +
      '<b style="font-family:var(--font-display);font-weight:500;font-size:1.1rem">' + (d ? d.getDate() : '') + '</b>' +
      '<small style="font-size:.6rem;text-transform:uppercase;letter-spacing:.05em">' + (d ? esc(d.toLocaleDateString(I18n.locale(), { month: 'short' })) : '') + '</small></span>';
  }
  function lovRow(l) {
    var n = streckeOf(l.id).length;
    return '<li><a class="row" href="#/lov/' + esc(l.id) + '">' + dateBlock(l.datum) +
      '<span class="r-main"><span class="r-title">' + esc(l.naziv || t('lovDefaultName')) + '</span>' +
      '<span class="r-sub">' + esc(UI.fmtDay(String(l.datum).slice(0, 10)) + ' · ' + Strecke.shortLov(l.lokacija) + (l.vodja ? ' · ' + l.vodja : '')) + '</span></span>' +
      '<span class="r-end">' + (n ? '<b>' + n + '</b>' + esc(t('pieces')) : (l._pending ? '<span class="badge muted">' + esc(t('stPending')) + '</span>' : '')) + '</span></a></li>';
  }

  App.route('lovovi', {
    nav: 'lovovi',
    render: function () {
      var today = UI.todayISO();
      var all = Store.lovovi();
      var up = all.filter(function (l) { return String(l.datum).slice(0, 10) >= today; });
      var past = all.filter(function (l) { return String(l.datum).slice(0, 10) < today; }).reverse();
      var next = up[0];
      return '<div class="page-head"><div class="eyebrow">' + esc(t('huntYear')) + ' ' + esc(Store.jagdjahr().label) + '</div>' +
        '<h1>' + esc(t('lovoviTitle')) + '</h1>' +
        '<p>' + esc(next ? t('lovoviNext', { d: UI.fmtDay(String(next.datum).slice(0, 10)), l: Strecke.shortLov(next.lokacija) }) : t('noNextLov')) + '</p></div>' +
        (App.isUprava() ? '<button type="button" class="btn primary block" id="new-lov" style="margin-bottom:14px">' + ICONS.plus + esc(t('newLov')) + '</button>' : '') +
        (all.length ? '' : '<div class="panel">' + UI.emptyState('group', t('emptyLovTitle'), App.isUprava() ? t('emptyLovUprava') : t('emptyLovLovac')) + '</div>') +
        (up.length ? '<div class="section-title"><h2>' + esc(t('upcoming')) + '</h2></div><div class="panel flush"><ul class="list">' + up.map(lovRow).join('') + '</ul></div>' : '') +
        (past.length ? '<div class="section-title"><h2>' + esc(t('past')) + '</h2></div><div class="panel flush"><ul class="list">' + past.map(lovRow).join('') + '</ul></div>' : '');
    },
    mount: function (el, ctx) {
      var b = el.querySelector('#new-lov');
      if (b) b.onclick = function () { openForm(null); };
      if (ctx.query.new && App.isUprava()) openForm(null);
    }
  });

  App.route('lov', {
    nav: 'lovovi',
    render: function (ctx) {
      var l = lovById(decodeURIComponent(ctx.params[0] || ''));
      if (!l) return '<div class="page-head"><h1>' + esc(t('notFound')) + '</h1></div><a class="btn" href="#/lovovi">' + esc(t('back')) + '</a>';
      var s = streckeOf(l.id);
      var bySpecies = {};
      s.forEach(function (r) {
        var k = Strecke.title(r);
        bySpecies[r.vrsta] = bySpecies[r.vrsta] || { n: 0, kg: 0, kat: {} };
        bySpecies[r.vrsta].n++; bySpecies[r.vrsta].kg += Number(r.tezina) || 0;
        bySpecies[r.vrsta].kat[k] = (bySpecies[r.vrsta].kat[k] || 0) + 1;
      });
      var stands = Store.objekti().filter(function (o) { return Array.isArray(l.stajalista) && l.stajalista.indexOf(o.id) !== -1; });
      var kg = s.reduce(function (a, r) { return a + (Number(r.tezina) || 0); }, 0);
      var sudionici = String(l.sudionici || '').split(/\n|,/).map(function (x) { return x.trim(); }).filter(Boolean);
      var isPast = String(l.datum).slice(0, 10) <= UI.todayISO();
      return '<div class="page-head"><div class="eyebrow"><a href="#/lovovi" style="color:inherit">' + esc(t('lovoviTitle')) + '</a> · ' + esc(Strecke.shortLov(l.lokacija)) + '</div>' +
        '<h1>' + esc(l.naziv || t('lovDefaultName')) + '</h1>' +
        '<p>' + esc(UI.fmtDate(String(l.datum).slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + (l.vodja ? ' · ' + esc(t('lblVodja')) + ': ' + esc(l.vodja) : '') + '</p></div>' +
        (isPast || s.length ? '<a class="btn primary block" href="#/odstrjel/novi?lov=' + encodeURIComponent(l.id) + '" style="margin-bottom:12px">' + ICONS.plus + esc(t('addToLov')) + '</a>' : '') +
        '<div class="grid-2"><div class="tile"><div class="t-label">' + ICONS.list + esc(t('tileStrecke')) + '</div><div class="t-value">' + s.length + '</div><div class="t-sub num">' + Math.round(kg) + ' kg</div></div>' +
        '<div class="tile"><div class="t-label">' + ICONS.pin + esc(t('stands')) + '</div><div class="t-value">' + stands.length + '</div><div class="t-sub">' + esc(sudionici.length ? t('participantsN', { n: sudionici.length }) : '—') + '</div></div></div>' +
        (s.length ? '<div class="section-title"><h2>' + esc(t('lovStrecke')) + '</h2></div><div class="panel stack">' +
          Object.keys(bySpecies).map(function (v) {
            var b = bySpecies[v];
            return '<div><div style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(I18n.species(v)) + '</b><span class="num">' + b.n + ' · ' + Math.round(b.kg) + ' kg</span></div>' +
              '<div class="hint" style="margin-top:2px">' + Object.keys(b.kat).map(function (k) { return esc(k) + ' ' + b.kat[k]; }).join(' · ') + '</div></div>';
          }).join('') + '</div>' +
          '<div class="panel flush" style="margin-top:12px"><ul class="list">' + s.map(Strecke.rowHtml).join('') + '</ul></div>' : '') +
        '<div class="section-title"><h2>' + esc(t('stands')) + '</h2>' + (stands.length ? '<a href="#/karta?lov=' + encodeURIComponent(l.id) + '">' + esc(t('onMap')) + '</a>' : '') + '</div>' +
        (stands.length ? '<div class="panel flush"><ul class="list">' + stands.map(function (o) {
          return '<li><button type="button" class="row" data-obj="' + esc(o.id) + '"><span class="r-icon"><img alt="" src="' + ICONS.objekt[o.art] + '"></span><span class="r-main"><span class="r-title">' + esc(Objekti.name(o)) + '</span><span class="r-sub">' + esc(I18n.stanje(o.stanje)) + '</span></span></button></li>';
        }).join('') + '</ul></div>' : '<div class="panel"><p class="hint" style="margin:0">' + esc(t('noStands')) + '</p></div>') +
        (sudionici.length ? '<div class="section-title"><h2>' + esc(t('participants')) + '</h2></div><div class="panel"><div class="chips" style="flex-wrap:wrap">' + sudionici.map(function (p) { return '<span class="badge plain muted">' + esc(p) + '</span>'; }).join('') + '</div></div>' : '') +
        '<div class="section-title"><h2>' + esc(t('gMeeting')) + '</h2>' + (App.isUprava() ? '<a href="#/karta?meet=' + encodeURIComponent(l.id) + '">' + esc(l.sastanakLat ? t('onMap') : t('meetSet')) + '</a>' : '') + '</div>' +
        '<div class="panel"><p style="margin:0">' + esc(l.sastanak || t('meetNone')) + '</p>' +
        (l.napomenaGost ? '<p class="hint" style="margin:8px 0 0;white-space:pre-wrap"><b>' + esc(t('lblNapomenaGost')) + ':</b> ' + esc(l.napomenaGost) + '</p>' : '') + '</div>' +
        (l.napomena ? '<div class="section-title"><h2>' + esc(t('lblNapomenaIntern')) + '</h2></div><div class="panel"><p style="margin:0;white-space:pre-wrap">' + esc(l.napomena) + '</p></div>' : '') +
        (App.isUprava() ? '<div class="btn-row" style="margin-top:16px"><button type="button" class="btn" id="edit-lov">' + ICONS.edit + esc(t('edit')) + '</button><button type="button" class="btn danger" id="del-lov">' + ICONS.trash + esc(t('delete')) + '</button></div>' : '');
    },
    mount: function (el, ctx) {
      var l = lovById(decodeURIComponent(ctx.params[0] || ''));
      if (!l) return;
      UI.$$('.row[data-id]', el).forEach(function (b) { b.onclick = function () { Strecke.openDetail(b.getAttribute('data-id')); }; });
      UI.$$('.row[data-obj]', el).forEach(function (b) { b.onclick = function () { Objekti.openDetail(b.getAttribute('data-obj')); }; });
      var e = el.querySelector('#edit-lov'); if (e) e.onclick = function () { openForm(l); };
      var d = el.querySelector('#del-lov'); if (d) d.onclick = async function () {
        if (await UI.confirm(t('delete'), t('confirmDeleteLov'), t('delete'), true)) {
          await Store.queueUpsert('lov', { id: l.id, deleted: true });
          App.syncNow({ quiet: true });
          App.go('#/lovovi');
        }
      };
    }
  });

  function openForm(l) {
    var lovci = Store.lovci();
    var sel = l && Array.isArray(l.stajalista) ? l.stajalista.slice() : [];
    var html = '<h2>' + esc(l ? t('editLov') : t('newLov')) + '</h2><form id="lov-form" novalidate>' +
      '<div class="grid-2"><div class="field"><label class="field-label req" for="lov-datum">' + esc(t('lblDatum')) + '</label><input type="date" id="lov-datum" value="' + esc(l ? String(l.datum).slice(0, 10) : '') + '"></div>' +
      '<div class="field"><label class="field-label" for="lov-lok">' + esc(t('lblLoviste')) + '</label><select id="lov-lok">' +
      Store.lovista().map(function (x) { return '<option' + (l && l.lokacija === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label class="field-label" for="lov-naziv">' + esc(t('lblLovNaziv')) + '</label><input type="text" id="lov-naziv" value="' + esc(l ? l.naziv : '') + '" placeholder="' + esc(t('phLovNaziv')) + '"></div>' +
      '<div class="field"><label class="field-label" for="lov-vodja">' + esc(t('lblVodja')) + '</label><input type="text" id="lov-vodja" list="lov-lovci" value="' + esc(l ? l.vodja : '') + '"><datalist id="lov-lovci">' + lovci.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><span class="field-label">' + esc(t('stands')) + '</span><div id="stand-list" class="panel flush" style="max-height:240px;overflow:auto"></div><p class="hint">' + esc(t('standsHint')) + '</p></div>' +
      '<div class="field"><label class="field-label" for="lov-sud">' + esc(t('participants')) + '</label><textarea id="lov-sud" placeholder="' + esc(t('phParticipants')) + '">' + esc(l ? l.sudionici : '') + '</textarea></div>' +
      '<div class="field"><label class="field-label" for="lov-sast">' + esc(t('gMeeting')) + '</label><input type="text" id="lov-sast" value="' + esc(l ? l.sastanak : '') + '" placeholder="' + esc(t('phMeeting')) + '"><p class="hint">' + esc(t('meetFormHint')) + '</p></div>' +
      '<div class="field"><label class="field-label" for="lov-gnap">' + esc(t('lblNapomenaGost')) + '</label><textarea id="lov-gnap" placeholder="' + esc(t('phNapomenaGost')) + '">' + esc(l ? l.napomenaGost : '') + '</textarea></div>' +
      '<div class="field"><label class="field-label" for="lov-nap">' + esc(t('lblNapomenaIntern')) + '</label><textarea id="lov-nap">' + esc(l ? l.napomena : '') + '</textarea></div>' +
      '<div class="error-msg" id="lov-err" hidden></div>' +
      '<button type="submit" class="btn primary block">' + esc(t('btnSave')) + '</button></form>';
    UI.openSheet(html, function (el, api) {
      function drawStands() {
        var lok = el.querySelector('#lov-lok').value;
        var list = Store.objekti().filter(function (o) { return o.stanje !== 'uklonjen' && (o.lokacija === lok || sel.indexOf(o.id) !== -1) && ['drueckjagdbock', 'kanzel', 'leiter', 'bodensitz'].indexOf(o.art) !== -1; });
        el.querySelector('#stand-list').innerHTML = list.length ? '<ul class="list">' + list.map(function (o) {
          return '<li><label class="row" style="cursor:pointer"><input type="checkbox" value="' + esc(o.id) + '"' + (sel.indexOf(o.id) !== -1 ? ' checked' : '') + ' style="width:22px;height:22px">' +
            '<span class="r-icon"><img alt="" src="' + ICONS.objekt[o.art] + '"></span><span class="r-main"><span class="r-title">' + esc(Objekti.name(o)) + '</span></span></label></li>';
        }).join('') + '</ul>' : '<p class="hint" style="padding:12px 16px;margin:0">' + esc(t('noStandsInGround')) + '</p>';
        UI.$$('input[type=checkbox]', el.querySelector('#stand-list')).forEach(function (c) {
          c.onchange = function () { var i = sel.indexOf(c.value); if (c.checked && i === -1) sel.push(c.value); if (!c.checked && i !== -1) sel.splice(i, 1); };
        });
      }
      drawStands();
      el.querySelector('#lov-lok').onchange = drawStands;
      el.querySelector('#lov-form').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var datum = el.querySelector('#lov-datum').value;
        if (!datum) { var er = el.querySelector('#lov-err'); er.textContent = t('errLovDatum'); er.hidden = false; return; }
        var rec = { id: l ? l.id : Store.uuid(), datum: datum, lokacija: el.querySelector('#lov-lok').value,
          naziv: el.querySelector('#lov-naziv').value.trim(), vodja: el.querySelector('#lov-vodja').value.trim(),
          stajalista: sel.slice(), sudionici: el.querySelector('#lov-sud').value.trim(), napomena: el.querySelector('#lov-nap').value.trim(),
          sastanak: el.querySelector('#lov-sast').value.trim(), napomenaGost: el.querySelector('#lov-gnap').value.trim() };
        await Store.queueUpsert('lov', rec);
        api.close();
        App.syncNow({ quiet: true });
        App.go('#/lov/' + rec.id);
      });
    });
  }
})();
