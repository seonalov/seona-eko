/**
 * Hladnjača & ASK — jedes Stück durchläuft feste Stationen, jede mit Datum und „wer" (Server: updatedBy):
 *   eingelagert → ASK-Probe genommen (Nr.) → Probe abgeschickt (Datum, Labor) → Befund (Datum) → entnommen
 * Reiter „U hladnjači" (Stücke, Tage, nächster Schritt) und „ASK uzorci" (nicht verschickt · unterwegs · Befund da)
 * mit Sammelaktionen. Entnahme: Schwarzwild ohne negativen Befund → Warnung mit Bestätigung; positiv → nur
 * unschädliche Beseitigung (prüft auch der Server).
 * Frist: Großwild binnen 7 Tagen zum zugelassenen Betrieb (VO (EG) 853/2004 Anh. III Abschn. IV).
 */
(function () {
  var esc = UI.esc, t = I18n.t;
  var state = { tab: 'zelle', sel: {} };
  var BIG_GAME = ['Jelen obični', 'Jelen lopatar', 'Divlja svinja', 'Srna', 'Muflon'];

  function days(iso) { return UI.daysSince(String(iso || '').slice(0, 10)); }
  function needsAsp(w, r) { return !!(w.aspUzorak || (r && r.vrsta === 'Divlja svinja')); }
  function hasResult(w) { return w.aspNalaz === 'negativan' || w.aspNalaz === 'pozitivan'; }

  /** Stand eines Stücks und nächster Schritt. */
  function stage(w, r) {
    if (w.predanoDatum) return { key: 'out', next: null };
    if (!needsAsp(w, r)) return { key: 'noAsp', next: 'out' };
    if (!w.aspUzorak) return { key: 'noSample', next: 'sample' };
    if (!w.aspPoslano) return { key: 'notSent', next: 'send' };
    if (!hasResult(w)) return { key: 'sent', next: 'result' };
    return { key: 'result', next: 'out' };
  }

  function steps(w, r) {
    var asp = needsAsp(w, r);
    var list = [['in', true], ['sample', !!w.aspUzorak, !asp], ['send', !!w.aspPoslano, !asp], ['result', hasResult(w), !asp], ['out', !!w.predanoDatum]];
    return '<span class="steps" aria-hidden="true">' + list.map(function (s) {
      return '<i class="' + (s[2] ? 'skip' : s[1] ? 'done' : '') + (s[0] === 'result' && w.aspNalaz === 'pozitivan' ? ' bad' : '') + '"></i>';
    }).join('') + '</span>';
  }

  function aspBadge(w) {
    if (w.aspNalaz === 'negativan') return '<span class="badge ok">' + esc(t('aspShort')) + ' ' + esc(I18n.nalaz('negativan')) + '</span>';
    if (w.aspNalaz === 'pozitivan') return '<span class="badge warn">' + esc(t('aspShort')) + ' ' + esc(I18n.nalaz('pozitivan')) + '</span>';
    if (w.aspPoslano) return '<span class="badge muted">' + esc(t('aspSentDays', { n: days(w.aspPoslano) })) + '</span>';
    if (w.aspUzorak) return '<span class="badge muted">' + esc(t('aspNotSent')) + '</span>';
    return '';
  }

  function data() {
    var wb = Store.wildbret(), byId = {};
    Store.strecke().forEach(function (r) { byId[r.id] = r; });
    var all = Object.keys(wb).map(function (k) { return wb[k]; });
    var inCold = all.filter(function (w) { return w.hladnjacaOd && !w.predanoDatum; })
      .sort(function (a, b) { return String(a.hladnjacaOd).localeCompare(String(b.hladnjacaOd)); });
    var out = all.filter(function (w) { return w.predanoDatum; })
      .sort(function (a, b) { return String(b.predanoDatum).localeCompare(String(a.predanoDatum)); }).slice(0, 15);
    var without = Store.strecke().filter(function (r) { return !wb[r.id] && UI.daysSince(r.datum) <= 10 && BIG_GAME.indexOf(r.vrsta) !== -1; });
    var asp = { noSample: [], notSent: [], sent: [], result: [] };
    all.forEach(function (w) {
      var r = byId[w.id];
      if (!needsAsp(w, r)) return;
      var st = stage(w, r).key;
      if (st === 'out') { if (hasResult(w) && days(w.aspNalazDatum || w.predanoDatum) <= 30) asp.result.push(w); return; }
      if (asp[st]) asp[st].push(w);
    });
    return { byId: byId, inCold: inCold, out: out, without: without, asp: asp };
  }

  function title(r) { return r ? Strecke.title(r) + ' · ' + r.tezina + ' kg' : t('unknownPiece'); }
  function sub(w, r) { return (r ? '#' + r.brojMarkice + ' · ' + Strecke.shortLov(r.lokacija) + ' · ' : '') + t('sinceDate', { d: UI.fmtDate(String(w.hladnjacaOd).slice(0, 10)) }); }

  function rowCold(w, r) {
    var d = days(w.hladnjacaOd), st = stage(w, r);
    return '<li><button type="button" class="row" data-wb="' + esc(w.id) + '"><span class="r-icon">' + ICONS.forSpecies(r ? r.vrsta : '') + '</span>' +
      '<span class="r-main"><span class="r-title">' + esc(title(r)) + '</span><span class="r-sub">' + esc(sub(w, r)) + '</span>' +
      '<span class="step-line">' + steps(w, r) + '<span class="next">' + esc(st.next ? t('next_' + st.next) : '') + '</span></span></span>' +
      '<span class="r-end"><b class="num" style="' + (d >= 7 ? 'color:var(--warn)' : '') + '">' + (d == null ? '—' : d) + '</b>' + esc(t('daysShort')) + '</span></button></li>';
  }

  function rowSel(w, r, group) {
    var checked = !!state.sel[w.id];
    return '<li><label class="row" style="cursor:pointer"><input type="checkbox" data-sel="' + esc(w.id) + '" data-group="' + group + '"' + (checked ? ' checked' : '') + ' style="width:22px;height:22px;flex:none">' +
      '<span class="r-main"><span class="r-title">' + esc(t('sampleNo') + ' ' + (w.aspUzorak || '—')) + '</span>' +
      '<span class="r-sub">' + esc(title(r) + (r ? ' · #' + r.brojMarkice : '')) + '</span></span>' +
      '<span class="r-end">' + aspBadge(w) + (w.aspLab ? '<span style="display:block;margin-top:3px">' + esc(w.aspLab) + '</span>' : '') + '</span></label></li>';
  }

  function renderZelle(D) {
    var old = D.inCold.filter(function (w) { return days(w.hladnjacaOd) >= 7; }).length;
    var pos = D.inCold.filter(function (w) { return w.aspNalaz === 'pozitivan'; }).length;
    return (pos ? '<div class="panel alert-panel"><b>' + esc(t('aspPositiveTitle')) + '</b><p class="hint">' + esc(t('aspPositiveText')) + '</p></div>' : '') +
      (old ? '<div class="panel alert-panel soft"><b>' + esc(t('coldOld', { n: old })) + '</b><p class="hint">' + esc(t('coldOldHint')) + '</p></div>' : '') +
      (D.inCold.length ? '<div class="panel flush"><ul class="list">' + D.inCold.map(function (w) { return rowCold(w, D.byId[w.id]); }).join('') + '</ul></div>'
        : '<div class="panel">' + UI.emptyState('cold', t('coldEmpty'), t('coldEmptyText')) + '</div>') +
      '<p class="hint steps-legend">' + steps({ aspUzorak: 1, aspPoslano: 1, aspNalaz: 'negativan', predanoDatum: 1 }, { vrsta: 'Divlja svinja' }) + ' ' + esc(t('stepsLegend')) + '</p>' +
      (D.without.length ? '<div class="section-title"><h2>' + esc(t('notInCold')) + '</h2></div><div class="panel flush"><ul class="list">' +
        D.without.map(function (r) {
          return '<li><div class="row"><span class="r-icon">' + ICONS.forSpecies(r.vrsta) + '</span><span class="r-main"><span class="r-title">' + esc(Strecke.title(r) + ' · ' + r.tezina + ' kg') + '</span>' +
            '<span class="r-sub">' + esc('#' + r.brojMarkice + ' · ' + UI.fmtDay(r.datum)) + '</span></span>' +
            '<button type="button" class="btn small" data-put="' + esc(r.id) + '">' + esc(t('putInCold')) + '</button></div></li>';
        }).join('') + '</ul></div>' : '') +
      (D.out.length ? '<div class="section-title"><h2>' + esc(t('outTitle')) + '</h2></div><div class="panel flush"><ul class="list">' +
        D.out.map(function (w) {
          var r = D.byId[w.id];
          return '<li><button type="button" class="row" data-wb="' + esc(w.id) + '"><span class="r-icon">' + ICONS.forSpecies(r ? r.vrsta : '') + '</span><span class="r-main"><span class="r-title">' + esc(title(r)) + '</span>' +
            '<span class="r-sub">' + esc(UI.fmtDate(w.predanoDatum) + ' · ' + (w.izlaz ? t('izlaz_' + w.izlaz) : '') + (w.kupac ? ' · ' + w.kupac : '')) + '</span></span></button></li>';
        }).join('') + '</ul></div>' : '');
  }

  function group(key, list, D, action) {
    var n = list.filter(function (w) { return state.sel[w.id]; }).length;
    return '<div class="section-title"><h2>' + esc(t('aspGroup_' + key)) + ' <span class="hint">(' + list.length + ')</span></h2>' +
      (action && list.length ? '<button type="button" class="link" data-all="' + key + '">' + esc(t('selectAll')) + '</button>' : '') + '</div>' +
      (list.length ? '<div class="panel flush"><ul class="list">' + list.map(function (w) {
        var r = D.byId[w.id];
        return action ? rowSel(w, r, key) : '<li><button type="button" class="row" data-wb="' + esc(w.id) + '"><span class="r-main"><span class="r-title">' + esc(t('sampleNo') + ' ' + (w.aspUzorak || '—')) + '</span>' +
          '<span class="r-sub">' + esc(title(r) + (w.aspNalazDatum ? ' · ' + UI.fmtDate(w.aspNalazDatum) : '')) + '</span></span><span class="r-end">' + aspBadge(w) + '</span></button></li>';
      }).join('') + '</ul></div>' +
        (action ? '<button type="button" class="btn dark block" style="margin-top:10px" data-batch="' + key + '"' + (n ? '' : ' disabled') + '>' + esc(t('batch_' + key, { n: n })) + '</button>' : '')
        : '<div class="panel"><p class="hint" style="margin:0">' + esc(t('aspGroupEmpty')) + '</p></div>');
  }

  function renderAsp(D) {
    var A = D.asp;
    return '<p class="hint" style="margin:0 0 4px">' + esc(t('aspFlowHint')) + '</p>' +
      (A.noSample.length ? '<div class="section-title"><h2>' + esc(t('aspGroup_noSample')) + ' <span class="hint">(' + A.noSample.length + ')</span></h2></div><div class="panel flush"><ul class="list">' +
        A.noSample.map(function (w) { return rowCold(w, D.byId[w.id]); }).join('') + '</ul></div>' : '') +
      group('notSent', A.notSent, D, true) + group('sent', A.sent, D, true) + group('result', A.result, D, false);
  }

  App.route('hladnjaca', {
    nav: 'vise',
    render: function (ctx) {
      if (ctx.query.tab) state.tab = ctx.query.tab;
      var D = data();
      var waiting = D.asp.notSent.length + D.asp.noSample.length, sent = D.asp.sent.length;
      return '<div class="page-head"><div class="eyebrow">' + esc(t('wildbret')) + '</div><h1>' + esc(t('coldTitle', { n: D.inCold.length })) + '</h1>' +
        '<p>' + esc(t('aspSummary', { a: waiting, b: sent })) + '</p></div>' +
        '<div class="seg" id="cold-tabs" style="margin-bottom:12px">' +
        '<button type="button" data-tab="zelle" aria-pressed="' + (state.tab === 'zelle') + '">' + esc(t('tabCold')) + '</button>' +
        '<button type="button" data-tab="asp" aria-pressed="' + (state.tab === 'asp') + '">' + esc(t('tabAsp')) + (waiting + sent ? ' · ' + (waiting + sent) : '') + '</button></div>' +
        (state.tab === 'asp' ? renderAsp(D) : renderZelle(D)) +
        '<p class="source">' + esc(t('coldSource')) + '</p>';
    },
    mount: function (el) {
      UI.$$('#cold-tabs button', el).forEach(function (b) { b.onclick = function () { state.tab = b.getAttribute('data-tab'); state.sel = {}; App.render(true); }; });
      UI.$$('[data-put]', el).forEach(function (b) {
        b.onclick = async function () {
          var r = Store.strecke().filter(function (x) { return x.id === b.getAttribute('data-put'); })[0];
          await Store.queueUpsert('wildbret', { id: r.id, hladnjacaOd: UI.nowLocalISO() });
          App.syncNow({ quiet: true });
        };
      });
      UI.$$('[data-wb]', el).forEach(function (b) { b.onclick = function () { openDetail(b.getAttribute('data-wb')); }; });
      UI.$$('[data-sel]', el).forEach(function (c) {
        c.onchange = function () { if (c.checked) state.sel[c.getAttribute('data-sel')] = c.getAttribute('data-group'); else delete state.sel[c.getAttribute('data-sel')]; App.render(true); };
      });
      UI.$$('[data-all]', el).forEach(function (b) {
        b.onclick = function () { var g = b.getAttribute('data-all'); data().asp[g].forEach(function (w) { state.sel[w.id] = g; }); App.render(true); };
      });
      UI.$$('[data-batch]', el).forEach(function (b) {
        b.onclick = function () {
          var g = b.getAttribute('data-batch');
          var ids = Object.keys(state.sel).filter(function (k) { return state.sel[k] === g; });
          if (g === 'notSent') openSend(ids); else openResult(ids);
        };
      });
    }
  });

  /* ---------------- Schritte ---------------- */

  function openSample(w) {
    UI.openSheet('<h2>' + esc(t('next_sample')) + '</h2><form id="f"><div class="field"><label class="field-label req" for="nr">' + esc(t('lblAspUzorak')) + '</label>' +
      '<input type="text" id="nr" value="' + esc(w.aspUzorak || '') + '" placeholder="' + esc(t('phAspUzorak')) + '"></div>' +
      '<button type="submit" class="btn primary block">' + esc(t('btnSave')) + '</button></form>', function (el, api) {
      el.querySelector('#f').onsubmit = async function (ev) {
        ev.preventDefault();
        var nr = el.querySelector('#nr').value.trim(); if (!nr) return;
        await Store.queueUpsert('wildbret', { id: w.id, aspUzorak: nr, aspNalaz: 'ceka' });
        api.close(); App.syncNow({ quiet: true });
      };
    });
  }

  function openSend(ids) {
    UI.openSheet('<h2>' + esc(t('batch_notSent', { n: ids.length })) + '</h2><form id="f">' +
      '<div class="grid-2"><div class="field"><label class="field-label req" for="d">' + esc(t('sentOn')) + '</label><input type="date" id="d" value="' + UI.todayISO() + '"></div>' +
      '<div class="field"><label class="field-label" for="lab">' + esc(t('lab')) + '</label><input type="text" id="lab" list="labs" placeholder="' + esc(t('phLab')) + '"><datalist id="labs"></datalist></div></div>' +
      '<button type="submit" class="btn primary block">' + esc(t('btnSave')) + '</button></form>', async function (el, api) {
      var last = (await DB.get('lastLab')) || '';
      el.querySelector('#lab').value = last;
      el.querySelector('#f').onsubmit = async function (ev) {
        ev.preventDefault();
        var d = el.querySelector('#d').value, lab = el.querySelector('#lab').value.trim();
        if (!d) return;
        await DB.set('lastLab', lab);
        for (var i = 0; i < ids.length; i++) await Store.queueUpsert('wildbret', { id: ids[i], aspPoslano: d, aspLab: lab, aspNalaz: 'ceka' });
        state.sel = {}; api.close(); App.syncNow({ quiet: true });
        UI.toast(t('savedN', { n: ids.length }));
      };
    });
  }

  function openResult(ids) {
    var wb = Store.wildbret();
    var st = {}; ids.forEach(function (id) { st[id] = 'negativan'; });
    UI.openSheet('<h2>' + esc(t('batch_sent', { n: ids.length })) + '</h2><p class="sheet-sub">' + esc(t('resultHint')) + '</p><form id="f">' +
      '<div class="field"><label class="field-label req" for="d">' + esc(t('resultOn')) + '</label><input type="date" id="d" value="' + UI.todayISO() + '"></div>' +
      '<div class="panel flush" style="margin-bottom:14px"><ul class="list">' + ids.map(function (id) {
        return '<li><div class="row"><span class="r-main"><span class="r-title">' + esc(t('sampleNo') + ' ' + (wb[id] && wb[id].aspUzorak || '—')) + '</span></span>' +
          '<span class="seg" data-res="' + esc(id) + '" style="flex:none"><button type="button" data-v="negativan" aria-pressed="true">' + esc(I18n.nalaz('negativan')) + '</button>' +
          '<button type="button" data-v="pozitivan" aria-pressed="false">' + esc(I18n.nalaz('pozitivan')) + '</button></span></div></li>';
      }).join('') + '</ul></div>' +
      '<p class="error-msg" id="pos-warn" hidden>' + esc(t('aspPositiveText')) + '</p>' +
      '<button type="submit" class="btn primary block">' + esc(t('btnSave')) + '</button></form>', function (el, api) {
      UI.$$('[data-res]', el).forEach(function (s) {
        UI.$$('button', s).forEach(function (b) {
          b.onclick = function () {
            st[s.getAttribute('data-res')] = b.getAttribute('data-v');
            UI.$$('button', s).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            el.querySelector('#pos-warn').hidden = !Object.keys(st).some(function (k) { return st[k] === 'pozitivan'; });
          };
        });
      });
      el.querySelector('#f').onsubmit = async function (ev) {
        ev.preventDefault();
        var d = el.querySelector('#d').value; if (!d) return;
        for (var i = 0; i < ids.length; i++) await Store.queueUpsert('wildbret', { id: ids[i], aspNalaz: st[ids[i]], aspNalazDatum: d });
        state.sel = {}; api.close(); App.syncNow({ quiet: true });
        UI.toast(t('savedN', { n: ids.length }));
      };
    });
  }

  function openOut(w, r) {
    var svinja = r && r.vrsta === 'Divlja svinja';
    var pos = w.aspNalaz === 'pozitivan';
    var risky = svinja && w.aspNalaz !== 'negativan' && !pos;
    var izlaz = pos ? 'uklanjanje' : 'kupac';
    UI.openSheet('<h2>' + esc(t('next_out')) + '</h2><p class="sheet-sub">' + esc(title(r)) + '</p>' +
      (pos ? '<div class="panel alert-panel"><b>' + esc(t('aspPositiveTitle')) + '</b><p class="hint">' + esc(t('outOnlyDisposal')) + '</p></div>' : '') +
      (risky ? '<div class="panel alert-panel soft"><b>' + esc(t('outNoResultTitle')) + '</b><p class="hint">' + esc(t('outNoResultText')) + '</p>' +
        '<label style="display:flex;gap:10px;align-items:center;margin-top:8px;font-weight:600"><input type="checkbox" id="ok" style="width:22px;height:22px">' + esc(t('outConfirm')) + '</label></div>' : '') +
      '<form id="f"><div class="field"><span class="field-label">' + esc(t('izlazKind')) + '</span><div class="seg" id="iz">' +
      ['kupac', 'vlastito', 'uklanjanje'].map(function (k) {
        return '<button type="button" data-v="' + k + '" aria-pressed="' + (izlaz === k) + '"' + (pos && k !== 'uklanjanje' ? ' disabled' : '') + '>' + esc(t('izlaz_' + k)) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="grid-2"><div class="field"><label class="field-label req" for="d">' + esc(t('outOn')) + '</label><input type="date" id="d" value="' + UI.todayISO() + '"></div>' +
      '<div class="field"><label class="field-label" for="k">' + esc(t('kupac')) + '</label><input type="text" id="k" value="' + esc(w.kupac || '') + '"></div></div>' +
      '<div class="error-msg" id="err" hidden></div>' +
      '<button type="submit" class="btn primary block">' + esc(t('next_out')) + '</button></form>', function (el, api) {
      UI.$$('#iz button', el).forEach(function (b) {
        b.onclick = function () { izlaz = b.getAttribute('data-v'); UI.$$('#iz button', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); };
      });
      el.querySelector('#f').onsubmit = async function (ev) {
        ev.preventDefault();
        var err = el.querySelector('#err');
        if (risky && !el.querySelector('#ok').checked) { err.textContent = t('outConfirmNeeded'); err.hidden = false; return; }
        var d = el.querySelector('#d').value; if (!d) return;
        await Store.queueUpsert('wildbret', { id: w.id, predanoDatum: d, izlaz: izlaz, kupac: el.querySelector('#k').value.trim() });
        api.close(); App.syncNow({ quiet: true });
      };
    });
  }

  function openDetail(id) {
    var w = Store.wildbret()[id];
    var r = Store.strecke().filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    var st = stage(w, r);
    var kv = [
      [t('step_in'), UI.fmtDate(String(w.hladnjacaOd).slice(0, 10)) + ' (' + days(w.hladnjacaOd) + ' ' + t('daysShort') + ')'],
      [t('step_sample'), w.aspUzorak], [t('step_send'), w.aspPoslano ? UI.fmtDate(w.aspPoslano) + (w.aspLab ? ' · ' + w.aspLab : '') : ''],
      [t('step_result'), hasResult(w) ? I18n.nalaz(w.aspNalaz) + (w.aspNalazDatum ? ' · ' + UI.fmtDate(w.aspNalazDatum) : '') : ''],
      [t('trich'), w.trihinela ? I18n.nalaz(w.trihinela) : ''],
      [t('step_out'), w.predanoDatum ? UI.fmtDate(w.predanoDatum) + ' · ' + (w.izlaz ? t('izlaz_' + w.izlaz) : '') + (w.kupac ? ' · ' + w.kupac : '') : ''],
      [t('lastChange'), (w.updatedBy || '') + (w.updatedAt ? ' · ' + UI.fmtStamp(Number(w.updatedAt)) : '')]
    ].filter(function (x) { return x[1]; });
    UI.openSheet('<h2>' + esc(title(r)) + '</h2><p class="sheet-sub">' + esc(r ? '#' + r.brojMarkice + ' · ' + UI.fmtDay(r.datum) : '') + '</p>' +
      '<div style="margin:0 0 10px">' + steps(w, r) + '</div>' +
      '<dl class="kv">' + kv.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
      (st.next ? '<button type="button" class="btn primary block" data-next>' + esc(t('next_' + st.next)) + '</button>' : '') +
      '<details class="more"><summary>' + esc(t('editData')) + '</summary>' +
      '<form id="wb-edit" novalidate>' +
      '<div class="grid-2"><div class="field"><label class="field-label" for="e-nr">' + esc(t('lblAspUzorak')) + '</label><input type="text" id="e-nr" value="' + esc(w.aspUzorak || '') + '"></div>' +
      '<div class="field"><label class="field-label" for="e-tr">' + esc(t('trich')) + '</label><select id="e-tr">' + ['', 'ceka', 'negativan', 'pozitivan'].map(function (v) { return '<option value="' + v + '"' + ((w.trihinela || '') === v ? ' selected' : '') + '>' + esc(v ? I18n.nalaz(v) : '—') + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label class="field-label" for="e-nap">' + esc(t('lblNapomena')) + '</label><textarea id="e-nap">' + esc(w.napomena || '') + '</textarea></div>' +
      '<button type="submit" class="btn block">' + esc(t('btnSave')) + '</button></form></details>', function (el, api) {
      var nx = el.querySelector('[data-next]');
      if (nx) nx.onclick = function () {
        api.close();
        setTimeout(function () {
          if (st.next === 'sample') openSample(w);
          else if (st.next === 'send') openSend([w.id]);
          else if (st.next === 'result') openResult([w.id]);
          else openOut(w, r);
        }, 240);
      };
      el.querySelector('#wb-edit').onsubmit = async function (ev) {
        ev.preventDefault();
        await Store.queueUpsert('wildbret', { id: w.id, aspUzorak: el.querySelector('#e-nr').value.trim(), trihinela: el.querySelector('#e-tr').value, napomena: el.querySelector('#e-nap').value.trim() });
        api.close(); App.syncNow({ quiet: true });
      };
    }, { noFocus: true });
  }

  window.Hladnjaca = { stage: stage, data: data };
})();
