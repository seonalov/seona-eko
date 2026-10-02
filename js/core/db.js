/**
 * Kleiner IndexedDB-Wrapper (keine Library).
 *  - "outbox": noch nicht ans Sheet gesendete Änderungen (keyPath "key")
 *  - "kv":     Einstellungen und Cache (Code, Rolle, letzter Datenstand, letzte Werte …)
 * IndexedDB statt localStorage, weil die Outbox Fotos (einige 100 kB je Stück) enthalten kann.
 */
var DB = (function () {
  var DB_NAME = 'seona-eko';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var result;
        var req = fn(t.objectStore(store));
        if (req) req.onsuccess = function () { result = req.result; };
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  return {
    get: function (key) { return tx('kv', 'readonly', function (s) { return s.get(key); }); },
    set: function (key, value) { return tx('kv', 'readwrite', function (s) { return s.put(value, key); }); },

    outboxAll: function () {
      return tx('outbox', 'readonly', function (s) { return s.getAll(); }).then(function (list) {
        return (list || []).sort(function (a, b) { return a.createdAt - b.createdAt; });
      });
    },
    outboxGet: function (key) { return tx('outbox', 'readonly', function (s) { return s.get(key); }); },
    outboxPut: function (entry) { return tx('outbox', 'readwrite', function (s) { return s.put(entry); }); },
    outboxDelete: function (key) { return tx('outbox', 'readwrite', function (s) { return s.delete(key); }); }
  };
})();
