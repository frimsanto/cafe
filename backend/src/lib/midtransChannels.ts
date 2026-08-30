import type { MidtransMode } from '@prisma/client';

/**
 * Kanal pembayaran Snap Midtrans — penentu `enabled_payments`.
 *
 * ── Kenapa berkas ini ada ──
 *
 * `enabled_payments` dulu ditulis sebagai literal di tengah `buatMidtrans`:
 *
 *   ['qris', 'gopay', 'ovo', 'bca_va', 'bni_va', 'mandiri_bill']
 *
 * Tiga dari enam nilai itu BUKAN identifier Snap. Midtrans tidak menolak
 * permintaannya — nilai yang tak dikenal cuma diabaikan diam-diam — sehingga
 * daftar itu efektif menyusut menjadi `gopay`, `bca_va`, `bni_va` saja. Di
 * laptop kekeliruan itu tidak terlihat: GoPay pada layar lebar digambar sebagai
 * QR, lengkap dengan tombol unduh, jadi orang mengira QRIS-nya muncul. Di HP
 * GoPay berubah menjadi deeplink ke aplikasi Gojek, dan karena kanal QRIS yang
 * sesungguhnya tidak pernah ikut dinyalakan, tidak ada QR apa pun yang tersisa
 * untuk ditampilkan.
 *
 * Karena itu daftar kanal tidak boleh lagi ditulis sebagai teks bebas di dalam
 * pemanggilan API. Ia disusun di sini, dari katalog identifier resmi, dan
 * SETIAP nilai yang tidak dikenal dibuang sebelum dikirim — supaya salah ketik
 * berikutnya gagal dengan berisik, bukan menghilangkan satu metode pembayaran
 * selama berbulan-bulan tanpa ada yang menyadarinya.
 *
 * ── Yang TIDAK pernah lewat sini ──
 *
 * Server Key tidak dibutuhkan untuk menyusun daftar kanal, jadi ia tidak pernah
 * masuk parameter, log, maupun pesan galat mana pun di bawah.
 */

/**
 * Identifier `enabled_payments` yang benar-benar dikenal Snap.
 *
 * Sumbernya dokumentasi resmi Midtrans (Snap → Payment Method). Katalog ini
 * sengaja lebih luas daripada yang dipakai CafeOS hari ini: fungsinya sebagai
 * DAFTAR PUTIH bagi nilai yang datang dari konfigurasi, bukan sebagai daftar
 * yang dikirim apa adanya.
 */
export const KANAL_SNAP_DIKENAL = [
  // QRIS dinamis — satu QR yang bisa dipindai SEMUA aplikasi berlisensi QRIS
  // (GoPay, OVO, DANA, ShopeePay, mobile banking). Inilah kanal yang membuat QR
  // muncul di HP; tanpa nilai ini Snap mobile tidak punya QRIS untuk
  // ditampilkan sama sekali.
  'other_qris',
  // E-wallet dengan alurnya sendiri (deeplink di HP, QR di desktop).
  'gopay',
  'shopeepay',
  // Virtual Account.
  'bca_va',
  'bni_va',
  'bri_va',
  'cimb_va',
  'permata_va',
  'other_va',
  // Mandiri Bill Payment. Identifier resminya `echannel` — BUKAN
  // `mandiri_bill`, yang tidak pernah dikenal Snap.
  'echannel',
  // Grup transfer bank (Snap menampilkan seluruh VA yang aktif di akun).
  'bank_transfer',
  // Kartu.
  'credit_card',
  // Gerai retail.
  'indomaret',
  'alfamart',
  // Paylater / cicilan.
  'akulaku',
  'kredivo',
  'uob_ezpay',
  // Internet banking.
  'bca_klikpay',
  'bca_klikbca',
  'cimb_clicks',
  'bri_epay',
  'danamon_online',
] as const;

export type KanalSnap = (typeof KANAL_SNAP_DIKENAL)[number];

/**
 * Kanal QRIS DINAMIS Midtrans.
 *
 * Hanya untuk QR yang DITERBITKAN Midtrans per transaksi: nominalnya terkunci,
 * ada masa berlakunya, dan hasilnya diverifikasi lewat webhook. QRIS STATIS
 * milik kafe adalah hal yang sama sekali berbeda — QR tetap yang dipasang di
 * meja, tidak pernah menyentuh Snap, dan pembayarannya selalu menunggu kasir
 * (kode `QRIS_STATIS` di `paymentMethods.ts`). Keduanya tidak boleh
 * dipertukarkan.
 */
export const KANAL_QRIS_DINAMIS: KanalSnap = 'other_qris';

/**
 * Nilai yang sering dikira benar tapi bukan identifier Snap.
 *
 * Dipisah dari "tidak dikenal" biasa supaya log bisa menyebut penggantinya.
 * `qris` khususnya: ia identifier Core API untuk `payment_type`, dan justru
 * karena terasa benar ia bertahan lama di `enabled_payments` tanpa efek apa pun.
 */
const SALAH_KAPRAH: Record<string, KanalSnap> = {
  qris: 'other_qris',
  qris_dynamic: 'other_qris',
  qris_dinamis: 'other_qris',
  qris_statis: 'other_qris',
  mandiri_bill: 'echannel',
  // OVO & DANA tidak punya kanal Snap tersendiri; keduanya dibayar dengan
  // memindai QRIS yang sama.
  ovo: 'other_qris',
  dana: 'other_qris',
};

function normalkan(nilai: string): string {
  return nilai.trim().toLowerCase();
}

export function isKanalSnap(nilai: unknown): nilai is KanalSnap {
  return (
    typeof nilai === 'string' &&
    (KANAL_SNAP_DIKENAL as readonly string[]).includes(normalkan(nilai))
  );
}

/**
 * Kanal yang ditawarkan CafeOS di checkout pelanggan, sesuai urutan tampilnya.
 *
 * Isinya adalah niat daftar lama yang dieja dengan benar — bukan daftar yang
 * diperluas. Metode yang dulu memang dimaksudkan ada tetap ada; yang berubah
 * hanya ejaannya menjadi identifier yang sungguh dibaca Snap:
 *
 *   qris         → other_qris   (kanal QRIS dinamis yang sesungguhnya)
 *   ovo          → other_qris   (OVO dibayar dengan memindai QRIS itu juga)
 *   mandiri_bill → echannel     (identifier resmi Mandiri Bill Payment)
 *
 * QRIS ditaruh paling depan supaya Snap menampilkannya lebih dulu, di layar
 * apa pun.
 *
 * Kanal yang TIDAK aktif di akun Midtrans kafe tidak perlu disaring di sini:
 * Snap hanya menampilkan yang benar-benar aktif pada akun itu. Menyebut kanal
 * yang belum diaktifkan tidak menimbulkan galat dan tidak menyembunyikan kanal
 * lain — yang berbahaya justru kebalikannya, yaitu TIDAK menyebut kanal yang
 * seharusnya tampil.
 */
const KANAL_CHECKOUT_BAWAAN: readonly KanalSnap[] = [
  KANAL_QRIS_DINAMIS,
  'gopay',
  'bca_va',
  'bni_va',
  'echannel',
];

/**
 * Penyetelan tingkat DEPLOYMENT: `MIDTRANS_ENABLED_PAYMENTS`.
 *
 * Dipakai bila operator perlu mengubah kanal yang ditawarkan tanpa menyentuh
 * kode — misalnya menyalakan `credit_card` untuk seluruh kafe di satu server,
 * atau mematikan `echannel` yang tidak dipakai. Kosong (bawaan) berarti pakai
 * katalog di atas.
 *
 * Nilainya dibaca setiap kali dipanggil, bukan sekali saat modul dimuat: PM2
 * membekukan environment saat start, dan membaca ulang membuat
 * `pm2 restart --update-env` cukup untuk menerapkan perubahannya.
 */
function kanalDariEnv(): KanalSnap[] | null {
  const mentah = process.env.MIDTRANS_ENABLED_PAYMENTS;
  if (!mentah || mentah.trim() === '') return null;

  const diminta = mentah
    .split(',')
    .map(normalkan)
    .filter((n) => n !== '');

  const sah: KanalSnap[] = [];
  const ditolak: string[] = [];
  for (const nilai of diminta) {
    if (isKanalSnap(nilai)) {
      sah.push(nilai as KanalSnap);
      continue;
    }
    const pengganti = SALAH_KAPRAH[nilai];
    if (pengganti) {
      console.warn(
        `[midtrans] MIDTRANS_ENABLED_PAYMENTS: "${nilai}" bukan identifier Snap — dipakai "${pengganti}"`,
      );
      sah.push(pengganti);
      continue;
    }
    ditolak.push(nilai);
  }

  if (ditolak.length > 0) {
    console.warn(
      `[midtrans] MIDTRANS_ENABLED_PAYMENTS: nilai tidak dikenal diabaikan — ${ditolak.join(', ')}`,
    );
  }

  // Seluruh isinya tak terpakai → jangan kirim daftar kosong. `enabled_payments`
  // kosong membuat Snap menampilkan NOL metode; jatuh ke katalog bawaan jauh
  // lebih baik daripada halaman bayar yang tidak bisa dipakai.
  if (sah.length === 0) {
    console.warn(
      '[midtrans] MIDTRANS_ENABLED_PAYMENTS tidak memuat satu pun kanal yang dikenal — memakai katalog bawaan',
    );
    return null;
  }
  return sah;
}

export interface OpsiEnabledPayments {
  /** Kafe yang bertransaksi — sudah diturunkan dari pesanan, bukan dari klien. */
  cafeId: string;
  /** Mode kredensial yang dipakai. Sandbox & Production tidak pernah dicampur. */
  mode: MidtransMode;
  /**
   * Kanal yang dipilih pemilik kafe, bila suatu saat CafeOS menyimpannya.
   *
   * Hari ini pengaturan pembayaran kafe hanya punya sakelar Midtrans
   * nyala/mati (kredensialnya ada atau tidak) — belum ada pilihan per kanal.
   * Parameter ini disediakan supaya penambahannya nanti cukup mengisi SATU
   * tempat, bukan menyebarkan literal baru ke dalam pemanggilan Snap lagi.
   */
  kanalPilihanKafe?: readonly string[] | null;
  /** QRIS dinamis ditawarkan di checkout ini. Default: ya. */
  qrisDinamis?: boolean;
}

/**
 * Susun `enabled_payments` untuk SATU transaksi.
 *
 * Selalu mengembalikan daftar yang tidak kosong dan bebas kembar, berisi
 * identifier Snap saja. Bila QRIS dinamis menyala, `other_qris` DIJAMIN ikut —
 * itulah satu-satunya hal yang membuat QR muncul di HP maupun di laptop.
 */
export function bangunEnabledPayments(opsi: OpsiEnabledPayments): KanalSnap[] {
  const qrisDinamis = opsi.qrisDinamis ?? true;

  const pilihanKafe = (opsi.kanalPilihanKafe ?? [])
    .map(normalkan)
    .map((n) => (isKanalSnap(n) ? (n as KanalSnap) : SALAH_KAPRAH[n]))
    .filter((n): n is KanalSnap => Boolean(n));

  const dasar: readonly KanalSnap[] =
    pilihanKafe.length > 0 ? pilihanKafe : (kanalDariEnv() ?? KANAL_CHECKOUT_BAWAAN);

  // QRIS dinamis didahulukan, lalu sisanya menurut urutan sumbernya. `Set`
  // membuang yang kembar tanpa mengubah urutan yang tersisa.
  const urut = qrisDinamis ? [KANAL_QRIS_DINAMIS, ...dasar] : dasar;
  const hasil = [...new Set(urut)].filter((k) =>
    qrisDinamis ? true : k !== KANAL_QRIS_DINAMIS,
  );

  // Pengaman terakhir: mematikan QRIS pada konfigurasi yang isinya HANYA QRIS
  // menyisakan daftar kosong, dan Snap kosong berarti tidak ada yang bisa
  // dibayar. Kembalikan katalog bawaan tanpa QRIS.
  if (hasil.length === 0) {
    return KANAL_CHECKOUT_BAWAAN.filter((k) => k !== KANAL_QRIS_DINAMIS);
  }
  return hasil;
}
