// lib/dongtube.js
// Helper untuk komunikasi ke API Dongtube Payment.
//
// BASE_URL sekarang dibaca dari Environment Variable DONGTUBE_BASE_URL,
// dengan fallback ke domain terbaru yang diketahui kalau env var belum
// diset. Ini supaya kalau providernya pindah domain lagi (sudah terjadi
// sekali: payment.dongtube.cyou -> dongtube.us.ci), kamu tinggal ganti
// value di Vercel Settings > Environment Variables, lalu redeploy — tanpa
// perlu edit kode sama sekali.
const BASE_URL = (process.env.DONGTUBE_BASE_URL || "https://dongtube.us.ci").replace(/\/+$/, "");
const API_KEY = process.env.DONGTUBE_API_KEY;

// Beberapa payment gateway kelas reseller (termasuk yang dipasangi
// Cloudflare/anti-bot) menolak request server-to-server yang tidak punya
// User-Agent sama sekali — ini salah satu penyebab paling umum "fetch
// failed" padahal domainnya sendiri sehat. Kita kirim UA yang wajar
// supaya tidak otomatis dianggap bot.
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; VipkuPaymentBot/1.0; +https://vipkuu.vercel.app)",
  "Accept": "application/json"
};

const FETCH_TIMEOUT_MS = 10000; // 10 detik — hindari function nunggu tanpa batas kalau gateway lemot

/**
 * fetch() dengan timeout (AbortController) + 1x retry otomatis kalau gagal
 * di percobaan pertama (menutupi gangguan jaringan sesaat / blip).
 * Melempar error dengan pesan yang lebih jelas (termasuk penyebab asli dari
 * err.cause, yang biasanya ditelan begitu saja oleh pesan generik
 * "fetch failed" dari Node).
 */
async function fetchWithRetry(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: controller.signal });
    return res;
  } catch (err) {
    const isAbort = err.name === "AbortError";
    const causeMsg = err.cause ? ` | cause: ${err.cause.code || err.cause.message || err.cause}` : "";
    console.error(
      `[dongtube] Fetch gagal (percobaan ${attempt}) ke ${url}: ${isAbort ? "timeout setelah " + FETCH_TIMEOUT_MS + "ms" : err.message}${causeMsg}`
    );
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500));
      return fetchWithRetry(url, attempt + 1);
    }
    const friendlyErr = new Error(
      isAbort
        ? "Server pembayaran (Dongtube) tidak merespons dalam waktu wajar. Coba lagi sebentar."
        : "Tidak bisa terhubung ke server pembayaran (Dongtube). Kemungkinan domain berubah lagi atau gateway sedang gangguan/maintenance."
    );
    friendlyErr.cause = err;
    throw friendlyErr;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bikin invoice QRIS baru senilai `amount`.
 */
async function createInvoice(amount) {
  if (!API_KEY) {
    throw new Error("DONGTUBE_API_KEY belum diset di Environment Variables.");
  }
  const amountInt = Math.round(Number(amount));
  if (!amountInt || amountInt <= 0) {
    throw new Error("amount tidak valid.");
  }

  const params = new URLSearchParams({ amount: String(amountInt), apikey: API_KEY });
  const res = await fetchWithRetry(`${BASE_URL}/api/v1/invoice?${params.toString()}`);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`Respons Dongtube bukan JSON valid (HTTP ${res.status}). Kemungkinan domain/endpoint berubah lagi.`);
  }

  if (!res.ok || !data.success) {
    throw new Error("Gagal membuat invoice Dongtube: " + JSON.stringify(data));
  }
  return data; // { success, invoice_id, amount, fee, total, qris_image, expired_at }
}

/**
 * Cek status invoice langsung ke Dongtube.
 */
async function getInvoiceStatus(invoiceId) {
  if (!API_KEY) {
    throw new Error("DONGTUBE_API_KEY belum diset di Environment Variables.");
  }
  const params = new URLSearchParams({ invoice_id: invoiceId, apikey: API_KEY });
  const res = await fetchWithRetry(`${BASE_URL}/api/v1/invoice/status?${params.toString()}`);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`Respons Dongtube bukan JSON valid (HTTP ${res.status}). Kemungkinan domain/endpoint berubah lagi.`);
  }

  if (!res.ok) {
    throw new Error("Gagal cek status invoice Dongtube: " + JSON.stringify(data));
  }
  return data;
}

/**
 * Cek saldo akun Dongtube (opsional dipakai, mis. buat halaman admin).
 */
async function getBalance() {
  if (!API_KEY) {
    throw new Error("DONGTUBE_API_KEY belum diset di Environment Variables.");
  }
  const params = new URLSearchParams({ apikey: API_KEY });
  const res = await fetchWithRetry(`${BASE_URL}/api/v1/balance?${params.toString()}`);
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`Respons Dongtube bukan JSON valid (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new Error("Gagal cek saldo Dongtube: " + JSON.stringify(data));
  }
  return data; // { balance }
}

/**
 * qris_image dari Dongtube berupa path relatif ("/img-cache/xxx.png").
 * Jadikan URL lengkap supaya bisa langsung dipakai di tag <img> di frontend.
 */
function resolveImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE_URL}${path}`;
}

/**
 * Menandai sebuah dokumen paidAccess jadi "paid" + hitung expiresAt sesuai
 * setting durasi akses. Dipakai di DUA tempat: api/dongtube-callback.js
 * (jalur utama, lewat webhook) dan api/check-invoice-status.js (jalur
 * cadangan, polling aktif dari frontend) — disatukan di sini (bukan file
 * terpisah) supaya logikanya SAMA PERSIS di kedua jalur.
 */
async function markAccessPaid(db, docRef, paidAt) {
  let expiresAt = null;
  try {
    const durationSnap = await db.collection("settings").doc("accessDuration").get();
    const hours = durationSnap.exists ? Number(durationSnap.data().hours) || 0 : 0;
    if (hours > 0) {
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }
  } catch (err) {
    console.error("Gagal ambil setting durasi akses, fallback ke permanen:", err);
  }

  await docRef.update({
    status: "paid",
    paidAt: paidAt || new Date().toISOString(),
    expiresAt // null = permanen
  });

  return expiresAt;
}

module.exports = {
  createInvoice,
  getInvoiceStatus,
  getBalance,
  resolveImageUrl,
  markAccessPaid,
  BASE_URL,
  API_KEY
};
