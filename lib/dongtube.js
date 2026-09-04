// lib/dongtube.js
// Helper untuk komunikasi ke API Dongtube Payment.
// Dokumentasi resmi: https://payment.dongtube.cyou/docs

const BASE_URL = "https://payment.dongtube.cyou";
const API_KEY = process.env.DONGTUBE_API_KEY;

/**
 * Bikin invoice QRIS baru senilai `amount`.
 * Balikannya termasuk qris_image (path relatif, mis. "/img-cache/abc.png")
 * dan invoice_id yang jadi acuan status pembayaran.
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
  const res = await fetch(`${BASE_URL}/api/v1/invoice?${params.toString()}`);
  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new Error("Gagal membuat invoice Dongtube: " + JSON.stringify(data));
  }
  return data; // { success, invoice_id, amount, fee, total, qris_image, expired_at }
}

/**
 * Cek status invoice langsung ke Dongtube (dipakai jalur cadangan/polling di
 * api/check-invoice-status.js, dan buat verifikasi manual/debug).
 */
async function getInvoiceStatus(invoiceId) {
  if (!API_KEY) {
    throw new Error("DONGTUBE_API_KEY belum diset di Environment Variables.");
  }
  const params = new URLSearchParams({ invoice_id: invoiceId, apikey: API_KEY });
  const res = await fetch(`${BASE_URL}/api/v1/invoice/status?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error("Gagal cek status invoice Dongtube: " + JSON.stringify(data));
  }
  return data; // { invoice_id, amount, fee, total, status, qris_image, expired_at, created_at }
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
  resolveImageUrl,
  markAccessPaid,
  BASE_URL,
  API_KEY
};
