/* =========================================================
   ads.js — Kelompok terpusat semua konfigurasi & loader iklan
   Dipakai bareng di index.html & redirect.html
   ========================================================= */

// Unit iklan banner kotak biasa (Adsterra atOptions) — non-responsif,
// dipakai apa adanya di redirect.html.
const AD_UNITS = {
  redirectBanner: {
    key: 'e601e978833d27fdd075154804a18e49',
    format: 'iframe',
    height: 250,
    width: 300
  }
};

// Unit-unit iklan RESPONSIF (ukuran beda di HP vs desktop), dikelompokkan
// per penempatan. "feedTop" = banner di atas feed (bawah chip kategori),
// "sticky" = banner nempel di bawah layar.
// CATATAN: key 728x90 dipakai bareng di 2 penempatan (feedTop & sticky)
// karena Adsterra cuma kasih 1 zona per ukuran per situs — makanya
// pemuatannya WAJIB berurutan (lihat onDone di pemanggilnya di index.html),
// bukan bersamaan, supaya atOptions (variabel global) nggak rebutan.
const RESPONSIVE_UNITS = {
  feedTop: {
    mobile:  { key: 'e601e978833d27fdd075154804a18e49', format: 'iframe', height: 250, width: 300 },
    desktop: { key: '8dfb0ea0129a656e54c9837bb86386e3', format: 'iframe', height: 90,  width: 728 }
  },
  sticky: {
    mobile:  { key: 'c815dc8b1442b1b2e98cf2ac0376024c', format: 'iframe', height: 50,  width: 320 },
    desktop: { key: '8dfb0ea0129a656e54c9837bb86386e3', format: 'iframe', height: 90,  width: 728 }
  }
};

// Native Banner yang disisipkan di feed (tiap 3 post), hanya tampil mode HP
const NATIVE_AD_KEY = 'a34e353b3f1f0806d6dd98636848d1e3';

// Script social bar / popunder (tanpa atOptions)
const SOCIAL_BAR_SRC = 'https://inputoppose.com/dc/36/31/dc3631cbbf8e7e7cd864408473a542ac.js';

/**
 * Menyuntikkan iklan banner kotak Adsterra (atOptions) ke dalam sebuah container.
 * Non-responsif — dipakai di redirect.html.
 * @param {string} containerId - id elemen tempat iklan dipasang
 * @param {string} unitName - key di AD_UNITS
 * @param {Function} [onDone] - dipanggil setelah invoke.js selesai load/gagal
 */
function loadBannerAd(containerId, unitName, onDone) {
  const unit = AD_UNITS[unitName];
  const container = document.getElementById(containerId);
  if (!unit || !container) { if (onDone) onDone(); return; }

  const configScript = document.createElement('script');
  configScript.text = 'atOptions = ' + JSON.stringify({
    key: unit.key,
    format: unit.format,
    height: unit.height,
    width: unit.width,
    params: {}
  }) + ';';
  container.appendChild(configScript);

  const invokeScript = document.createElement('script');
  invokeScript.onload = () => { if (onDone) onDone(); };
  invokeScript.onerror = () => { if (onDone) onDone(); };
  invokeScript.src = 'https://inputoppose.com/' + unit.key + '/invoke.js';
  container.appendChild(invokeScript);
}

/**
 * Menyuntikkan iklan RESPONSIF (ukuran beda di HP vs desktop) sesuai lebar
 * layar saat ini. Mengosongkan container dulu sebelum menyuntik ulang.
 * @param {string} containerId
 * @param {string} placementName - key di RESPONSIVE_UNITS ("feedTop"/"sticky")
 * @param {Function} [onDone] - dipanggil setelah invoke.js selesai load/gagal
 */
function loadResponsiveBanner(containerId, placementName, onDone) {
  const container = document.getElementById(containerId);
  const units = RESPONSIVE_UNITS[placementName];
  if (!container || !units) { if (onDone) onDone(); return; }

  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const unit = isMobile ? units.mobile : units.desktop;

  container.innerHTML = '';

  const configScript = document.createElement('script');
  configScript.text = 'atOptions = ' + JSON.stringify({
    key: unit.key,
    format: unit.format,
    height: unit.height,
    width: unit.width,
    params: {}
  }) + ';';
  container.appendChild(configScript);

  const invokeScript = document.createElement('script');
  invokeScript.onload = () => { if (onDone) onDone(); };
  invokeScript.onerror = () => { if (onDone) onDone(); };
  invokeScript.src = 'https://inputoppose.com/' + unit.key + '/invoke.js';
  container.appendChild(invokeScript);
}

// Melacak status HP/desktop per container supaya banner responsif otomatis
// ganti ukuran saat layar di-resize/rotate.
const _responsiveWatchState = {};
function watchResponsiveBannerResize(containerId, placementName) {
  _responsiveWatchState[containerId] = window.matchMedia('(max-width: 768px)').matches;
  window.addEventListener('resize', () => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile !== _responsiveWatchState[containerId]) {
      _responsiveWatchState[containerId] = isMobile;
      loadResponsiveBanner(containerId, placementName);
    }
  });
}

/**
 * Membuat satu slot Native Banner (div container + script invoke) untuk disisipkan
 * di manapun lewat appendChild — dipakai untuk native banner di feed per-post.
 * @returns {HTMLElement}
 */
function createNativeAdSlot() {
  const wrap = document.createElement('div');
  wrap.className = 'feed-native-ad';

  // PENTING: urutan HARUS script dulu baru div (persis snippet asli vendor).
  // Banyak jaringan native ad merender relatif ke posisi <script> itu sendiri
  // di DOM (bukan lookup by id semata) — kalau urutannya dibalik, tiap slot
  // baru yang dimuat bisa salah sasaran dan malah numpuk render ke SEMUA slot
  // yang sudah ada di halaman, bukan cuma slot-nya sendiri.
  const script = document.createElement('script');
  script.async = true;
  script.setAttribute('data-cfasync', 'false');
  script.src = 'https://inputoppose.com/' + NATIVE_AD_KEY + '/invoke.js';
  wrap.appendChild(script);

  const container = document.createElement('div');
  container.id = 'container-' + NATIVE_AD_KEY;
  wrap.appendChild(container);

  return wrap;
}

/**
 * Memuat script social bar / popunder sekali per halaman.
 */
function loadSocialBar() {
  const s = document.createElement('script');
  s.src = SOCIAL_BAR_SRC;
  document.body.appendChild(s);
}

/**
 * Proteksi sandbox: mengunci setiap <iframe> iklan yang muncul di dalam
 * container yang diberikan, supaya iklan tidak bisa memaksa redirect/
 * "kabur" dari frame-nya dan menutupi seluruh layar/tab.
 * allow-scripts + allow-same-origin + allow-popups tetap diizinkan
 * (supaya klik iklan & buka tab baru tetap jalan normal),
 * tapi TANPA allow-top-navigation sehingga iklan tidak bisa mengambil alih
 * halaman utama.
 * Catatan: ini hanya berlaku untuk iklan berbasis iframe (banner, native,
 * sticky banner). Popunder & social bar bukan iframe, jadi tidak tercakup.
 * @param {string[]} containerSelectors - daftar selector CSS container iklan
 */
function hardenAdIframes(containerSelectors) {
  const SAFE_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';

  function lockIframe(iframe) {
    if (iframe.tagName === 'IFRAME' && !iframe.hasAttribute('sandbox')) {
      iframe.setAttribute('sandbox', SAFE_SANDBOX);
    }
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IFRAME') lockIframe(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('iframe').forEach(lockIframe);
        }
      });
    });
  });

  containerSelectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.querySelectorAll('iframe').forEach(lockIframe);
      observer.observe(el, { childList: true, subtree: true });
    });
  });

  // Feed native ad container ditambahkan belakangan (dinamis) — pantau body juga
  // khusus untuk elemen ber-class feed-native-ad yang baru muncul.
  const bodyObserver = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains('feed-native-ad')) {
          node.querySelectorAll('iframe').forEach(lockIframe);
          observer.observe(node, { childList: true, subtree: true });
        }
      });
    });
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}
