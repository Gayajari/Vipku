// api/get-link.js
// Endpoint serba-guna (sengaja digabung jadi 1 file, bukan dipisah-pisah)
// buat 3 kebutuhan sekaligus, dibedakan lewat field "action" di body:
//
//   1. (tanpa action / default) → ambil URL ASLI link berbayar, kalau sudah
//      lunas/terverifikasi. Dipanggil setelah bayar, atau saat link yang
//      sebelumnya sudah pernah dibayar mau dibuka lagi.
//   2. action: "checkStatus"    → jalur cadangan polling: cek status invoice
//      AKTIF ke Dongtube (bukan cuma pasif nunggu Firestore), buat jaga-jaga
//      webhook Dongtube telat/gagal sampai. Self-heal: kalau ternyata sudah
//      lunas, update Firestore sendiri di sini.
//   3. action: "trackView"      → naikkan hitungan views sebuah post 1 angka.
//      Server yang pegang kendali (bukan client langsung tulis ke Firestore)
//      supaya nggak bisa disalahgunakan buat spam naikin angka dari DevTools.
//
// Semua tetap di 1 file supaya nggak nambah-nambah file baru di folder api/.

const { getDb } = require("../lib/firebaseAdmin");
const { getInvoiceStatus, markAccessPaid } = require("../lib/dongtube");
const admin = require("firebase-admin");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { postId, linkIndex, buyerId, action } = req.body || {};
    const db = getDb();

    // ===== 3. Hitung view (jalur paling ringan, cuma butuh postId) =====
    if (action === "trackView") {
      if (!postId) return res.status(400).json({ error: "postId wajib diisi." });
      try {
        await db.collection("posts").doc(postId).update({
          views: admin.firestore.FieldValue.increment(1)
        });
      } catch (err) {
        // Post mungkin sudah dihapus / id salah — ini cuma penghitung, jangan
        // dianggap kegagalan fatal.
        console.error("Gagal update view count:", err);
      }
      return res.status(200).json({ success: true });
    }

    // Jalur "checkStatus" dan default (ambil link) sama-sama butuh ini:
    if (!postId || linkIndex === undefined || !buyerId) {
      return res.status(400).json({ error: "Data tidak lengkap." });
    }
    const accessId = `${buyerId}_${postId}_${linkIndex}`;
    const docRef = db.collection("paidAccess").doc(accessId);

    // ===== 2. Polling cadangan: tanya status LANGSUNG ke Dongtube =====
    if (action === "checkStatus") {
      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ status: "not_found" });
      const data = snap.data();

      if (data.status === "paid") {
        return res.status(200).json({ status: "paid" });
      }

      if (data.status === "pending" && data.invoiceId) {
        try {
          const liveStatus = await getInvoiceStatus(data.invoiceId);
          const isPaidNow = liveStatus.status === "paid" || liveStatus.status === "success";
          if (isPaidNow) {
            await markAccessPaid(db, docRef, liveStatus.paid_at);
            return res.status(200).json({ status: "paid", healedByPolling: true });
          }
        } catch (err) {
          // Dongtube lagi down/gagal dihubungi — jangan bikin request ini
          // error total, anggap masih pending, coba lagi di polling berikutnya.
          console.error("Gagal cek status live ke Dongtube:", err);
        }
      }

      if (data.expiredAt && new Date(data.expiredAt).getTime() <= Date.now()) {
        return res.status(200).json({ status: "expired" });
      }
      return res.status(200).json({ status: data.status || "pending" });
    }

    // ===== 1. Default: ambil URL asli link berbayar =====
    const now = Date.now();
    const accessSnap = await docRef.get();
    let isPaidAuto = false;
    if (accessSnap.exists && accessSnap.data().status === "paid") {
      const d = accessSnap.data();
      const stillValid = !d.expiresAt || new Date(d.expiresAt).getTime() > now;
      isPaidAuto = stillValid;
    }

    let isVerifiedManual = false;
    if (!isPaidAuto) {
      const manualSnap = await db
        .collection("manualOrders")
        .where("buyerId", "==", buyerId)
        .where("postId", "==", postId)
        .where("linkIndex", "==", linkIndex)
        .where("status", "==", "verified")
        .limit(1)
        .get();
      if (!manualSnap.empty) {
        const md = manualSnap.docs[0].data();
        isVerifiedManual = !md.expiresAt || new Date(md.expiresAt).getTime() > now;
      }
    }

    if (!isPaidAuto && !isVerifiedManual) {
      return res.status(403).json({ error: "Akses untuk link ini belum lunas atau sudah kadaluarsa. Silakan bayar lagi." });
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
