/** GPS, Lage in Revier/Waldabteilung, Sonnenauf-/-untergang (offline berechnet). */
var Geo = (function () {
  var cache = {};

  function loadGeo(name) {
    if (!cache[name]) {
      cache[name] = fetch('map/' + name + '.geojson').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) { delete cache[name]; throw e; });
    }
    return cache[name];
  }

  function position(timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(new Error('nogps'));
      navigator.geolocation.getCurrentPosition(function (p) {
        resolve({ lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) });
      }, function (err) { reject(err); }, { enableHighAccuracy: true, timeout: timeoutMs || 20000, maximumAge: 30000 });
    });
  }

  function inRing(x, y, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function inGeometry(lon, lat, g) {
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.some(function (p) {
      if (!inRing(lon, lat, p[0])) return false;
      for (var h = 1; h < p.length; h++) if (inRing(lon, lat, p[h])) return false;
      return true;
    });
  }
  async function featureAt(name, lat, lon) {
    try {
      var fc = await loadGeo(name);
      for (var i = 0; i < fc.features.length; i++) {
        if (inGeometry(lon, lat, fc.features[i].geometry)) return fc.features[i];
      }
    } catch (e) {}
    return null;
  }
  async function lovisteAt(lat, lon) {
    var f = await featureAt('reviere', lat, lon);
    return f ? f.properties['lovište'] : '';
  }
  function odjelAt(lat, lon) { return featureAt('odjeli', lat, lon); }

  /** Entfernung in Metern (Haversine). */
  function dist(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, R = 6371000;
    var dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /** Nächster Flurname (QField-Ebene geografische_namen) innerhalb maxM Metern, sonst null. */
  async function nameNear(lat, lon, maxM) {
    try {
      var fc = await loadGeo('namen'), best = null, bd = Infinity;
      fc.features.forEach(function (f) {
        var c = f.geometry.coordinates, d = dist(lat, lon, c[1], c[0]);
        if (d < bd) { bd = d; best = f; }
      });
      return best && bd <= (maxM || 1500) ? { name: best.properties.name, m: Math.round(bd) } : null;
    } catch (e) { return null; }
  }

  /** Lesbare Ortsangabe für das Sheet, z. B. „Odjel 12b · Strmac" (Abteilung + nächster Flurname). */
  async function ortLabel(lat, lon) {
    var parts = [];
    var o = await odjelAt(lat, lon);
    if (o && o.properties.odjel) parts.push(('Odjel ' + o.properties.odjel + String(o.properties.odsjek || '').trim()).trim());
    var n = await nameNear(lat, lon, 1500);
    if (n) parts.push(n.name);
    return parts.join(' · ');
  }

  /** Sonnenauf-/-untergang nach NOAA (Genauigkeit ~1 min), lokale Zeit des Geräts. */
  function sunTimes(date, lat, lon) {
    var rad = Math.PI / 180;
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    var start = new Date(d.getFullYear(), 0, 0);
    var N = Math.floor((d - start) / 864e5);
    function calc(rising) {
      var lngHour = lon / 15;
      var t = N + ((rising ? 6 : 18) - lngHour) / 24;
      var M = 0.9856 * t - 3.289;
      var L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
      var RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
      RA = (RA + 360) % 360;
      RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
      var sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
      var cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;
      var H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
      var T = H + RA - 0.06571 * t - 6.622;
      var UT = ((T - lngHour) % 24 + 24) % 24;
      var out = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
      out.setUTCMinutes(Math.round(UT * 60));
      return out;
    }
    return { rise: calc(true), set: calc(false) };
  }

  return { loadGeo: loadGeo, position: position, inGeometry: inGeometry, lovisteAt: lovisteAt, odjelAt: odjelAt, nameNear: nameNear, ortLabel: ortLabel, dist: dist, sunTimes: sunTimes };
})();
