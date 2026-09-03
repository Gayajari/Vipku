// lib/firebaseAdmin.js
// Koneksi ke Firestore dari server (bukan dari browser) pakai Firebase Admin SDK.
// Admin SDK ini PUNYA AKSES PENUH ke Firestore (bypass security rules),
// makanya cuma boleh jalan di server (Vercel), JANGAN PERNAH taruh
// service account key ini di kode frontend/browser.

const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // Ambil dari Environment Variables di dashboard Vercel (Settings > Environment Variables):
  // FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
  // Nilainya didapat dari file JSON service account:
  // Firebase Console > Project Settings > Service Accounts > Generate New Private Key
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // private_key dari file JSON biasanya mengandung karakter \n literal saat disimpan
  // sebagai env var satu baris, jadi perlu di-convert balik jadi newline asli.
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Env var Firebase Admin belum lengkap. Cek FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY di Vercel."
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

function getDb() {
  getAdminApp();
  return admin.firestore();
}

module.exports = { getDb };
