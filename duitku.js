// lib/duitku.js
// Helper untuk komunikasi ke API Duitku.
// Dokumentasi resmi: https://docs.duitku.com/api/en/
// PENTING: cek ulang nama field di dashboard/postman collection Duitku kamu
// saat setup pertama kali (kadang ada penyesuaian versi API).

const crypto = require("crypto");

const IS_PRODUCTION = process.env.DUITKU_ENV === "production";

const BASE_URL = IS_PRODUCTION
  ? "https://passport.duitku.com/webapi/api/merchant"
  : "https://sandbox.duitku.com/webapi/api/merchant";

const MERCHANT_CODE = process.env.DUITKU_MERCHANT_CODE;
const API_KEY = process.env.DUITKU_API_KEY;

function md5(str) {
  return crypto.createHash("md5").update(str, "utf8").digest("hex");
}

/**
 * Bikin transaksi baru di Duitku.
 * paymentMethod dikosongkan/diisi "" akan menampilkan halaman pilih metode
 * pembayaran bawaan Duitku (mirip "multi payment" — user pilih sendiri
 * QRIS/e-wallet/VA di halaman Duitku).
 */
async function createTransaction({
  merchantOrderId,
  paymentAmount,
  productDetails,
  email,
  callbackUrl,
  returnUrl,
  paymentMethod = "" // kosongkan supaya user pilih sendiri di halaman Duitku
}) {
  if (!MERCHANT_CODE || !API_KEY) {
    throw new Error("DUITKU_MERCHANT_CODE / DUITKU_API_KEY belum diset di Environment Variables.");
  }

  // Signature untuk create transaction: MD5(merchantCode + merchantOrderId + paymentAmount + apiKey)
  const signature = md5(`${MERCHANT_CODE}${merchantOrderId}${paymentAmount}${API_KEY}`);

  const body = {
    merchantCode: MERCHANT_CODE,
    paymentAmount,
    paymentMethod,
    merchantOrderId,
    productDetails,
    email,
    callbackUrl,
    returnUrl,
    signature
  };

  const res = await fetch(`${BASE_URL}/v2/inquiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok || data.statusCode !== "00") {
    throw new Error("Gagal membuat transaksi Duitku: " + JSON.stringify(data));
  }
  return data; // berisi paymentUrl, reference, dll
}

/**
 * Verifikasi signature callback yang dikirim Duitku ke webhook kita,
 * supaya kita yakin notifikasi ini beneran dari Duitku (bukan orang iseng
 * yang nembak endpoint callback kita langsung).
 * Signature callback: MD5(merchantCode + amount + merchantOrderId + apiKey)
 */
function verifyCallbackSignature({ merchantCode, amount, merchantOrderId, signature }) {
  const expected = md5(`${merchantCode}${amount}${merchantOrderId}${API_KEY}`);
  return expected === signature;
}

module.exports = { createTransaction, verifyCallbackSignature, MERCHANT_CODE };
