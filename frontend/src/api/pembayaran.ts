import type { KodeMetode, ModeMidtrans } from '../types/api';
import type {
  AuditPembayaranDTO,
  CashierOrderDTO,
  DokuBuatDTO,
  MetodePembayaranDTO,
  MidtransBuatDTO,
  OpsiPembayaranDTO,
  PaymentConfigDTO,
  PengaturanPembayaranDTO,
  StatusPembayaranDTO,
  StatusWebhookDTO,
  TesKoneksiDTO,
  UnggahanDTO,
} from '../types/api';
import { apiFetch } from '../lib/apiClient';

// Endpoint pembayaran, tiga kelompok:
//
//   1. Pengaturan (OWNER)  — `/api/cafe/payment-settings/*`. cafeId dari token,
//      tidak pernah dari URL, jadi tidak ada id yang bisa ditebak untuk
//      menyeberang ke kafe lain.
//   2. Kasir (KASIR/OWNER) — menagih & memverifikasi pembayaran manual.
//   3. Pelanggan (publik)  — checkout & status; tamu di meja tidak punya akun.
//
// TIDAK ADA fungsi di berkas ini yang mengirim atau menerima Server Key
// Midtrans. Kunci itu hanya berjalan satu arah: dari kolom isian ke server,
// lewat `simpanKredensial`, dan tidak pernah kembali.

const id = encodeURIComponent;

export interface MetodeAktifItem {
  metode: KodeMetode;
  aktif: boolean;
  tersediaDiKasir: boolean;
  tersediaDiCheckout: boolean;
  wajibVerifikasiKasir: boolean;
}

/** Body PUT konfigurasi rinci satu metode. */
export interface KonfigurasiMetodeInput {
  tersediaDiKasir?: boolean;
  tersediaDiCheckout?: boolean;
  wajibVerifikasiKasir?: boolean;
  instruksi?: string | null;
  batasWaktuMenit?: number | null;
  qrisImageUrl?: string | null;
  qrisImagePublicId?: string | null;
  qrisMerchantName?: string | null;
  qrisNmid?: string | null;
  bankNama?: string | null;
  bankNomorRekening?: string | null;
  bankAtasNama?: string | null;
  edcProvider?: string | null;
  edcTerminalLabel?: string | null;
}

export interface KredensialInput {
  clientKey?: string | null;
  /** Hanya dikirim saat diganti — server tidak pernah mengirimkannya balik. */
  serverKey?: string;
}

export interface ManualPaymentInput {
  orderId: string;
  metode: KodeMetode;
  nominal: number;
  catatanKasir?: string;
  referensi?: string;
}

export interface PermintaanManualInput {
  orderId: string;
  metode: KodeMetode;
  referensi?: string;
  buktiUrl?: string;
  buktiPublicId?: string;
}

export interface RiwayatQuery {
  status?: string;
  dari?: string;
  sampai?: string;
}

/** Kirim satu berkas gambar pada field `foto` (bentuk yang diterima server). */
function bodyFoto(file: File): FormData {
  const form = new FormData();
  form.append('foto', file);
  return form;
}

export const pembayaranApi = {
  // ── Pengaturan (OWNER) ───────────────────────────────────────────────────

  /** Seluruh pengaturan pembayaran kafe. */
  getSettings(): Promise<PengaturanPembayaranDTO> {
    return apiFetch<PengaturanPembayaranDTO>('/api/cafe/payment-settings');
  },

  /** Simpan sakelar aktif/kanal SELURUH metode sekaligus. */
  simpanMetode(metode: MetodeAktifItem[]): Promise<PengaturanPembayaranDTO> {
    return apiFetch<PengaturanPembayaranDTO>('/api/cafe/payment-settings/metode', {
      method: 'PUT',
      body: JSON.stringify({ metode }),
    });
  },

  /** Simpan rincian satu metode (QRIS, rekening bank, EDC). */
  simpanKonfigurasiMetode(
    metode: KodeMetode,
    input: KonfigurasiMetodeInput,
  ): Promise<MetodePembayaranDTO> {
    return apiFetch<MetodePembayaranDTO>(
      `/api/cafe/payment-settings/metode/${id(metode)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  },

  /** Unggah gambar QRIS statis. */
  unggahQris(file: File): Promise<UnggahanDTO> {
    return apiFetch<UnggahanDTO>('/api/cafe/payment-settings/qris', {
      method: 'POST',
      body: bodyFoto(file),
    });
  },

  /** Simpan/ganti kredensial Midtrans untuk SATU mode. */
  simpanKredensial(
    mode: ModeMidtrans,
    input: KredensialInput,
  ): Promise<PengaturanPembayaranDTO> {
    return apiFetch<PengaturanPembayaranDTO>(
      `/api/cafe/payment-settings/midtrans/${id(mode)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  },

  /** Putuskan integrasi Midtrans pada satu mode. */
  putusKredensial(mode: ModeMidtrans): Promise<PengaturanPembayaranDTO> {
    return apiFetch<PengaturanPembayaranDTO>(
      `/api/cafe/payment-settings/midtrans/${id(mode)}`,
      { method: 'DELETE' },
    );
  },

  /** Uji kredensial sebuah mode ke server Midtrans. */
  tesKoneksi(mode: ModeMidtrans): Promise<TesKoneksiDTO> {
    return apiFetch<TesKoneksiDTO>(
      `/api/cafe/payment-settings/midtrans/${id(mode)}/tes-koneksi`,
      { method: 'POST' },
    );
  },

  /** Status notifikasi (webhook) sebuah mode. */
  statusWebhook(mode: ModeMidtrans): Promise<StatusWebhookDTO> {
    return apiFetch<StatusWebhookDTO>(
      `/api/cafe/payment-settings/midtrans/${id(mode)}/webhook`,
    );
  },

  /** Ganti mode aktif kafe. Syaratnya ditegakkan server. */
  setMode(mode: ModeMidtrans): Promise<PengaturanPembayaranDTO> {
    return apiFetch<PengaturanPembayaranDTO>(
      '/api/cafe/payment-settings/midtrans-mode',
      { method: 'PUT', body: JSON.stringify({ mode }) },
    );
  },

  /** Jejak audit perubahan & keputusan pembayaran. */
  audit(limit = 50): Promise<AuditPembayaranDTO[]> {
    return apiFetch<AuditPembayaranDTO[]>(
      `/api/cafe/payment-settings/audit?limit=${limit}`,
    );
  },

  // ── Kasir ────────────────────────────────────────────────────────────────

  /** Konfigurasi ringkas untuk modal kasir (peran KASIR boleh membacanya). */
  getConfig(): Promise<PaymentConfigDTO> {
    return apiFetch<PaymentConfigDTO>('/api/cafe/payment-config');
  },

  /** Kasir MENERIMA pembayaran manual; balasannya pesanan versi terbayar. */
  konfirmasiManual(input: ManualPaymentInput): Promise<CashierOrderDTO> {
    return apiFetch<{ berhasil: boolean; order: CashierOrderDTO }>(
      '/api/pembayaran/manual',
      { method: 'POST', body: JSON.stringify(input) },
    ).then((res) => res.order);
  },

  /** Kasir MENOLAK pengajuan pembayaran manual. Alasan wajib. */
  tolakManual(orderId: string, alasan: string): Promise<CashierOrderDTO> {
    return apiFetch<{ berhasil: boolean; order: CashierOrderDTO }>(
      '/api/pembayaran/manual/tolak',
      { method: 'POST', body: JSON.stringify({ orderId, alasan }) },
    ).then((res) => res.order);
  },

  /** Antrean pengajuan pembayaran yang menunggu diperiksa kasir. */
  menungguVerifikasi(): Promise<CashierOrderDTO[]> {
    return apiFetch<CashierOrderDTO[]>('/api/pembayaran/menunggu-verifikasi');
  },

  // ── Pelanggan (publik) ───────────────────────────────────────────────────

  /** Metode yang tersedia di checkout sebuah kafe. */
  opsi(cafeId: string): Promise<OpsiPembayaranDTO> {
    return apiFetch<OpsiPembayaranDTO>(`/api/cafes/${id(cafeId)}/pembayaran/opsi`);
  },

  /**
   * Ajukan pembayaran manual dari checkout.
   *
   * TIDAK membuat pesanan menjadi lunas: hasilnya pesanan berstatus
   * `AWAITING_VERIFICATION` yang menunggu kasir.
   */
  ajukanManual(input: PermintaanManualInput): Promise<StatusPembayaranDTO> {
    return apiFetch<StatusPembayaranDTO>('/api/pembayaran/manual/ajukan', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Unggah bukti pembayaran untuk sebuah pesanan. */
  unggahBukti(orderId: string, file: File): Promise<UnggahanDTO> {
    return apiFetch<UnggahanDTO>(`/api/pembayaran/${id(orderId)}/bukti`, {
      method: 'POST',
      body: bodyFoto(file),
    });
  },

  /** Buat transaksi Midtrans (Snap) untuk sebuah pesanan. */
  buatMidtrans(orderId: string): Promise<MidtransBuatDTO> {
    return apiFetch<MidtransBuatDTO>('/api/pembayaran/midtrans/buat', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  },

  /** Buat tagihan DOKU Checkout untuk sebuah pesanan (gateway platform). */
  buatDoku(orderId: string): Promise<DokuBuatDTO> {
    return apiFetch<DokuBuatDTO>('/api/pembayaran/doku/buat', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    });
  },

  /**
   * Status pembayaran sebuah pesanan (untuk polling). Menerima id pesanan
   * CafeOS maupun `order_id` Midtrans.
   */
  status(orderId: string): Promise<StatusPembayaranDTO> {
    return apiFetch<StatusPembayaranDTO>(`/api/pembayaran/${id(orderId)}/status`);
  },

  /** Riwayat pembayaran kafe. */
  riwayat(query: RiwayatQuery = {}): Promise<CashierOrderDTO[]> {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.dari) params.set('dari', query.dari);
    if (query.sampai) params.set('sampai', query.sampai);
    const qs = params.toString();
    return apiFetch<CashierOrderDTO[]>(`/api/pembayaran/riwayat${qs ? `?${qs}` : ''}`);
  },
};
