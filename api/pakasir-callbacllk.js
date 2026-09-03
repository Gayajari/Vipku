// pakasir-callback.js
// URL ini didaftarkan sebagai "Webhook URL" di halaman Edit Proyek pada
// dashboard Pakasir (app.pakasir.com). Pakasir akan kirim POST ke sini
// otomatis begitu pembayaran diterima. Endpoint ini TIDAK dipanggil dari
// browser — murni server-ke-server.
//
// PENTING beda dari Duitku: Pakasir TIDAK mengirim signature di webhook-nya,
// jadi kita TIDAK BOLEH langsung percaya isi body yang masuk. Sebagai
// gantinya, begitu webhook masuk, kita balik nanya ke API resmi Pakasir
// (transactiondetail) pakai API Key rahasia kita sendiri untuk KONFIRMASI
// ULANG status transaksi — itu baru dianggap sah.

const { getDb } = require("./firebaseAdmin");
const { getTransactionDetail } = require("./pakasir");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { order_id: orderId } = req.body || {};

    if (!orderId) {
      return res.status(400).send("Data callback tidak lengkap.");
    }

    const db = getDb();

    // Cari dokumen paidAccess yang merchantOrderId-nya cocok
    const snap = await db
      .collection("paidAccess")
      .where("merchantOrderId", "==", orderId)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn("Order tidak ditemukan di Firestore:", orderId);
      return res.status(200).send("OK"); // tetap 200 supaya Pakasir tidak retry terus
    }

    const docRef = snap.docs[0].ref;
    const docData = snap.docs[0].data();

    // Konfirmasi ulang LANGSUNG ke Pakasir pakai harga yang KITA simpan sendiri
    // saat bikin transaksi (docData.price) — bukan pakai amount dari body webhook,
    // supaya tidak bisa dibohongi lewat body POST yang dipalsukan.
    const detail = await getTransactionDetail({ orderId, amount: docData.price });

    const orderMatches = detail.order_id === orderId;
    const amountMatches = Number(detail.amount) === Number(docData.price);

    if (detail.status === "completed" && orderMatches && amountMatches) {
      await docRef.update({
        status: "paid",
        paidAt: detail.completed_at || new Date().toISOString()
      });
    } else if (detail.status && detail.status !== "completed") {
      await docRef.update({ status: "failed" });
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};