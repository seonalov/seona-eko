/**
 * QR-Code mit der Handykamera lesen — direkt in der App. Wichtig fürs iPhone: Die installierte App hat einen eigenen
 * Speicher; ein mit der System-Kamera gescannter Link öffnet Safari, nicht die App. Hier liest die App den Code selbst.
 * Erkennung: BarcodeDetector (Android/Chrome), sonst jsQR (vendor/jsqr, erst bei Bedarf geladen, offline im Cache).
 * QrScan.open() liefert den gelesenen Text oder null (abgebrochen / keine Kamera).
 */
var QrScan = (function () {
  var t = I18n.t, esc = UI.esc;

  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = 'vendor/jsqr/jsQR.min.js'; s.onload = ok; s.onerror = fail;
      document.head.appendChild(s);
    });
  }

  function open() {
    return new Promise(async function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'scan';
      ov.setAttribute('role', 'dialog');
      ov.innerHTML = '<video playsinline muted></video><div class="scan-frame"></div>' +
        '<div class="scan-bar"><p id="scan-msg">' + esc(t('scanHint')) + '</p>' +
        '<button type="button" class="btn block" data-cancel>' + esc(t('cancel')) + '</button></div>';
      document.body.appendChild(ov);
      var video = ov.querySelector('video'), msg = ov.querySelector('#scan-msg');
      var stream = null, stop = false;
      function done(v) {
        stop = true;
        if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); });
        ov.remove(); resolve(v);
      }
      ov.querySelector('[data-cancel]').onclick = function () { done(null); };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        msg.textContent = t('scanNoCamera');
        return;
      }
      if (stop) { stream.getTracks().forEach(function (tr) { tr.stop(); }); return; }
      video.srcObject = stream;
      try { await video.play(); } catch (e) {}
      var detector = null;
      try { if ('BarcodeDetector' in window) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {}
      if (!detector) { try { await loadJsQR(); } catch (e) { msg.textContent = t('scanNoCamera'); return; } }
      var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
      async function tick() {
        if (stop) return;
        if (video.readyState >= 2 && video.videoWidth) {
          var text = null;
          try {
            if (detector) {
              var r = await detector.detect(video);
              if (r && r[0]) text = r[0].rawValue;
            } else {
              // verkleinert lesen — schneller, reicht für einen QR im Bild
              var sc = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
              canvas.width = Math.round(video.videoWidth * sc); canvas.height = Math.round(video.videoHeight * sc);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              var q = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
              if (q) text = q.data;
            }
          } catch (e) {}
          if (text) {
            if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
            return done(text);
          }
        }
        setTimeout(tick, 180);
      }
      tick();
    });
  }

  /** Start-Link aus dem QR zerlegen: …#/start?c=<Code>&l=<Sprache>[&g=<Gast-ID>][&r=uprava] → { c, l, g, r } oder null. */
  function parseStart(text) {
    var m = String(text || '').match(/#\/start\?(.*)$/);
    if (!m) return null;
    var q = {};
    m[1].split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i < 1) return;
      try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {}
    });
    return q.c ? q : null;
  }

  return { open: open, parseStart: parseStart };
})();
