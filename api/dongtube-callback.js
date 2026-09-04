// api/dongtube-callback.js
// URL ini didaftarkan sebagai "Webhook URL" di halaman Profil pada dashboard
// Dongtube Payment (payment.dongtube.cyou/profile). Dongtube kirim POST ke
// sini otomatis begitu invoice QRIS LUNAS. Endpoint ini TIDAK dipanggil dari
// browser — murni server-ke-server.
//
// Dongtube mengirim header X-Signature = sha256=HMAC-SHA256(body mentah, API Key).
// Kita WAJIB verifikasi signature ini pakai BODY MENTAH (belum di-parse JSON),
// makanya bodyParser bawaan Vercel dimatikan (lewat handler.config di bagian
// paling bawah file ini — HARUS ditempel ke fungsi yang sama yang di-export,
// bukan di-assign ke module.exports duluan, karena nanti ketimpa).

const crypto = require("crypto");
const { getDb } = require("../lib/firebaseAdmin");
const { API_KEY } = require("../lib/dongtube");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !API_KEY) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", API_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-signature"];

    if (!isValidSignature(rawBody, signature)) {
      console.warn("Signature webhook Dongtube tidak valid — kemungkinan bukan dari Dongtube.");
      return res.status(401).send("Invalid signature");
    }

    const payload = JSON.parse(rawBody);
    const { invoice_id: invoiceId, status, paid_at: paidAt } = payload;

    if (!invoiceId) {
      return res.status(400).send("Data callback tidak lengkap.");
    }

    const db = getDb();
    const snap = await db
      .collection("paidAccess")
      .where("invoiceId", "==", invoiceId)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn("Invoice tidak ditemukan di Firestore:", invoiceId);
      return res.status(200).send("OK"); // tetap 200 supaya Dongtube tidak retry terus
    }

    const docRef = snap.docs[0].ref;

    if (status === "paid" || payload.event === "invoice.paid") {
      // Ambil durasi akses yang diset admin (settings/accessDuration.hours).
      // 0/kosong = permanen (nggak dikasih expiresAt sama sekali).
      let expiresAt = null;
      try {
        const durationSnap = await db.collection("settings").doc("accessDuration").get();
        const hours = durationSnap.exists ? Number(durationSnap.data().hours) || 0 : 0;
        if (hours > 0) {
          expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        }
      } catch (err) {
        console.error("Gagal ambil setting durasi akses, fallback ke permanen:", err);
      }

      await docRef.update({
        status: "paid",
        paidAt: paidAt || new Date().toISOString(),
        expiresAt // null = permanen
      });
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error");
  }
}

// PENTING: config ditempel ke fungsi yang SAMA yang di-export, bukan
// di-assign ke module.exports secara terpisah sebelum ini (itu bug-nya
// yang kemarin — module.exports = handler di bawah akan MENIMPA apapun
// yang sebelumnya nempel di module.exports, termasuk .config).
handler.config = {
  api: { bodyParser: false }
};

module.exports = handler;
