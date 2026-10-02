/**
 * Abschussplan je Lovište aus der LGO Gornja Motičina XIV-191 (30_LGO/). Alle drei LGOs sind
 * inhaltlich gleich (CLAUDE.md) → Gesamtbetrieb = × 3, kein Flächenfaktor.
 * Deckt sich mit Sheet_Vorlage_Struktur.md (Tab Plan-Izvršenje) und Code.gs::QUOTA_PER_LOVISTE.
 * Klassen = Werte der Spalte „Dobna klasa" im Sheet; `m`/`z` = Soll männlich/weiblich, wo die LGO sie trennt.
 * Die App erfasst nur noch jung · Jährling · älter; Mittel- und reife Klasse der LGO sind deshalb zu „älter" zusammengefasst.
 */
var PLAN = {
  'Jelen obični': [
    { klase: ['Tele/prase'], soll: 2, m: 1, z: 1 },
    { klase: ['Mlađa klasa'], soll: 2, m: 1, z: 1 },
    { klase: ['Srednja klasa', 'Zrela klasa'], soll: 4, m: 2, z: 2 }
  ],
  'Srna': [
    { klase: ['Mlađa klasa'], soll: 2, m: 1, z: 1 },
    { klase: ['Zrela klasa'], soll: 2, m: 1, z: 1 }
  ],
  'Divlja svinja': [
    { klase: ['Tele/prase'], soll: 23, m: 11, z: 12 },
    { klase: ['Mlađa klasa', 'Srednja klasa'], soll: 5 },
    { klase: ['Zrela klasa'], soll: 2 }
  ],
  'Jelen lopatar': [
    { klase: ['Tele/prase'], soll: 3 },
    { klase: ['Mlađa klasa'], soll: 2 },
    { klase: ['Srednja klasa', 'Zrela klasa'], soll: 4 }
  ]
};
var PLAN_SPECIES = ['Divlja svinja', 'Jelen obični', 'Jelen lopatar', 'Srna'];

/**
 * Jägersprachliche Bezeichnung aus Wildart + Geschlecht + Altersklasse, in der Anzeigesprache.
 * (Im Sheet steht alles Kroatisch; Spalte P „Kategorija" leitet über den Tab Kategorije dieselben kroatischen Namen ab.)
 */
var KATEGORIJA = {
  'Jelen obični': {
    'Tele/prase': { m: ['muško tele', 'stag calf', 'Hirschkalb'], z: ['žensko tele', 'hind calf', 'Wildkalb'] },
    'Mlađa klasa': { m: ['mladi jelen (šilaš)', 'young stag', 'Schmalspießer'], z: ['junica', 'yearling hind', 'Schmaltier'] },
    '*': { m: ['jelen', 'stag', 'Hirsch'], z: ['košuta', 'hind', 'Alttier'] }
  },
  'Jelen lopatar': {
    'Tele/prase': { m: ['muško tele', 'buck fawn', 'Hirschkalb'], z: ['žensko tele', 'doe fawn', 'Wildkalb'] },
    'Mlađa klasa': { m: ['mladi jelen (šilaš)', 'pricket', 'Schmalspießer'], z: ['junica', 'yearling doe', 'Schmaltier'] },
    '*': { m: ['jelen lopatar', 'fallow buck', 'Schaufler'], z: ['košuta', 'fallow doe', 'Tier'] }
  },
  'Srna': {
    'Tele/prase': { m: ['muško lane', 'buck fawn', 'Bockkitz'], z: ['žensko lane', 'doe fawn', 'Geißkitz'] },
    'Mlađa klasa': { m: ['mladi srnjak', 'yearling buck', 'Jährling'], z: ['mlada srna', 'yearling doe', 'Schmalreh'] },
    '*': { m: ['srnjak', 'roebuck', 'Bock'], z: ['srna', 'roe doe', 'Geiß'] }
  },
  'Divlja svinja': {
    'Tele/prase': { m: ['prase', 'piglet', 'Frischling'], z: ['prase', 'piglet', 'Frischling'] },
    'Mlađa klasa': { m: ['nazimac', 'yearling boar', 'Überläufer'], z: ['nazimica', 'yearling sow', 'Überläuferbache'] },
    'Srednja klasa': { m: ['nazimac', 'yearling boar', 'Überläufer'], z: ['nazimica', 'yearling sow', 'Überläuferbache'] },
    'Zrela klasa': { m: ['vepar', 'boar', 'Keiler'], z: ['krmača', 'sow', 'Bache'] },
    '*': { m: ['vepar', 'boar', 'Keiler'], z: ['krmača', 'sow', 'Bache'] }
  },
  'Muflon': {
    'Tele/prase': { m: ['janje', 'lamb', 'Lamm'], z: ['janje', 'lamb', 'Lamm'] },
    'Mlađa klasa': { m: ['mladi muflon', 'young ram', 'Jährling'], z: ['mlada muflonka', 'young ewe', 'Jährling'] },
    '*': { m: ['muflon', 'ram', 'Widder'], z: ['muflonka', 'ewe', 'Schaf'] }
  }
};
function kategorija(vrsta, spol, klasa, lang) {
  var li = { hr: 0, en: 1, de: 2 }[lang] || 0;
  var s = spol === 'ž' ? 'z' : 'm';
  var tab = KATEGORIJA[vrsta];
  if (!tab) return vrsta;
  var entry = (klasa && tab[klasa]) || tab['*'];
  return entry && entry[s] ? entry[s][li] : vrsta;
}
