// api/l/[token].js
// Shortlink PERMANEN per (pembeli + link). Dibuka via redirect biasa (GET),
// jadi bisa di-bookmark/disave pembeli.
//
// Setiap kali link ini diakses, server:
//   1. Cek ULANG status bayar + durasi akses (paidAccess / manualOrders) —
//      sama kayak get-link.js, cuma ini jalan tiap kali dibuka, bukan sekali doang.
//   2. Ambil tujuan yang LAGI di-set sekarang di linkSecrets (live lookup) —
//      jadi kalau admin ganti link di dasbor, shortlink yang sama otomatis
//      nganter ke tujuan baru tanpa perlu bikin/bagi link baru ke pembeli.
//
// Token = base64url dari accessId (`${buyerId}_${postId}_${linkIndex}`),
// dibikin di api/get-link.js.

const { getDb } = require("../../lib/firebaseAdmin");

function decodeToken(token) {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split("_");
    // accessId = `${buyerId}_${postId}_${linkIndex}` — linkIndex selalu angka
    // di posisi paling belakang, postId (Firestore doc id) di posisi kedua
    // dari belakang, sisanya digabung lagi jadi buyerId (jaga-jaga kalau ada underscore).
    const linkIndex = parts.pop();
    const postId = parts.pop();
    const buyerId = parts.join("_");
    if (!buyerId || !postId || linkIndex === undefined) return null;
    return { buyerId, postId, linkIndex: Number(linkIndex) };
  } catch (err) {
    return null;
  }
}

module.exports = async (req, res) => {
  const { token } = req.query;
  const decoded = token ? decodeToken(String(token)) : null;

  if (!decoded) {
    return res.redirect(302, "/?linkError=invalid");
  }

  const { buyerId, postId, linkIndex } = decoded;

  try {
    const db = getDb();
    const now = Date.now();
    const accessId = `${buyerId}_${postId}_${linkIndex}`;

    // Jalur 1: lunas otomatis via QRIS
    const accessSnap = await db.collection("paidAccess").doc(accessId).get();
    let valid = false;
    if (accessSnap.exists && accessSnap.data().status === "paid") {
      const d = accessSnap.data();
      valid = !d.expiresAt || new Date(d.expiresAt).getTime() > now;
    }

    // Jalur 2: diverifikasi manual admin
    if (!valid) {
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
        valid = !md.expiresAt || new Date(md.expiresAt).getTime() > now;
      }
    }

    if (!valid) {
      // Belum bayar / akses udah kadaluarsa -> balik ke situs biar bayar lagi
      return res.redirect(302, `/?post=${encodeURIComponent(postId)}&expired=1`);
    }

    // Ambil tujuan TERBARU (live lookup) -> ini yang bikin admin bisa ganti
    // link kapan aja dari dasbor tanpa bikin shortlink baru.
    const secretSnap = await db.collection("linkSecrets").doc(postId).get();
    const url = secretSnap.exists ? secretSnap.data()[String(linkIndex)] : null;

    if (!url) {
      return res.redirect(302, "/?linkError=notfound");
    }

    return res.redirect(302, url);
  } catch (err) {
    console.error(err);
    return res.redirect(302, "/?linkError=server");
  }
};
