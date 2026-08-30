import { CoreApi, Snap } from 'midtrans-client';
import type { MidtransMode } from '@prisma/client';

// Klien Midtrans PER KAFE DAN PER MODE.
//
// Yang berubah dari versi sebelumnya: modul ini tidak lagi menerima baris
// `Cafe` dan mendekripsi kuncinya sendiri. Ia menerima kredensial yang SUDAH
// diselesaikan (`KredensialMidtrans`) — hasil dari `paymentSettings.service`,
// yang tahu mode mana yang sedang aktif dan hanya mau memakai kunci milik mode
// itu.
//
// Pemisahan itu bukan kosmetik. Dengan satu slot kunci bersama, menyalakan
// Production tanpa mengganti kunci berarti transaksi uang sungguhan dikirim
// memakai kunci Sandbox — permintaannya ditolak Midtrans, dan kalau tidak,
// jauh lebih buruk lagi. Di sini "kunci untuk mode X" tidak punya cadangan:
// tidak ada, ya tidak ada.

/** Kredensial siap pakai untuk satu mode. `serverKey` sudah didekripsi. */
export interface KredensialMidtrans {
  cafeId: string;
  mode: MidtransMode;
  clientKey: string | null;
  serverKey: string;
}

function isProduction(mode: MidtransMode): boolean {
  return mode === 'PRODUCTION';
}

/** Instance Snap API sesuai mode kredensial — untuk membuat transaksi. */
export function getMidtransSnap(kredensial: KredensialMidtrans): Snap {
  return new Snap({
    isProduction: isProduction(kredensial.mode),
    serverKey: kredensial.serverKey,
    clientKey: kredensial.clientKey ?? '',
  });
}

/** Instance Core API sesuai mode — dipakai mengecek status transaksi. */
export function getMidtransCoreApi(kredensial: KredensialMidtrans): CoreApi {
  return new CoreApi({
    isProduction: isProduction(kredensial.mode),
    serverKey: kredensial.serverKey,
    clientKey: kredensial.clientKey ?? '',
  });
}

/**
 * Base URL Core API sesuai mode.
 *
 * INILAH satu-satunya yang menentukan environment. Bukan awalan kunci: akun
 * Midtrans Sandbox tidak selalu menerbitkan kunci berawalan `SB-`, sehingga
 * menebak environment dari teks kunci menolak kunci yang sepenuhnya sah.
 * Mode datang dari slot yang dipilih pemilik, dan kunci apa pun yang ada di
 * slot itu diuji ke endpoint milik mode itu — tanpa kecuali dan tanpa cadangan.
 */
export function baseUrlMidtrans(mode: MidtransMode): string {
  return isProduction(mode)
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';
}

/** Hasil pemeriksaan kredensial ke server Midtrans. */
export interface HasilTesKoneksi {
  berhasil: boolean;
  /** Kalimat pendek untuk ditampilkan. TIDAK PERNAH memuat kunci apa pun. */
  pesan: string;
}

/** Berapa lama menunggu Midtrans sebelum menyerah. */
const TIMEOUT_TES_MS = 8_000;

/**
 * Uji apakah Server Key sebuah mode benar-benar diterima Midtrans.
 *
 * Caranya menanyakan status sebuah `order_id` yang pasti tidak ada. Jawaban
 * Midtrans memisahkan dua hal yang ingin kita bedakan:
 *
 *   - **401** — kuncinya yang ditolak. Ini kegagalan yang kita cari.
 *   - **404** — kuncinya diterima, transaksinya saja yang tidak ada. Justru
 *     inilah bukti kredensialnya sah.
 *
 * Tidak ada transaksi yang dibuat, jadi tombol "Tes Koneksi" aman ditekan
 * berkali-kali dan tidak meninggalkan apa pun di dasbor Midtrans pemilik.
 *
 * Tidak pernah melempar: kegagalan jaringan pun kembali sebagai
 * `{ berhasil: false }` dengan kalimat yang bisa dibaca pemilik kafe.
 */
export async function tesKoneksiMidtrans(
  kredensial: KredensialMidtrans,
): Promise<HasilTesKoneksi> {
  // Awalan `CAFEOS-PING-` membuat baris ini mudah dikenali seandainya muncul
  // di log Midtrans.
  const orderIdUji = `CAFEOS-PING-${Date.now()}`;
  const url = `${baseUrlMidtrans(kredensial.mode)}/v2/${orderIdUji}/status`;
  const auth = Buffer.from(`${kredensial.serverKey}:`).toString('base64');

  const pembatal = AbortSignal.timeout(TIMEOUT_TES_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
      signal: pembatal,
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    return {
      berhasil: false,
      pesan: timeout
        ? 'Server Midtrans tidak menjawab dalam 8 detik. Coba lagi sebentar lagi.'
        : 'Server Midtrans tidak bisa dihubungi dari server CafeOS.',
    };
  }

  if (response.status === 401 || response.status === 403) {
    const namaMode = isProduction(kredensial.mode) ? 'Production' : 'Sandbox';
    return {
      berhasil: false,
      pesan:
        `Server Key ditolak Midtrans di lingkungan ${namaMode}. Pastikan kunci ` +
        `ini disalin dari tab ${namaMode} dasbor Midtrans (Settings → Access Keys). ` +
        'Awalan "SB-" tidak menentukan apa pun — sebagian akun Sandbox memang tidak memilikinya.',
    };
  }

  // 404 & 200 sama-sama berarti kredensialnya diterima.
  if (response.status === 404 || response.ok) {
    return { berhasil: true, pesan: 'Kredensial diterima Midtrans.' };
  }

  // Status lain: laporkan kodenya saja. Body balasan tidak ikut ditampilkan —
  // isinya di luar kendali kami dan bisa memuat apa saja.
  return {
    berhasil: false,
    pesan: `Midtrans membalas dengan kode ${response.status}.`,
  };
}

/**
 * URL notifikasi (webhook) yang harus didaftarkan pemilik di dasbor Midtrans.
 *
 * `cafeId` ada di dalamnya supaya server tahu kredensial siapa yang dipakai
 * memverifikasi signature. Itu SATU-SATUNYA gunanya — bukan mekanisme
 * keamanan. Yang menentukan sebuah notifikasi sah adalah `signature_key`-nya,
 * dan pesanan yang disentuhnya tetap disaring `cafeId` yang sama.
 */
export function urlWebhookMidtrans(cafeId: string): string {
  const base = (process.env.PUBLIC_API_URL || process.env.PUBLIC_APP_URL || '').replace(
    /\/+$/,
    '',
  );
  return `${base}/api/pembayaran/notifikasi/${cafeId}`;
}
