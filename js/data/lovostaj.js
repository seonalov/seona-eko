/**
 * Jagd- und Schonzeiten (lovostaj) nach dem Pravilnik o lovostaju, NN 94/2019, Članak 4.
 * Geprüft am 23.09.2026 gegen narodne-novine.nn.hr (Text 2019_10_94_1848) und zakon.hr
 * (Datenbank bis NN 102/26: keine spätere Änderung, „na snazi").
 *
 * Der Pravilnik nennt SCHONZEITEN. `closed` = [von, bis] als "MM-TT" (kann über den Jahreswechsel
 * laufen). Offen ist der Rest des Jahres. `closed: null` = ohne Schonzeit, `note` = Einschränkung.
 * Nur Arten, die in den drei Lovišta vorkommen bzw. dort bejagt werden.
 *
 * Zusätzlich gilt immer: Wild ohne Schonzeit nur bis zur Zahl im Abschussplan der LGO (Članak 5);
 * für Schwarzwild ggf. ASK-Anordnungen der Veterinärverwaltung (Naredba o mjerama kontrole ASK).
 */
var LOVOSTAJ = {
  izvor: 'Pravilnik o lovostaju (NN 94/2019), čl. 4',
  stanje: '2026-09-23',
  groups: [
    { vrsta: 'Jelen obični', key: 'grpJelen', rows: [
      { key: 'lsJelenM', closed: ['02-16', '08-15'] },
      { key: 'lsKosuta', closed: ['01-16', '08-31'] },
      { key: 'lsTele', closed: ['03-01', '08-31'] }
    ] },
    { vrsta: 'Jelen lopatar', key: 'grpLopatar', rows: [
      { key: 'lsLopatarM', closed: ['02-16', '09-15'] },
      { key: 'lsLopatarZ', closed: ['02-01', '09-30'] },
      { key: 'lsLopatarTele', closed: ['03-01', '09-30'] }
    ] },
    { vrsta: 'Divlja svinja', key: 'grpSvinja', rows: [
      { key: 'lsSvinja', closed: null, note: 'noteBredja' }
    ] },
    { vrsta: 'Srna', key: 'grpSrna', rows: [
      { key: 'lsSrnjak', closed: ['10-01', '04-15'] },
      { key: 'lsSrnaLane', closed: ['02-01', '08-31'] }
    ] },
    { vrsta: 'Muflon', key: 'grpMuflon', rows: [
      { key: 'lsMuflonM', closed: null },
      { key: 'lsMuflonZ', closed: ['01-01', '07-31'] }
    ] },
    { vrsta: 'Ostalo', key: 'grpSitna', rows: [
      { key: 'lsLisica', closed: null, note: 'noteBredjaSitna' },
      { key: 'lsCagalj', closed: null, note: 'noteBredjaSitna' },
      { key: 'lsJazavac', closed: ['01-01', '07-31'] },
      { key: 'lsKunaB', closed: null, note: 'noteBredja' },
      { key: 'lsKunaZ', closed: ['03-01', '10-31'] },
      { key: 'lsZec', closed: ['01-16', '09-30'] }
    ] }
  ]
};

/** Hilfsfunktionen: ist ein Datum ("YYYY-MM-DD") offen, wann öffnet/schließt es? */
var Lovostaj = (function () {
  function md(iso) { return iso.slice(5, 10); }
  function inRange(m, a, b) { return a <= b ? (m >= a && m <= b) : (m >= a || m <= b); }
  function isOpen(row, iso) { return !row.closed || !inRange(md(iso), row.closed[0], row.closed[1]); }
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /** Nächster Wechsel (öffnet/schließt) ab heute: { date, daysLeft } oder null (ganzjährig). */
  function nextChange(row, iso) {
    if (!row.closed) return null;
    var open = isOpen(row, iso);
    for (var i = 1; i <= 366; i++) {
      var d = addDays(iso, i);
      if (isOpen(row, d) !== open) return { date: d, days: i, opens: !open };
    }
    return null;
  }
  /** Offene Abschnitte im Jagdjahr (1.4.–31.3.) als Anteile 0..1 für das Jahresband. */
  function segments(row, jjStartIso) {
    var segs = [], start = null, total = 365;
    for (var i = 0; i <= total; i++) {
      var d = addDays(jjStartIso, i);
      var o = i < total && isOpen(row, d);
      if (o && start === null) start = i;
      if (!o && start !== null) { segs.push([start / total, i / total]); start = null; }
    }
    return segs;
  }
  return { isOpen: isOpen, nextChange: nextChange, segments: segments, addDays: addDays };
})();
