// api/create-transaction.js
// Dipanggil dari index.html saat user klik "Bayar Sekarang" pada sebuah link.
// Menerima: postId, linkIndex, price, buyerId, label
// Mengembalikan: paymentUrl (halaman Duitku buat user pilih metode & bayar)

const { getDb } = require("../lib/firebaseAdmin");
const { createTransaction } = require("../lib/duitku");

module.exports = async (req, res) => {
  // Izinkan dipanggil dari domain situs kamu (ganti sesuai domain asli nanti)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { postId, linkIndex, price, buyerId, label } = req.body || {};

    if (!postId || linkIndex === undefined || !price || !buyerId) {
      return res.status(400).json({ error: "Data tidak lengkap (postId/linkIndex/price/buyerId)." });
    }
    const amount = Math.round(Number(price));
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Harga tidak valid." });
    }

    const db = getDb();

    // ID unik & deterministik per (pembeli + post + link) — dipakai buat cek status "sudah bayar"
    const accessId = `${buyerId}_${postId}_${linkIndex}`;

    // Kalau sebelumnya SUDAH pernah bayar link ini, langsung bilang sudah lunas,
    // tidak perlu bikin transaksi baru.
    const existing = await db.collection("paidAccess").doc(accessId).get();
    if (existing.exists && existing.data().status === "paid") {
      return res.status(200).json({ alreadyPaid: true });
    }

    // merchantOrderId harus unik tiap kali coba bayar (beda dari accessId)
    const merchantOrderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const siteUrl = process.env.SITE_URL; // contoh: https://vipku-mu.vercel.app atau domain kamu
    const backendUrl = process.env.BACKEND_URL; // URL backend Vercel ini sendiri

    const duitkuRes = await createTransaction({
      merchantOrderId,
      paymentAmount: amount,
      productDetails: label || "Akses Konten",
      email: "buyer@vipku.local", // Duitku wajib ada email; ini bukan email asli pembeli
      callbackUrl: `${backendUrl}/api/duitku-callback`,
      returnUrl: `${siteUrl}/?post=${encodeURIComponent(postId)}&paid=1`
    });

    // Simpan transaksi berstatus "pending" — nanti diupdate jadi "paid" oleh callback
    await db.collection("paidAccess").doc(accessId).set({
      buyerId,
      postId,
      linkIndex,
      price: amount,
      status: "pending",
      merchantOrderId,
      createdAt: new Date().toISOString()
    });

    return res.status(200).json({ paymentUrl: duitkuRes.paymentUrl, merchantOrderId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Terjadi kesalahan server." });
  }
};
