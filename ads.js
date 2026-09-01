/* =========================================================
   ads.js — Kelompok terpusat semua konfigurasi & loader iklan
   Dipakai bareng di index.html & redirect.html
   ========================================================= */

// Unit iklan banner kotak (Adsterra atOptions)
const AD_UNITS = {
  redirectBanner: {
    key: 'e601e978833d27fdd075154804a18e49',
    format: 'iframe',
    height: 250,
    width: 300
  }
};

// Unit iklan Native Banner (menyatu dengan tampilan konten)
const NATIVE_UNITS = {
  indexNative: {
    key: 'a34e353b3f1f0806d6dd98636848d1e3'
  }
};

// Script social bar / popunder (tanpa atOptions)
const SOCIAL_BAR_SRC = 'https://inputoppose.com/dc/36/31/dc3631cbbf8e7e7cd864408473a542ac.js';

/**
 * Menyuntikkan iklan banner kotak Adsterra (atOptions) ke dalam sebuah container.
 * @param {string} containerId - id elemen tempat iklan dipasang
 * @param {string} unitName - key di AD_UNITS
 */
function loadBannerAd(containerId, unitName) {
  const unit = AD_UNITS[unitName];
  const container = document.getElementById(containerId);
  if (!unit || !container) return;

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
  invokeScript.src = 'https://inputoppose.com/' + unit.key + '/invoke.js';
  container.appendChild(invokeScript);
}

/**
 * Menyuntikkan iklan Native Banner Adsterra.
 * Butuh elemen <div id="container-<key>"> sudah ada di HTML tempat iklan mau tampil;
 * kalau belum ada, dibuat otomatis lalu ditambahkan di akhir body.
 * @param {string} unitName - key di NATIVE_UNITS
 */
function loadNativeAd(unitName) {
  const unit = NATIVE_UNITS[unitName];
  if (!unit) return;

  const containerId = 'container-' + unit.key;
  if (!document.getElementById(containerId)) {
    const div = document.createElement('div');
    div.id = containerId;
    document.body.appendChild(div);
  }

  const invokeScript = document.createElement('script');
  invokeScript.async = true;
  invokeScript.setAttribute('data-cfasync', 'false');
  invokeScript.src = 'https://inputoppose.com/' + unit.key + '/invoke.js';
  document.body.appendChild(invokeScript);
}

/**
 * Memuat script social bar / popunder sekali per halaman.
 */
function loadSocialBar() {
  const s = document.createElement('script');
  s.src = SOCIAL_BAR_SRC;
  document.body.appendChild(s);
}
