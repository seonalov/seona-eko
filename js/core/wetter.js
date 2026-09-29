/**
 * Wetter & Wind über die eigene Schnittstelle (Code.gs::wetter_ holt MET Norway, CC BY 4.0, kommerziell erlaubt,
 * mit Kennung und 30-min-Zwischenspeicher) + Mondphase (offline berechnet).
 * Letzter Stand liegt in kv('wetter') — offline wird er mit Uhrzeit angezeigt. Abruf höchstens alle 30 min.
 */
var Wetter = (function () {
  var CENTER = { lat: 45.452, lon: 17.957 }; // Mitte der drei Lovišta (map/meta.json)
  var MAX_AGE = 30 * 60 * 1000;
  var data = null, loading = null, listeners = [];

  async function load() { data = (await DB.get('wetter')) || null; return data; }

  function refresh(force) {
    if (loading) return loading;
    if (!force && data && Date.now() - data.at < MAX_AGE) return Promise.resolve(data);
    if (!navigator.onLine) return Promise.resolve(data);
    loading = DB.get('code').then(function (code) {
      if (!code) throw new Error('kein Code');
      return API.call('wetter', code, null, 30000);
    })
      .then(async function (j) {
        if (!j || !j.current) throw new Error('keine Daten');
        data = { at: j.at || Date.now(), current: j.current, hourly: j.hourly };
        await DB.set('wetter', data);
        listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
        return data;
      })
      .catch(function () { return data; })
      .finally(function () { loading = null; });
    return loading;
  }

  /** Stunden ab jetzt (max n) als Objekte. */
  function hours(n) {
    if (!data || !data.hourly) return [];
    var h = data.hourly, out = [];
    var now = new Date(); now.setMinutes(0, 0, 0);
    for (var i = 0; i < h.time.length && out.length < (n || 24); i++) {
      var t = new Date(h.time[i]);
      if (t < now) continue;
      out.push({ time: t, temp: h.temperature_2m[i], wind: h.wind_speed_10m[i], dir: h.wind_direction_10m[i],
        gust: h.wind_gusts_10m ? h.wind_gusts_10m[i] : null, mm: h.precipitation ? h.precipitation[i] : null, code: h.weather_code[i] });
    }
    return out;
  }

  /** Windrichtung (woher der Wind kommt, meteorologisch) → Kurzname der Himmelsrichtung. */
  var DIRS = { hr: ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ'], en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] };
  function dirName(deg, lang) { return (DIRS[lang] || DIRS.en)[Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }

  /** Wettersymbol (MET: „partlycloudy_day", „lightrain" …; älter: WMO-Zahl) → eigene Symbol-/Textschlüssel. */
  function kind(code) {
    if (typeof code === 'string') {
      var c = code.replace(/_(day|night|polartwilight)$/, '');
      if (/thunder/.test(c)) return 'storm';
      if (/snow|sleet/.test(c)) return 'snow';
      if (/rain|showers/.test(c)) return 'rain';
      if (c === 'fog') return 'fog';
      if (c === 'clearsky') return 'clear';
      if (c === 'fair' || c === 'partlycloudy') return 'partly';
      return 'cloudy';
    }
    if (code === 0) return 'clear';
    if (code <= 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloudy';
  }

  /** Mondphase: Alter im synodischen Monat (Referenz Neumond 2000-01-06 18:14 UTC). */
  function moon(date) {
    var SYN = 29.530588853;
    var ref = Date.UTC(2000, 0, 6, 18, 14);
    var age = (((date.getTime() - ref) / 864e5) % SYN + SYN) % SYN;
    var illum = Math.round((1 - Math.cos(2 * Math.PI * age / SYN)) / 2 * 100);
    var phase = age < 1.85 ? 'new' : age < 5.54 ? 'waxCres' : age < 9.23 ? 'firstQ' : age < 12.92 ? 'waxGib' :
      age < 16.61 ? 'full' : age < 20.30 ? 'wanGib' : age < 23.99 ? 'lastQ' : age < 27.68 ? 'wanCres' : 'new';
    return { age: age, illum: illum, phase: phase, waxing: age < SYN / 2 };
  }

  return {
    load: load, refresh: refresh, hours: hours, dirName: dirName, kind: kind, moon: moon,
    current: function () { return data && data.current; },
    at: function () { return data ? data.at : 0; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
