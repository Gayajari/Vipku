// pakasir.js
// Helper untuk komunikasi ke API Pakasir.
// Dokumentasi resmi: https://pakasir.com/p/docs
// PENTING: Pakasir TIDAK mengirim signature di webhook-nya (beda dari Duitku).
// Jadi setiap ada webhook masuk, kita WAJIB konfirmasi ulang langsung ke API
// transactiondetail di bawah ini — jangan pernah percaya begitu saja isi body
// webhook mentah (lihat pakasir-callback.js).

const APP_BASE_URL = "https://app.pakasir.com";

const PROJECT_SLUG = process.env.PAKASIR_PROJECT;
const API_KEY = process.env.PAKASIR_API_KEY;

/**
 * Bikin URL halaman pembayaran Pakasir ("Integrasi via URL" — tidak perlu
 * panggil API sama sekali buat generate link ini).
 */
function buildPaymentUrl({ orderId, amount, redirectUrl, qrisOnly = false }) {
  if (!PROJECT_SLUG) {
    throw new Error("PAKASIR_PROJECT belum diset di Environment Variables.");
  }
  if (!orderId) {
    throw new Error("orderId wajib diisi.");
  }
  const amountInt = Math.round(Number(amount));
  if (!amountInt || amountInt <= 0) {
    throw new Error("amount tidak valid.");
  }

  const params = new URLSearchParams({ order_id: orderId });
  if (redirectUrl) params.set("redirect", redirectUrl);
  if (qrisOnly) params.set("qris_only", "1");

  return `${APP_BASE_URL}/pay/${PROJECT_SLUG}/${amountInt}?${params.toString()}`;
}

/**
 * Cek status transaksi LANGSUNG ke server Pakasir pakai API Key rahasia kita.
 * Dipakai di webhook handler buat konfirmasi ulang, karena webhook Pakasir
 * tidak punya signature yang bisa diverifikasi.
 */
async function getTransactionDetail({ orderId, amount }) {
  if (!PROJECT_SLUG || !API_KEY) {
    throw new Error("PAKASIR_PROJECT / PAKASIR_API_KEY belum diset di Environment Variables.");
  }
  const amountInt = Math.round(Number(amount));

  const params = new URLSearchParams({
    project: PROJECT_SLUG,
    amount: String(amountInt),
    order_id: orderId,
    api_key: API_KEY
  });

  const res = await fetch(`${APP_BASE_URL}/api/transactiondetail?${params.toString()}`);
  const data = await res.json();

  if (!res.ok || !data.transaction) {
    throw new Error("Gagal mengambil detail transaksi Pakasir: " + JSON.stringify(data));
  }
  return data.transaction; // { amount, order_id, project, status, payment_method, completed_at }
}

module.exports = { buildPaymentUrl, getTransactionDetail, PROJECT_SLUG };
