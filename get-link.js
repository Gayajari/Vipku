// api/get-link.js
// Satu-satunya jalan untuk mendapatkan URL ASLI dari link berbayar.
// Client (index.html) memanggil ini setelah bayar (atau saat link sebelumnya
// sudah pernah dibayar). Server yang cek status "paid" di Firestore
// (pakai Admin SDK, bukan dari input client — supaya tidak bisa dibohongi).

const { getDb } = require("../lib/firebaseAdmin");

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

    // Jalur 1: sudah lunas otomatis via Duitku ("paidAccess")
    const accessId = `${buyerId}_${postId}_${linkIndex}`;
    const accessSnap = await db.collection("paidAccess").doc(accessId).get();
    const isPaidViaDuitku = accessSnap.exists && accessSnap.data().status === "paid";

    // Jalur 2: sudah diverifikasi manual admin ("manualOrders")
    let isVerifiedManual = false;
    if (!isPaidViaDuitku) {
      const manualSnap = await db
        .collection("manualOrders")
        .where("buyerId", "==", buyerId)
        .where("postId", "==", postId)
        .where("linkIndex", "==", linkIndex)
        .where("status", "==", "verified")
        .limit(1)
        .get();
      isVerifiedManual = !manualSnap.empty;
    }

    if (!isPaidViaDuitku && !isVerifiedManual) {
      return res.status(403).json({ error: "Belum lunas/terverifikasi untuk link ini." });
    }

    const secretSnap = await db.collection("linkSecrets").doc(postId).get();
    if (!secretSnap.exists) {
      return res.status(404).json({ error: "Link tidak ditemukan." });
    }

    const url = secretSnap.data()[String(linkIndex)];
    if (!url) {
      return res.status(404).json({ error: "Link tidak ditemukan." });
    }

    return res.status(200).json({ url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Terjadi kesalahan server." });
  }
};
