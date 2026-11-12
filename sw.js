/*
 * Umzug der Revier-App (Seona Eko) nach https://seona-eko.github.io/seona-eko/ (November 2026).
 * Dieser Hintergrunddienst ersetzt den alten: er löscht den Zwischenspeicher der alten App,
 * meldet sich ab und lädt offene Fenster neu — dann erscheint die Umzugsseite.
 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try { var keys = await caches.keys(); await Promise.all(keys.map(function (k) { return caches.delete(k); })); } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try {
      var list = await self.clients.matchAll({ type: 'window' });
      list.forEach(function (c) { try { c.navigate(self.registration.scope); } catch (e) {} });
    } catch (e) {}
  })());
});
