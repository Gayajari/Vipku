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
const { API_KEY, markAccessPaid } = require("../lib/dongtube");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !API_KEY) return { valid: false, expected: null };
  const expected =
    "sha256=" + crypto.createHmac("sha256", API_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return { valid: false, expected };
  return { valid: crypto.timingSafeEqual(a, b), expected };
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-signature"];

    // --- DIAGNOSTIK SEMENTARA ---
    // Tidak membocorkan API key — cuma menampilkan hash yang dihitung vs
    // yang diterima dari Dongtube, supaya kelihatan di Vercel Logs apakah
    // cocok. Hapus blok ini kalau sudah yakin webhook jalan normal.
    console.log("[dongtube-callback] Headers diterima:", JSON.stringify(req.headers));
    console.log("[dongtube-callback] Body mentah diterima:", rawBody.slice(0, 500));
    // --- END DIAGNOSTIK ---

    const { valid, expected } = isValidSignature(rawBody, signature);

    if (!valid) {
      console.warn(
        "[dongtube-callback] Signature TIDAK VALID. Diterima:",
        signature || "(tidak ada header X-Signature)",
        "| Dihitung (pakai DONGTUBE_API_KEY sebagai secret):",
        expected || "(API_KEY kosong/tidak diset)"
      );
      console.warn(
        "[dongtube-callback] Kalau kedua nilai di atas beda, kemungkinan besar Dongtube pakai 'Webhook Secret' TERPISAH dari API Key — cek dashboard Dongtube > Profil, apakah ada field secret khusus untuk webhook."
      );
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
      console.warn("[dongtube-callback] Invoice tidak ditemukan di Firestore:", invoiceId);
      return res.status(200).send("OK"); // tetap 200 supaya Dongtube tidak retry terus
    }

    const docRef = snap.docs[0].ref;

    if (status === "paid" || payload.event === "invoice.paid") {
      // Pakai helper yang sama dengan jalur polling cadangan (lib/dongtube.js)
      // supaya logikanya SAMA PERSIS di kedua jalur, tidak dobel-tulis.
      await markAccessPaid(db, docRef, paidAt);
      console.log("[dongtube-callback] Berhasil menandai paid:", invoiceId);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("[dongtube-callback] Error:", err.message, err.cause || "");
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
