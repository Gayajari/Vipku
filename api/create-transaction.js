// api/create-transaction.js
// Dipanggil dari index.html saat user klik "Bayar Sekarang" pada sebuah link.
// Menerima: postId, linkIndex, price, buyerId, label
// Mengembalikan: qrisImage + invoiceId (ditampilkan sebagai modal QR di frontend,
// BUKAN redirect ke halaman bayar seperti provider sebelumnya).

const { getDb } = require("../lib/firebaseAdmin");
const { createInvoice, resolveImageUrl } = require("../lib/dongtube");

module.exports = async (req, res) => {
  // Izinkan dipanggil dari domain situs kamu (ganti sesuai domain asli nanti)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { postId, linkIndex, price, buyerId } = req.body || {};

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
    const accessRef = db.collection("paidAccess").doc(accessId);
    const existing = await accessRef.get();

    if (existing.exists && existing.data().status === "paid") {
      const d = existing.data();
      const stillValid = !d.expiresAt || new Date(d.expiresAt) > new Date();
      if (stillValid) {
        return res.status(200).json({ alreadyPaid: true });
      }
      // expiresAt sudah lewat -> jangan anggap lunas, lanjut ke bawah biar
      // dibikinin invoice QRIS baru (user diminta bayar ulang).
    }

    // Kalau masih ada invoice QRIS pending & belum kadaluarsa, pakai lagi
    // (biar user gak numpuk banyak invoice tiap kali klik ulang / reload).
    if (existing.exists) {
      const d = existing.data();
      if (d.status === "pending" && d.expiredAt && new Date(d.expiredAt) > new Date()) {
        return res.status(200).json({
          accessId,
          invoiceId: d.invoiceId,
          qrisImage: resolveImageUrl(d.qrisImage),
          amount: d.price,
          total: d.total,
          fee: d.fee,
          expiredAt: d.expiredAt
        });
      }
    }

    const invoice = await createInvoice(amount);

    // Simpan transaksi berstatus "pending" — nanti diupdate jadi "paid" oleh
    // webhook (lihat api/dongtube-callback.js), lalu frontend memantau
    // dokumen ini secara realtime lewat onSnapshot.
    await accessRef.set({
      buyerId,
      postId,
      linkIndex,
      price: amount,
      status: "pending",
      invoiceId: invoice.invoice_id,
      total: invoice.total,
      fee: invoice.fee,
      qrisImage: invoice.qris_image,
      expiredAt: invoice.expired_at,
      createdAt: new Date().toISOString()
    });

    return res.status(200).json({
      accessId,
      invoiceId: invoice.invoice_id,
      qrisImage: resolveImageUrl(invoice.qris_image),
      amount: invoice.amount,
      total: invoice.total,
      fee: invoice.fee,
      expiredAt: invoice.expired_at
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Terjadi kesalahan server." });
  }
};