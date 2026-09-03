// api/duitku-callback.js
// URL ini didaftarkan sebagai "callbackUrl" saat bikin transaksi.
// Duitku akan kirim POST ke sini otomatis begitu status pembayaran berubah.
// Endpoint ini TIDAK dipanggil dari browser — murni server-ke-server.

const { getDb } = require("../lib/firebaseAdmin");
const { verifyCallbackSignature } = require("../lib/duitku");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const {
      merchantCode,
      amount,
      merchantOrderId,
      resultCode, // "00" = sukses
      signature
    } = req.body || {};

    if (!merchantOrderId || !signature) {
      return res.status(400).send("Data callback tidak lengkap.");
    }

    // WAJIB: verifikasi signature, supaya bukan orang iseng yang nembak endpoint ini
    // langsung dan bohong "sudah bayar" padahal belum.
    const valid = verifyCallbackSignature({ merchantCode, amount, merchantOrderId, signature });
    if (!valid) {
      console.warn("Signature callback Duitku tidak valid:", req.body);
      return res.status(403).send("Invalid signature");
    }

    const db = getDb();

    // Cari dokumen paidAccess yang merchantOrderId-nya cocok
    const snap = await db
      .collection("paidAccess")
      .where("merchantOrderId", "==", merchantOrderId)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn("Order tidak ditemukan di Firestore:", merchantOrderId);
      return res.status(200).send("OK"); // tetap 200 supaya Duitku tidak retry terus
    }

    const docRef = snap.docs[0].ref;

    if (resultCode === "00") {
      await docRef.update({
        status: "paid",
        paidAt: new Date().toISOString()
      });
    } else {
      await docRef.update({
        status: "failed"
      });
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
};
