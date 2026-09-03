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
 * Cek status invoice langsung ke Dongtube (opsional, buat verifikasi manual/debug
 * — alur utama tetap pakai webhook di api/dongtube-callback.js).
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

module.exports = { createInvoice, getInvoiceStatus, resolveImageUrl, BASE_URL, API_KEY };
