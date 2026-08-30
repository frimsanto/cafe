// Nama-nama DTO sesuai penamaan backend (`backend/src/dto/*.ts`).
//
// Bentuk pesanan sudah didefinisikan sekali di `types/order.ts` dan dipakai
// bersama; di sini hanya dibuat aliasnya supaya kode yang berbicara dalam
// istilah API tetap terbaca wajar, tanpa ada dua definisi yang bisa melenceng.

import type {
  FulfillmentType,
  ManualMethodCode,
  Order,
  OrderItem,
  OrderSource,
  Payment,
  StatusPembayaran,
} from './order';

export type OrderDTO = Order;
export type OrderItemDTO = OrderItem;
export type PaymentDTO = Payment;

/**
 * Pesanan yang dipastikan membawa identitas tujuannya — dipakai layar kasir dan
 * Layar Dapur. Keduanya memanggil tamu dengan nama meja, atau nomor antrian
 * bila pesanannya dibawa pulang (`tableName` null); lihat `labelTujuan()` di
 * `lib/orderStatus.ts`.
 */
export interface OrderWithTableDTO extends Order {
  tableName: string | null;
}

/** Nama lama yang masih dipakai modul kasir. */
export type CashierOrderDTO = OrderWithTableDTO;

// ── Layar kasir (POS) ────────────────────────────────────────────────────────

/** Tab pada layar kasir; nilainya ikut menjadi parameter query `tab`. */
export type TabKasir =
  | 'PERLU_KONFIRMASI'
  | 'SUDAH_DIBAYAR'
  | 'SEDANG_DIPROSES'
  | 'SELESAI'
  | 'SEMUA';

export interface FilterKasir {
  tab: TabKasir;
  /** Kode pesanan, nomor antrian, nama meja, atau nama pelanggan. */
  q: string;
  fulfillmentType: FulfillmentType | null;
  orderSource: OrderSource | null;
  statusPembayaran: StatusPembayaran | null;
}

/** GET /api/cafes/:cafeId/cashier/summary */
export interface RingkasanKasirDTO {
  perluKonfirmasi: number;
  sudahDibayar: number;
  sedangDiproses: number;
  selesaiHariIni: number;
  /** Uang yang MASUK hari ini, menurut jam dinding kafe. */
  totalHariIni: number;
  transaksiHariIni: number;
  sejak: string;
}

/** Meja sebagaimana dilihat layar kasir saat memilih tujuan pesanan. */
export interface MejaKasirDTO {
  id: string;
  tableName: string;
  status: 'TERSEDIA' | 'TERISI' | 'MENUNGGU_PEMBAYARAN';
  activeOrderCount: number;
  unpaidOrderCount: number;
}

/**
 * Body POST /api/cafes/:cafeId/cashier/orders.
 *
 * TIDAK ADA harga maupun total di sini, dan itu disengaja: tagihannya dihitung
 * ulang server dari tabel menu. Kalau suatu saat ada field harga yang
 * ditambahkan, itu bug — bukan fitur.
 */
export interface BuatPesananKasirInput {
  fulfillmentType: FulfillmentType;
  /** Wajib untuk DINE_IN; diabaikan server untuk TAKEAWAY. */
  tableId: string | null;
  customerName: string | null;
  catatan: string | null;
  items: { menuItemId: string; quantity: number; notes: string }[];
  pembayaran: {
    metode: ManualMethodCode;
    /** Uang yang DITERIMA kasir — untuk tunai bisa lebih dari tagihan. */
    nominal: number;
    catatanKasir: string | null;
    referensi: string | null;
  };
  /** Kunci anti-kirim-ganda; satu per keranjang. */
  idempotencyKey: string;
}

/** Meja + kafe hasil pemindaian QR pelanggan (`GET /api/tables/by-qr/:qrCode`). */
export interface PublicTableDTO {
  tableId: string;
  tableName: string;
  cafeId: string;
  cafeName: string;
}

/** Meja lengkap untuk halaman Manajemen Meja. */
export interface TableDTO {
  id: string;
  cafeId: string;
  tableName: string;
  qrCode: string;
  /** URL lengkap yang dienkode ke QR — ditentukan server, bukan peramban. */
  menuUrl: string;
}

export interface TableWithStatusDTO extends TableDTO {
  status: 'KOSONG' | 'DIGUNAKAN';
  activeOrderCount: number;
}

/** Ringkasan omzet satu periode. */
export interface RevenueSummaryDTO {
  period: 'today' | 'week' | 'month';
  from: string;
  to: string;
  revenue: number;
  orderCount: number;
  previous: {
    revenue: number;
    orderCount: number;
  };
  /** Pertumbuhan vs periode sebelumnya (persen); null bila tak ada pembanding. */
  growthPercent: number | null;
}

/** Satu batang pada grafik tren omzet. */
export interface RevenueTrendPointDTO {
  /** Tanggal lokal `YYYY-MM-DD`. */
  date: string;
  /** Label sumbu X: nama hari (7d) atau `DD/MM` (30d). */
  label: string;
  totalRevenue: number;
  totalOrders: number;
}

export interface RevenueTrendDTO {
  period: '7d' | '30d';
  trend: RevenueTrendPointDTO[];
  summary: {
    todayRevenue: number;
    todayOrders: number;
    yesterdayRevenue: number;
    yesterdayOrders: number;
    /** Positif = naik, negatif = turun; null bila kemarin nol. */
    todayVsYesterdayPercent: number | null;
  };
}

export interface TopMenuItemDTO {
  menuItemId: string;
  name: string;
  imageUrl: string;
  soldCount: number;
}

// ── Pengaturan pembayaran ────────────────────────────────────────────────────
//
// SATU hal yang berlaku untuk SEMUA bentuk di bawah: tidak ada `serverKey`.
// Server Key Midtrans tidak pernah dikirim balik dalam bentuk apa pun — yang
// ada hanya `serverKeyTersimpan` dan empat karakter terakhirnya sebagai
// penanda. Kalau suatu saat ada yang menambahkan field kunci di sini, itu
// bug, bukan fitur.

/** Kode metode manual yang dikenal server. */
export type KodeMetode = 'TUNAI' | 'QRIS_STATIS' | 'TRANSFER' | 'EDC';

export type StatusIntegrasiMidtrans =
  | 'BELUM_DIKONFIGURASI'
  | 'PERLU_DIMASUKKAN_ULANG'
  | 'KONFIGURASI_SERVER'
  | 'KREDENSIAL_TERSIMPAN'
  | 'KONEKSI_GAGAL'
  | 'SIAP';

/** Keadaan satu slot kredensial — cermin `StatusKredensial` di backend. */
export type StatusKredensialMidtrans =
  | 'BELUM_DIKONFIGURASI'
  | 'TERSIMPAN'
  | 'PERLU_DIMASUKKAN_ULANG'
  | 'KONFIGURASI_SERVER';

export type ModeMidtrans = 'SANDBOX' | 'PRODUCTION';

/** Konfigurasi satu metode pembayaran manual milik kafe. */
export interface MetodePembayaranDTO {
  metode: KodeMetode;
  aktif: boolean;
  tersediaDiKasir: boolean;
  tersediaDiCheckout: boolean;
  /** Aturan domain server: metode ini boleh dipakai tamu sendiri atau tidak. */
  bolehDiCheckout: boolean;
  wajibVerifikasiKasir: boolean;
  instruksi: string | null;
  batasWaktuMenit: number | null;
  qrisImageUrl: string | null;
  qrisMerchantName: string | null;
  qrisNmid: string | null;
  bankNama: string | null;
  bankNomorRekening: string | null;
  bankAtasNama: string | null;
  edcProvider: string | null;
  edcTerminalLabel: string | null;
  /** Isian wajibnya sudah lengkap — sakelarnya boleh dinyalakan. */
  konfigurasiLengkap: boolean;
}

/** Keadaan kredensial Midtrans untuk SATU mode. */
export interface KredensialMidtransDTO {
  mode: ModeMidtrans;
  clientKey: string | null;
  /** Tersimpan DAN terbaca server. Tak terbaca = false, bukan true. */
  serverKeyTersimpan: boolean;
  serverKeyPetunjuk: string | null;
  /** Keadaan slot ini dalam satu kata. */
  statusKredensial: StatusKredensialMidtrans;
  /** Ciphertext ada tapi tidak bisa dibuka — pemilik harus mengetik ulang. */
  perluDimasukkanUlang: boolean;
  /** ENCRYPTION_KEY server hilang. Mengetik ulang kunci TIDAK menolong. */
  masalahKonfigurasiServer: boolean;
  /** BELUM_DIUJI | BERHASIL | GAGAL */
  statusKoneksi: string;
  koneksiDiperiksa: string | null;
  koneksiPesan: string | null;
  /** BELUM_DIPERIKSA | TERVERIFIKASI | GAGAL */
  statusWebhook: string;
  webhookDiperiksa: string | null;
  lengkap: boolean;
}

/** GET /api/cafe/payment-settings — hanya untuk OWNER. */
export interface PengaturanPembayaranDTO {
  cafeId: string;
  metode: MetodePembayaranDTO[];
  midtrans: {
    modeAktif: ModeMidtrans;
    kredensial: KredensialMidtransDTO[];
    statusIntegrasi: StatusIntegrasiMidtrans;
    /** Boleh membuat transaksi sekarang (kredensial mode aktif tersedia). */
    bisaTransaksi: boolean;
    /** Syarat yang belum terpenuhi untuk menyalakan Production. */
    penghalangProduction: string[];
    webhookUrl: string;
  };
  jumlahMetodeAktif: number;
}

/** Hasil POST .../midtrans/:mode/tes-koneksi. */
export interface TesKoneksiDTO {
  berhasil: boolean;
  pesan: string;
  pengaturan: PengaturanPembayaranDTO;
}

/** Hasil GET .../midtrans/:mode/webhook. */
export interface StatusWebhookDTO {
  mode: ModeMidtrans;
  status: string;
  diperiksa: string | null;
  webhookUrl: string;
}

/** Satu baris jejak audit pembayaran. */
export interface AuditPembayaranDTO {
  id: string;
  aksi: string;
  actorUserId: string | null;
  actorRole: string | null;
  orderId: string | null;
  nilaiLama: unknown;
  nilaiBaru: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Rincian satu metode yang tersedia pada sebuah kanal (kasir/checkout). */
export interface OpsiMetodeDTO {
  metode: KodeMetode;
  wajibVerifikasiKasir: boolean;
  instruksi: string | null;
  batasWaktuMenit: number | null;
  qrisImageUrl: string | null;
  qrisMerchantName: string | null;
  bankNama: string | null;
  bankNomorRekening: string | null;
  bankAtasNama: string | null;
  edcProvider: string | null;
}

/**
 * GET /api/cafe/payment-config — bentuk ringkas untuk layar kasir.
 *
 * Dipakai peran KASIR, yang tidak boleh membuka `payment-settings` (memuat
 * nomor rekening & keadaan kredensial). Isinya cuma: apa yang boleh ditagih.
 */
export interface PaymentConfigDTO {
  metodeDiterima: string[];
  metodeDetail: OpsiMetodeDTO[];
  /** Kredensial mode aktif tersedia — BUKAN "pernah ada key". */
  midtransAktif: boolean;
  clientKey: string | null;
  isProduction: boolean;
}

/**
 * Metode yang tersedia di sebuah kafe (GET /api/cafes/:cafeId/pembayaran/opsi).
 * Endpoint publik — dibaca halaman checkout pelanggan yang tidak login.
 */
export interface OpsiPembayaranDTO {
  cafeId: string;
  cafeName: string;
  /** Kode metode manual yang tersedia DI CHECKOUT (bukan seluruh yang aktif). */
  metodeDiterima: string[];
  /**
   * Rincian tiap metode checkout — instruksi, gambar QRIS, rekening tujuan.
   * Tamu butuh ini untuk bisa membayar; tidak ada kredensial di dalamnya.
   * Opsional supaya backend versi lama (yang belum mengirimnya) tetap jalan.
   */
  metodeDetail?: OpsiMetodeDTO[];
  midtransAktif: boolean;
  /**
   * True bila DOKU Checkout aktif di platform. Global — kredensialnya milik
   * Fessolution, bukan kafe, jadi tidak ada yang perlu disetel pemilik kafe.
   * Backend lama belum mengirim field ini; `?` menjaga checkout tetap jalan
   * (opsi DOKU sekadar tidak muncul) sampai servernya diperbarui.
   */
  dokuAktif?: boolean;
}

/** Hasil pembuatan transaksi Midtrans (POST /api/pembayaran/midtrans/buat). */
export interface MidtransBuatDTO {
  snapToken: string;
  /** `order_id` Midtrans — dipakai halaman status & polling. */
  orderId: string;
  grossAmount: number;
  clientKey: string | null;
  isProduction: boolean;
}

/** Hasil pembuatan tagihan DOKU (POST /api/pembayaran/doku/buat). */
export interface DokuBuatDTO {
  /** Halaman checkout DOKU — pelanggan diarahkan ke sini untuk membayar. */
  paymentUrl: string;
  /** `invoice_number` DOKU; halaman status juga menerimanya sebagai kunci. */
  invoiceNumber: string;
  grossAmount: number;
}

/** Status pembayaran sebuah pesanan (GET /api/pembayaran/:orderId/status). */
export interface StatusPembayaranDTO {
  /** Kosakata `StatusPembayaran`; lihat `lib/paymentStatus.ts`. */
  status: string;
  /** Label Indonesia siap tampil, dari server. */
  statusLabel?: string;
  metodePembayaran: string | null;
  grossAmount: number;
  updatedAt: string;
  cafeName: string;
  /** Pesanan lengkap — halaman status pelanggan tidak perlu fetch tambahan. */
  pesanan: OrderWithTableDTO;
  /** Terisi bila pesanan ini sedang/pernah menunggu verifikasi kasir. */
  verifikasi?: {
    /** MENUNGGU | DITERIMA | DITOLAK */
    status: string;
    metode: string;
    alasanPenolakan: string | null;
    diverifikasiPada: string | null;
  } | null;
}

/** Hasil unggahan berkas (QRIS statis / bukti pembayaran). */
export interface UnggahanDTO {
  url: string;
  publicId: string;
}
