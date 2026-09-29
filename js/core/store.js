/**
 * Datenstand der App = letzter Abruf vom Server ("pull", in kv gespeichert) + noch wartende
 * Änderungen aus der Outbox darübergelegt. So ist alles, was offline erfasst wurde, sofort in
 * Listen, Statistik und Karte sichtbar — als "čeka slanje" markiert.
 */
var Store = (function () {
  var snap = null;        // { strecke, objekti, lovovi, wildbret, lovci, lovista, jagdjahr…, at }
  var outbox = [];
  var listeners = [];
  var pulling = null;

  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  async function load() {
    snap = (await DB.get('pull')) || null;
    outbox = await DB.outboxAll();
    emit();
  }

  async function reloadOutbox() {
    outbox = await DB.outboxAll();
    emit();
  }

  /** Holt alles vom Server. Gibt 'ok' | 'offline' | 'auth' | 'config' | 'error' zurück. */
  function refresh() {
    if (pulling) return pulling;
    pulling = (async function () {
      var code = await DB.get('code');
      if (!code) return 'auth';
      if (!navigator.onLine) return 'offline';
      try {
        var res = await API.call('pull', code, { gostId: (await DB.get('gostId')) || '', lang: I18n.lang() }, 45000);
        res.at = Date.now();
        delete res.ok;
        snap = res;
        await DB.set('pull', res);
        if (res.role) await DB.set('role', res.role);
        emit();
        return 'ok';
      } catch (err) {
        return err.kind === 'network' ? 'offline' : err.kind || 'error';
      }
    })().finally(function () { pulling = null; });
    return pulling;
  }

  function pendingOf(entity) {
    return outbox.filter(function (e) { return e.entity === entity && e.kind === 'upsert'; });
  }

  function mergeById(base, entity) {
    var map = {};
    (base || []).forEach(function (r) { map[r.id] = Object.assign({}, r); });
    pendingOf(entity).forEach(function (e) {
      var d = e.data;
      map[d.id] = Object.assign({}, map[d.id] || {}, d, { _pending: true, _error: e.status === 'error' ? e.error : '' });
      if (d.fotoNew) map[d.id]._fotoLocal = d.fotoNew;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (r) { return !r.deleted; });
  }

  function strecke() {
    var list = mergeById(snap && snap.strecke, 'odstrjel');
    // noch nicht gesendete neue Abschüsse
    outbox.filter(function (e) { return e.kind === 'submit'; }).forEach(function (e) {
      if (list.some(function (r) { return r.id === e.data.id; })) return;
      list.push(Object.assign({}, e.data, { _pending: true, _new: true, _error: e.status === 'error' ? e.error : '', imaFoto: !!e.data.foto, _fotoLocal: e.data.foto || '' }));
    });
    // Stornierte Abschüsse zählen nirgends mehr (der Server liefert sie gar nicht erst aus)
    return list.filter(function (r) { return !r.storno; })
      .sort(function (a, b) { return (b.datum || '').localeCompare(a.datum || '') || String(b.vrijeme || '').localeCompare(String(a.vrijeme || '')); });
  }

  /** IDs von Abschüssen mit wartender Stornierung — deren Kühlzellen-Eintrag wird ausgeblendet. */
  function stornoPending() {
    var ids = {};
    pendingOf('odstrjel').forEach(function (e) { if (e.data.storno) ids[e.data.id] = true; });
    return ids;
  }

  function jagdjahr() {
    if (snap && snap.jagdjahrStart) return { start: snap.jagdjahrStart, end: snap.jagdjahrEnd, label: snap.jagdjahr };
    var d = new Date(), y = d.getFullYear(), s = d.getMonth() >= 3 ? y : y - 1;
    return { start: s + '-04-01', end: (s + 1) + '-03-31', label: s + '/' + String(s + 1).slice(2) };
  }

  /** Neuer Abschuss → Outbox (kind 'submit'). */
  async function queueSubmit(data) {
    var entry = { key: 'odstrjel:' + data.id, kind: 'submit', entity: 'odstrjel', data: data, createdAt: Date.now(), status: 'pending' };
    await DB.outboxPut(entry);
    await reloadOutbox();
    return entry;
  }

  /** Anlegen/Ändern → Outbox (kind 'upsert'); mehrere Änderungen am selben Datensatz fallen zusammen. */
  async function queueUpsert(entity, data) {
    data = Object.assign({}, data, { updatedAt: Date.now() });
    var key = entity + ':' + data.id;
    var prev = outbox.filter(function (e) { return e.key === key; })[0];
    if (prev && prev.kind === 'submit') {
      // Abschuss noch gar nicht gesendet → direkt im wartenden Eintrag ändern
      prev.data = Object.assign({}, prev.data, data);
      delete prev.data.updatedAt;
      prev.status = 'pending'; prev.error = '';
      await DB.outboxPut(prev);
    } else {
      var merged = prev ? Object.assign({}, prev.data, data) : data;
      await DB.outboxPut({ key: key, kind: 'upsert', entity: entity, data: merged, createdAt: prev ? prev.createdAt : Date.now(), status: 'pending' });
    }
    await reloadOutbox();
  }

  async function discard(key) {
    await DB.outboxDelete(key);
    await reloadOutbox();
  }

  return {
    load: load,
    refresh: refresh,
    reloadOutbox: reloadOutbox,
    onChange: function (fn) { listeners.push(fn); },
    uuid: uuid,
    snapshot: function () { return snap; },
    outbox: function () { return outbox.slice(); },
    strecke: strecke,
    objekti: function () { return mergeById(snap && snap.objekti, 'objekt'); },
    lovovi: function () {
      return mergeById(snap && snap.lovovi, 'lov').sort(function (a, b) { return String(a.datum).localeCompare(String(b.datum)); });
    },
    wildbret: function () {
      var map = {}, storno = stornoPending();
      mergeById(snap && snap.wildbret, 'wildbret').forEach(function (w) { if (!storno[w.id]) map[w.id] = w; });
      return map;
    },
    lovci: function () { return (snap && snap.lovci) || []; },
    kontakti: function () { return (snap && snap.kontakti) || []; },
    gosti: function () { return mergeById(snap && snap.gosti, 'gost').sort(function (a, b) { return String(a.od).localeCompare(String(b.od)); }); },
    ansitzi: function () { return mergeById(snap && snap.ansitzi, 'ansitz'); },
    gostCode: function () { return (snap && snap.gostCode) || ''; },
    /** Gäste: Summen je Lovište/Art/Klasse/Geschlecht (keine Einzelabschüsse). */
    gostCounts: function () { return (snap && snap.counts) || []; },
    lovista: function () { return (snap && snap.lovista && snap.lovista.length) ? snap.lovista : ['XIV/189 Gazije', 'XIV/191 Gornja Motičina', 'XIV/192 Klanac']; },
    quota: function () { return (snap && snap.quotaPerLoviste) || { 'Jelen obični': 8, 'Srna': 4, 'Divlja svinja': 30, 'Jelen lopatar': 9 }; },
    jagdjahr: jagdjahr,
    pulledAt: function () { return snap ? snap.at : 0; },
    queueSubmit: queueSubmit,
    queueUpsert: queueUpsert,
    discard: discard
  };
})();
