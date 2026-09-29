/**
 * Sendet die Outbox der Reihe nach (Fotos machen Einzel-Requests robuster als einen Stapel).
 *
 * Outbox-Eintrag: { key, kind: 'submit'|'upsert', entity, data, createdAt, status, error }
 *  - submit: neuer Abschuss (append-only, Server erkennt Dubletten an data.id)
 *  - upsert: Einrichtung, Drückjagd, Wildbret, Korrektur — key = entity + ':' + data.id, damit
 *            mehrere Änderungen am selben Datensatz zu einer zusammenfallen
 *
 * Ein Eintrag wird nur gelöscht, wenn der Server ok:true meldet.
 *  - Netzfehler:  Abbruch, alle restlichen bleiben liegen (nächster Versuch später)
 *  - Auth-Fehler: Abbruch, App fordert neuen Code an
 *  - abgelehnt / keine Berechtigung: Eintrag bekommt Fehlertext, die übrigen gehen weiter
 *  - "stale": Server hatte einen neueren Stand — der gewinnt, Eintrag gilt als erledigt
 */
var Sync = (function () {
  var running = null;
  var listeners = [];

  function notify(state) {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  function run() {
    if (running) return running;
    running = (async function () {
      var result = { sent: [], warnings: [], stale: [], networkError: false, authError: false, configError: false };
      var code = await DB.get('code');
      if (!code) { result.authError = true; return result; }
      var device = (await DB.get('device')) || '';

      var list = await DB.outboxAll();
      notify({ syncing: true });
      for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        try {
          var hasPhoto = !!(entry.data && (entry.data.foto || entry.data.fotoNew));
          var res;
          if (entry.kind === 'submit') {
            res = await API.call('submit', code, Object.assign({}, entry.data, { uredjaj: device }), hasPhoto ? 90000 : 30000);
          } else {
            res = await API.call('upsert', code, { entity: entry.entity, data: entry.data, uredjaj: device }, hasPhoto ? 90000 : 30000);
          }
          await DB.outboxDelete(entry.key);
          result.sent.push(entry.key);
          if (res.warning) result.warnings.push(res.warning);
          if (res.stale) result.stale.push(entry.key);
        } catch (err) {
          if (err.kind === 'network') { result.networkError = true; break; }
          if (err.kind === 'auth') { result.authError = true; break; }
          if (err.kind === 'config') { result.configError = true; break; }
          entry.status = 'error';
          entry.error = err.message || 'Greška';
          await DB.outboxPut(entry);
        }
      }
      if (result.sent.length) await DB.set('lastSync', Date.now());
      return result;
    })().finally(function () {
      running = null;
      notify({ syncing: false });
    });
    return running;
  }

  return {
    run: run,
    isRunning: function () { return !!running; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
