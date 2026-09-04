// api/check-invoice-status.js
// JALUR CADANGAN kalau webhook Dongtube (api/dongtube-callback.js) gagal/telat.
// Dipanggil berkala (polling) dari index.html SELAGI modal QRIS terbuka.
// Bedanya dari get-link.js: endpoint ini AKTIF nanya ke Dongtube "invoice ini
// udah lunas belum?" — bukan cuma pasif nunggu Firestore diupdate webhook.
// Kalau ternyata Dongtube bilang sudah lunas tapi Firestore belum tahu
// (webhook gagal), endpoint ini yang update Firestore-nya sendiri.

const { getDb } = require("../lib/firebaseAdmin");
const { getInvoiceStatus, markAccessPaid } = require("../lib/dongtube");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { postId, linkIndex, buyerId } = req.body || {};
    if (!postId || linkIndex === undefined || !buyerId) {
      return res.status(400).json({ error: "Data tidak lengkap." });
    }

    const db = getDb();
    const accessId = `${buyerId}_${postId}_${linkIndex}`;
    const docRef = db.collection("paidAccess").doc(accessId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.status(404).json({ status: "not_found" });
    }

    const data = snap.data();

    // Udah "paid" di Firestore (berarti webhook-nya jalan normal) — nggak perlu
    // nanya ke Dongtube lagi, langsung balikin apa adanya.
    if (data.status === "paid") {
      return res.status(200).json({ status: "paid" });
    }

    // Masih "pending" di Firestore — coba tanya LANGSUNG ke Dongtube, jaga-jaga
    // webhook-nya belum/nggak sampai.
    if (data.status === "pending" && data.invoiceId) {
      try {
        const liveStatus = await getInvoiceStatus(data.invoiceId);
        const isPaidNow = liveStatus.status === "paid" || liveStatus.status === "success";

        if (isPaidNow) {
          await markAccessPaid(db, docRef, liveStatus.paid_at);
          return res.status(200).json({ status: "paid", healedByPolling: true });
        }
      } catch (err) {
        // Kalau gagal nanya ke Dongtube (mis. API lagi down), jangan bikin
        // request ini error total — cukup anggap masih pending, coba lagi
        // nanti di polling berikutnya.
        console.error("Gagal cek status live ke Dongtube:", err);
      }
    }

    // Cek kadaluarsa invoice
    if (data.expiredAt && new Date(data.expiredAt).getTime() <= Date.now()) {
      return res.status(200).json({ status: "expired" });
    }

    return res.status(200).json({ status: data.status || "pending" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Terjadi kesalahan server." });
  }
};
