import type { MetodePembayaranKafe, MidtransCredential, MidtransMode } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import {
  dekripsiAman,
  enkripsiSiap,
  enkripsiTerverifikasi,
  pastikanEnkripsiSiap,
} from '../lib/enkripsi';
import {
  tesKoneksiMidtrans,
  urlWebhookMidtrans,
  type KredensialMidtrans,
} from '../lib/midtrans';
import {
  BOLEH_DI_CHECKOUT,
  MANUAL_METHODS,
  type ManualMethod,
} from '../lib/paymentMethods';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import type {
  KonfigurasiMetodeInput,
  KredensialMidtransInput,
  MetodeAktifInput,
} from '../validation/paymentSettings.validation';

/**
 * Pengaturan pembayaran sebuah kafe — SATU pintu untuk seluruh konfigurasi.
 *
 * `cafeId` di setiap fungsi SELALU berasal dari token pemanggil, tidak pernah
 * dari body/URL. Itu sebabnya tidak ada satu pun endpoint di modul ini yang
 * menerima `cafeId` sebagai parameter klien: tenant A tidak punya cara menyebut
 * konfigurasi tenant B, bahkan dengan menebak id-nya.
 *
 * ── Yang TIDAK PERNAH keluar dari sini ──
 * Server Key Midtrans. Tidak dalam respons GET, tidak dalam pesan galat, tidak
 * dalam audit log. Yang dikirim ke klien hanya `serverKeyTersimpan: true/false`
 * dan 4 karakter terakhirnya sebagai petunjuk. Client Key memang publik
 * (Snap.js membutuhkannya di browser) sehingga aman dikirim — tetap hanya ke
 * kafe pemiliknya.
 */

// ── Bentuk data yang aman dikirim ke klien ───────────────────────────────────

/**
 * Status integrasi Midtrans mode aktif — SATU kata untuk satu keadaan.
 *
 * `PERLU_DIMASUKKAN_ULANG` dan `KONFIGURASI_SERVER` adalah dua keadaan yang
 * dulu tidak punya nama, sehingga keduanya menyamar sebagai
 * `KREDENSIAL_TERSIMPAN` — badge hijau di sebelah kalimat "kredensial tidak
 * bisa dibaca". Sekarang keduanya berdiri sendiri, dan tindak lanjutnya beda:
 * yang satu pekerjaan pemilik kafe, yang satu pekerjaan operator server.
 */
export type StatusIntegrasi =
  | 'BELUM_DIKONFIGURASI'
  | 'PERLU_DIMASUKKAN_ULANG'
  | 'KONFIGURASI_SERVER'
  | 'KREDENSIAL_TERSIMPAN'
  | 'KONEKSI_GAGAL'
  | 'SIAP';

/** Keadaan satu slot kredensial, dilihat dari bisa-tidaknya ia DIPAKAI. */
export type StatusKredensial =
  | 'BELUM_DIKONFIGURASI'
  | 'TERSIMPAN'
  | 'PERLU_DIMASUKKAN_ULANG'
  | 'KONFIGURASI_SERVER';

export interface MetodeDTO {
  metode: ManualMethod;
  aktif: boolean;
  tersediaDiKasir: boolean;
  tersediaDiCheckout: boolean;
  /** Aturan domain: metode ini boleh dipakai tamu sendiri atau tidak. */
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
  /** Konfigurasi wajibnya sudah lengkap — metode siap dinyalakan. */
  konfigurasiLengkap: boolean;
}

export interface KredensialModeDTO {
  mode: MidtransMode;
  clientKey: string | null;
  /**
   * Server Key tersimpan DAN terbaca. Kuncinya SENDIRI tidak pernah ikut.
   *
   * Artinya berubah dari "kolomnya terisi" menjadi "kolomnya terisi dan
   * ciphertext-nya bisa dibuka". Itu perbaikannya: baris yang ada tapi tak
   * terbaca dulu tetap dilaporkan tersimpan, sehingga layar menampilkan
   * "Kredensial tersimpan" bersamaan dengan "tidak bisa dibaca".
   */
  serverKeyTersimpan: boolean;
  /** 4 karakter terakhir Server Key — sekadar penanda kunci mana yang tersimpan. */
  serverKeyPetunjuk: string | null;
  /** Keadaan slot ini dalam satu kata — lihat `StatusKredensial`. */
  statusKredensial: StatusKredensial;
  /** Ada ciphertext, tapi tidak bisa dibuka: pemilik harus mengetik ulang. */
  perluDimasukkanUlang: boolean;
  /**
   * Yang bermasalah SERVERNYA (ENCRYPTION_KEY hilang), bukan datanya. Saat ini
   * true, mengetik ulang kunci TIDAK akan menolong — penyimpanannya pun gagal.
   */
  masalahKonfigurasiServer: boolean;
  statusKoneksi: string;
  koneksiDiperiksa: string | null;
  koneksiPesan: string | null;
  statusWebhook: string;
  webhookDiperiksa: string | null;
  /** Mode ini punya kredensial lengkap & terpakai (client + server key terbaca). */
  lengkap: boolean;
}

export interface PengaturanPembayaranDTO {
  cafeId: string;
  metode: MetodeDTO[];
  midtrans: {
    modeAktif: MidtransMode;
    /** Kredensial per mode — Sandbox & Production selalu keduanya hadir. */
    kredensial: KredensialModeDTO[];
    statusIntegrasi: StatusIntegrasi;
    /** Boleh membuat transaksi sekarang (kredensial mode aktif ada). */
    bisaTransaksi: boolean;
    /** Syarat yang belum terpenuhi untuk menyalakan Production. */
    penghalangProduction: string[];
    webhookUrl: string;
  };
  /** Jumlah metode pembayaran yang menyala (manual aktif + Midtrans bila bisa). */
  jumlahMetodeAktif: number;
}

/** Bentuk ringkas untuk kasir & checkout — tanpa rincian rekening/kredensial. */
export interface OpsiMetodeDTO {
  metode: ManualMethod;
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

// ── Pembantu internal ────────────────────────────────────────────────────────

/**
 * Konfigurasi wajib sebuah metode sudah terisi?
 *
 * QRIS statis tanpa gambar dan transfer tanpa nomor rekening adalah metode
 * yang tampak menyala tapi tidak bisa dibayar siapa pun. Pemeriksaan ini yang
 * membuat sakelarnya tidak bisa dinyalakan sebelum isinya lengkap.
 */
function konfigurasiLengkap(baris: MetodePembayaranKafe): boolean {
  switch (baris.metode) {
    case 'QRIS_STATIS':
      return Boolean(baris.qrisImageUrl && baris.qrisMerchantName);
    case 'TRANSFER':
      return Boolean(baris.bankNama && baris.bankNomorRekening && baris.bankAtasNama);
    // Tunai & EDC tidak menuntut apa pun: kasirnya yang jadi "konfigurasi".
    default:
      return true;
  }
}

function toMetodeDTO(baris: MetodePembayaranKafe): MetodeDTO {
  const metode = baris.metode as ManualMethod;
  return {
    metode,
    aktif: baris.aktif,
    tersediaDiKasir: baris.tersediaDiKasir,
    tersediaDiCheckout: baris.tersediaDiCheckout,
    bolehDiCheckout: BOLEH_DI_CHECKOUT[metode] ?? false,
    wajibVerifikasiKasir: baris.wajibVerifikasiKasir,
    instruksi: baris.instruksi,
    batasWaktuMenit: baris.batasWaktuMenit,
    qrisImageUrl: baris.qrisImageUrl,
    qrisMerchantName: baris.qrisMerchantName,
    qrisNmid: baris.qrisNmid,
    bankNama: baris.bankNama,
    bankNomorRekening: baris.bankNomorRekening,
    bankAtasNama: baris.bankAtasNama,
    edcProvider: baris.edcProvider,
    edcTerminalLabel: baris.edcTerminalLabel,
    konfigurasiLengkap: konfigurasiLengkap(baris),
  };
}

/**
 * Bisakah ciphertext slot ini DIBUKA sekarang, dan kalau tidak — kenapa?
 *
 * Dipanggil di jalur baca (`getSettings`) untuk setiap mode. Biayanya satu blok
 * AES per slot, dan itulah harga yang dibayar supaya status yang ditampilkan
 * adalah keadaan sungguhan, bukan sekadar "kolomnya tidak kosong".
 *
 * Plaintext-nya DIBUANG di sini. Fungsi ini hanya menjawab bisa/tidak.
 */
/**
 * Tolak lebih awal bila server tidak punya ENCRYPTION_KEY.
 *
 * 500, bukan 400: tidak ada yang salah dengan permintaan pemiliknya. Pesannya
 * menyebut nama variabelnya karena itu tidak rahasia (nilainya yang rahasia),
 * dan tanpa nama itu pengelola server tidak punya petunjuk apa pun.
 */
function pastikanKonfigurasiEnkripsi(): void {
  if (enkripsiSiap()) return;
  try {
    pastikanEnkripsiSiap();
  } catch {
    /* pesan aslinya memuat perintah generate — tidak untuk pengguna akhir. */
  }
  throw ApiError.internal(
    'Server belum dikonfigurasi untuk menyimpan kredensial dengan aman ' +
      '(ENCRYPTION_KEY tidak tersedia). Hubungi pengelola server CafeOS — ' +
      'jangan masukkan ulang kunci sebelum ini diperbaiki.',
  );
}

function keadaanKredensial(serverKeyEnc: string | null): StatusKredensial {
  if (!serverKeyEnc) return 'BELUM_DIKONFIGURASI';
  const hasil = dekripsiAman(serverKeyEnc);
  if (hasil.ok) return 'TERSIMPAN';
  return hasil.sebab === 'KONFIGURASI' ? 'KONFIGURASI_SERVER' : 'PERLU_DIMASUKKAN_ULANG';
}

function toKredensialDTO(baris: MidtransCredential): KredensialModeDTO {
  const status = keadaanKredensial(baris.serverKeyEnc);
  const terbaca = status === 'TERSIMPAN';
  return {
    mode: baris.mode,
    clientKey: baris.clientKey,
    serverKeyTersimpan: terbaca,
    // Petunjuk 4 karakter hanya berguna kalau kuncinya memang masih terpakai.
    // Menampilkannya untuk kunci yang tak terbaca cuma memperkuat kesan keliru
    // bahwa ada sesuatu yang siap dipakai di sana.
    serverKeyPetunjuk: terbaca ? baris.serverKeyHint : null,
    statusKredensial: status,
    perluDimasukkanUlang: status === 'PERLU_DIMASUKKAN_ULANG',
    masalahKonfigurasiServer: status === 'KONFIGURASI_SERVER',
    statusKoneksi: baris.statusKoneksi,
    koneksiDiperiksa: baris.koneksiDiperiksa?.toISOString() ?? null,
    koneksiPesan: baris.koneksiPesan,
    statusWebhook: baris.statusWebhook,
    webhookDiperiksa: baris.webhookDiperiksa?.toISOString() ?? null,
    lengkap: terbaca && Boolean(baris.clientKey),
  };
}

/** Baris kosong untuk mode yang belum pernah disetel. */
function kredensialKosong(mode: MidtransMode): KredensialModeDTO {
  return {
    mode,
    clientKey: null,
    serverKeyTersimpan: false,
    serverKeyPetunjuk: null,
    statusKredensial: 'BELUM_DIKONFIGURASI',
    perluDimasukkanUlang: false,
    masalahKonfigurasiServer: false,
    statusKoneksi: 'BELUM_DIUJI',
    koneksiDiperiksa: null,
    koneksiPesan: null,
    statusWebhook: 'BELUM_DIPERIKSA',
    webhookDiperiksa: null,
    lengkap: false,
  };
}

/**
 * Pastikan keempat baris metode ada untuk sebuah kafe.
 *
 * Kafe yang dibuat SETELAH migrasi belum punya barisnya. Dibuat malas di sini
 * (bukan lewat trigger database) supaya nilai awalnya ditentukan satu tempat
 * saja — dan `createMany({ skipDuplicates })` membuat dua permintaan yang
 * datang bersamaan tidak saling menggagalkan.
 */
async function pastikanBarisMetode(cafeId: string): Promise<void> {
  await prisma.metodePembayaranKafe.createMany({
    data: MANUAL_METHODS.map((metode) => ({
      cafeId,
      metode,
      // Tunai menyala sejak awal: kafe baru harus bisa langsung menagih.
      aktif: metode === 'TUNAI',
      tersediaDiKasir: true,
      tersediaDiCheckout: false,
      wajibVerifikasiKasir: true,
    })),
    skipDuplicates: true,
  });
}

/** Urutan tampil metode — sama di pengaturan, kasir, dan checkout. */
function urutkanMetode(baris: MetodePembayaranKafe[]): MetodePembayaranKafe[] {
  const urutan = new Map(MANUAL_METHODS.map((m, i) => [m as string, i]));
  return [...baris].sort(
    (a, b) => (urutan.get(a.metode) ?? 99) - (urutan.get(b.metode) ?? 99),
  );
}

/**
 * Turunkan status integrasi Midtrans dari fakta, bukan dari "ada key atau
 * tidak".
 *
 * Inilah perbaikan yang paling terasa bagi pemilik kafe: badge hijau dulu
 * muncul begitu Server Key tersimpan, padahal kunci yang salah ketik pun akan
 * tersimpan dengan senang hati. Sekarang hijau berarti empat hal sekaligus —
 * kunci ada, Midtrans menerimanya, modenya cocok, dan notifikasi benar-benar
 * pernah sampai.
 */
function turunkanStatus(kredensial: KredensialModeDTO | undefined): StatusIntegrasi {
  if (!kredensial) return 'BELUM_DIKONFIGURASI';
  // Urutan ini disengaja: keadaan yang membuat kredensial TIDAK BISA DIPAKAI
  // diperiksa lebih dulu, sebelum status koneksi apa pun. Hasil tes koneksi
  // yang tersimpan kemarin tidak boleh menutupi kenyataan bahwa kuncinya hari
  // ini tidak bisa dibuka.
  if (kredensial.masalahKonfigurasiServer) return 'KONFIGURASI_SERVER';
  if (kredensial.perluDimasukkanUlang) return 'PERLU_DIMASUKKAN_ULANG';
  if (!kredensial.serverKeyTersimpan) return 'BELUM_DIKONFIGURASI';
  if (kredensial.statusKoneksi === 'GAGAL') return 'KONEKSI_GAGAL';
  if (
    kredensial.lengkap &&
    kredensial.statusKoneksi === 'BERHASIL' &&
    kredensial.statusWebhook === 'TERVERIFIKASI'
  ) {
    return 'SIAP';
  }
  return 'KREDENSIAL_TERSIMPAN';
}

/**
 * Apa saja yang masih menghalangi mode Production dinyalakan.
 *
 * Dikembalikan sebagai daftar kalimat, bukan boolean: pemilik kafe yang
 * tombolnya mati berhak tahu persisnya apa yang kurang, bukan sekadar bahwa
 * sesuatu kurang.
 */
function penghalangProduction(prod: KredensialModeDTO | undefined): string[] {
  const kurang: string[] = [];
  if (prod?.masalahKonfigurasiServer) {
    // Tidak ada yang bisa dilakukan pemilik kafe di sini, jadi jangan menyuruh.
    kurang.push(
      'Server CafeOS belum bisa membaca kredensial tersimpan — hubungi pengelola server',
    );
  } else if (prod?.perluDimasukkanUlang) {
    kurang.push('Server Key Production perlu dimasukkan ulang');
  } else if (!prod?.serverKeyTersimpan) {
    kurang.push('Server Key Production belum diisi');
  }
  if (!prod?.clientKey) kurang.push('Client Key Production belum diisi');
  if (prod?.statusKoneksi !== 'BERHASIL') {
    kurang.push('Tes koneksi Production belum berhasil');
  }
  return kurang;
}

// ── Layanan ──────────────────────────────────────────────────────────────────

export const paymentSettingsService = {
  /** Seluruh pengaturan pembayaran kafe (halaman Pengaturan → Pembayaran). */
  async getSettings(cafeId: string): Promise<PengaturanPembayaranDTO> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { id: true, midtransProduction: true },
    });
    if (!cafe) throw ApiError.notFound('Kafe tidak ditemukan');

    await pastikanBarisMetode(cafeId);

    const [barisMetode, barisKredensial] = await Promise.all([
      prisma.metodePembayaranKafe.findMany({ where: { cafeId } }),
      prisma.midtransCredential.findMany({ where: { cafeId } }),
    ]);

    const kredensialPerMode = new Map(barisKredensial.map((k) => [k.mode, toKredensialDTO(k)]));
    const kredensial: KredensialModeDTO[] = (['SANDBOX', 'PRODUCTION'] as MidtransMode[]).map(
      (mode) => kredensialPerMode.get(mode) ?? kredensialKosong(mode),
    );

    const modeAktif: MidtransMode = cafe.midtransProduction ? 'PRODUCTION' : 'SANDBOX';
    const aktif = kredensial.find((k) => k.mode === modeAktif);
    const metode = urutkanMetode(barisMetode).map(toMetodeDTO);
    const bisaTransaksi = Boolean(aktif?.serverKeyTersimpan && aktif?.clientKey);

    return {
      cafeId,
      metode,
      midtrans: {
        modeAktif,
        kredensial,
        statusIntegrasi: turunkanStatus(aktif),
        bisaTransaksi,
        penghalangProduction: penghalangProduction(
          kredensial.find((k) => k.mode === 'PRODUCTION'),
        ),
        webhookUrl: urlWebhookMidtrans(cafeId),
      },
      jumlahMetodeAktif: metode.filter((m) => m.aktif).length + (bisaTransaksi ? 1 : 0),
    };
  },

  /**
   * Metode yang benar-benar bisa dipakai pada sebuah kanal.
   *
   * Dipakai layar kasir (`KASIR`) dan checkout pelanggan (`CHECKOUT`). Hanya
   * metode yang aktif, tersedia di kanal itu, DAN konfigurasinya lengkap yang
   * ikut — supaya tidak ada tombol yang bisa ditekan tapi tidak bisa dibayar.
   */
  async opsiMetode(
    cafeId: string,
    kanal: 'KASIR' | 'CHECKOUT',
  ): Promise<OpsiMetodeDTO[]> {
    const baris = await prisma.metodePembayaranKafe.findMany({
      where: {
        cafeId,
        aktif: true,
        ...(kanal === 'KASIR' ? { tersediaDiKasir: true } : { tersediaDiCheckout: true }),
      },
    });

    return urutkanMetode(baris)
      .filter((b) => konfigurasiLengkap(b))
      // Aturan domain menang atas data: baris yang entah bagaimana menyala di
      // checkout untuk metode yang tak boleh ke sana tetap tidak ditawarkan.
      .filter((b) => kanal === 'KASIR' || BOLEH_DI_CHECKOUT[b.metode as ManualMethod])
      .map((b) => ({
        metode: b.metode as ManualMethod,
        wajibVerifikasiKasir: b.wajibVerifikasiKasir,
        instruksi: b.instruksi,
        batasWaktuMenit: b.batasWaktuMenit,
        qrisImageUrl: b.qrisImageUrl,
        qrisMerchantName: b.qrisMerchantName,
        bankNama: b.bankNama,
        bankNomorRekening: b.bankNomorRekening,
        bankAtasNama: b.bankAtasNama,
        edcProvider: b.edcProvider,
      }));
  },

  /** Satu baris konfigurasi metode — dipakai service pembayaran saat menagih. */
  async getMetode(cafeId: string, metode: ManualMethod) {
    return prisma.metodePembayaranKafe.findFirst({ where: { cafeId, metode } });
  },

  /**
   * Nyalakan/matikan metode & kanalnya (aksi utama tombol "Simpan Perubahan").
   *
   * Seluruh baris ditulis dalam SATU transaksi: halaman pengaturan mengirim
   * keempat metode sekaligus, dan simpanan yang separuh jadi akan meninggalkan
   * kafe dengan kombinasi yang tidak pernah dipilih siapa pun.
   */
  async simpanMetodeAktif(
    cafeId: string,
    input: MetodeAktifInput,
    aktor: AktorAudit,
  ): Promise<PengaturanPembayaranDTO> {
    await pastikanBarisMetode(cafeId);

    const sebelum = await prisma.metodePembayaranKafe.findMany({ where: { cafeId } });
    const perMetode = new Map(sebelum.map((b) => [b.metode, b]));

    for (const item of input.metode) {
      const baris = perMetode.get(item.metode);
      if (baris && item.aktif && !konfigurasiLengkap(baris)) {
        throw ApiError.badRequest(
          `Lengkapi dulu pengaturan "${item.metode}" sebelum mengaktifkannya.`,
        );
      }
    }
    if (!input.metode.some((m) => m.aktif)) {
      throw ApiError.badRequest(
        'Minimal satu metode pembayaran di kasir harus aktif — tanpa itu kasir tidak bisa menagih.',
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const item of input.metode) {
        // Metode yang tak boleh ke checkout dipaksa mati di sana, apa pun yang
        // dikirim klien. Dan apa pun yang tampil di checkout WAJIB diverifikasi
        // kasir: uangnya belum ada di tangan siapa pun saat tamu menekan bayar.
        const diCheckout =
          item.tersediaDiCheckout && BOLEH_DI_CHECKOUT[item.metode] && item.aktif;

        await tx.metodePembayaranKafe.update({
          where: { cafeId_metode: { cafeId, metode: item.metode } },
          data: {
            aktif: item.aktif,
            tersediaDiKasir: item.tersediaDiKasir,
            tersediaDiCheckout: diCheckout,
            wajibVerifikasiKasir: diCheckout ? true : item.wajibVerifikasiKasir,
          },
        });
      }

      // Kolom cermin `cafes.metode_diterima` ikut diperbarui — lihat catatan
      // di schema. Tanpa ini, penurunan versi aplikasi akan melihat konfigurasi
      // yang beku di hari migrasi.
      await tx.cafe.update({
        where: { id: cafeId },
        data: { metodeDiterima: input.metode.filter((m) => m.aktif).map((m) => m.metode) },
      });
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.METODE_DIPERBARUI,
      aktor,
      nilaiLama: { aktif: sebelum.filter((b) => b.aktif).map((b) => b.metode) },
      nilaiBaru: { aktif: input.metode.filter((m) => m.aktif).map((m) => m.metode) },
    });

    return this.getSettings(cafeId);
  },

  /**
   * Simpan rincian satu metode (gambar QRIS, rekening bank, terminal EDC).
   *
   * Field yang tidak dikirim TIDAK disentuh — dialog konfigurasi mengirim
   * hanya bagian yang relevan untuk metodenya, dan `undefined` di sini berarti
   * "biarkan apa adanya", bukan "kosongkan".
   */
  async simpanKonfigurasiMetode(
    cafeId: string,
    metode: ManualMethod,
    input: KonfigurasiMetodeInput,
    aktor: AktorAudit,
  ): Promise<MetodeDTO> {
    await pastikanBarisMetode(cafeId);

    const sebelum = await prisma.metodePembayaranKafe.findFirst({
      where: { cafeId, metode },
    });
    if (!sebelum) throw ApiError.notFound('Metode pembayaran tidak ditemukan');

    const diCheckout =
      (input.tersediaDiCheckout ?? sebelum.tersediaDiCheckout) && BOLEH_DI_CHECKOUT[metode];

    const sesudah = await prisma.metodePembayaranKafe.update({
      where: { cafeId_metode: { cafeId, metode } },
      data: {
        ...(input.tersediaDiKasir !== undefined && { tersediaDiKasir: input.tersediaDiKasir }),
        tersediaDiCheckout: diCheckout,
        // Aturan yang sama seperti di `simpanMetodeAktif`, ditegakkan lagi di
        // jalur ini: apa pun yang tampil di checkout wajib diverifikasi kasir.
        wajibVerifikasiKasir: diCheckout
          ? true
          : (input.wajibVerifikasiKasir ?? sebelum.wajibVerifikasiKasir),
        ...(input.instruksi !== undefined && { instruksi: input.instruksi }),
        ...(input.batasWaktuMenit !== undefined && { batasWaktuMenit: input.batasWaktuMenit }),
        ...(input.qrisImageUrl !== undefined && { qrisImageUrl: input.qrisImageUrl }),
        ...(input.qrisImagePublicId !== undefined && {
          qrisImagePublicId: input.qrisImagePublicId,
        }),
        ...(input.qrisMerchantName !== undefined && { qrisMerchantName: input.qrisMerchantName }),
        ...(input.qrisNmid !== undefined && { qrisNmid: input.qrisNmid }),
        ...(input.bankNama !== undefined && { bankNama: input.bankNama }),
        ...(input.bankNomorRekening !== undefined && {
          bankNomorRekening: input.bankNomorRekening,
        }),
        ...(input.bankAtasNama !== undefined && { bankAtasNama: input.bankAtasNama }),
        ...(input.edcProvider !== undefined && { edcProvider: input.edcProvider }),
        ...(input.edcTerminalLabel !== undefined && { edcTerminalLabel: input.edcTerminalLabel }),
      },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.METODE_DIKONFIGURASI,
      aktor,
      nilaiLama: {
        metode,
        tersediaDiCheckout: sebelum.tersediaDiCheckout,
        bankNama: sebelum.bankNama,
        bank_nomor_rekening: sebelum.bankNomorRekening,
        qrisMerchantName: sebelum.qrisMerchantName,
      },
      nilaiBaru: {
        metode,
        tersediaDiCheckout: sesudah.tersediaDiCheckout,
        bankNama: sesudah.bankNama,
        bank_nomor_rekening: sesudah.bankNomorRekening,
        qrisMerchantName: sesudah.qrisMerchantName,
      },
    });

    return toMetodeDTO(sesudah);
  },

  // ── Midtrans ───────────────────────────────────────────────────────────────

  /**
   * Simpan kredensial untuk SATU mode.
   *
   * Server Key baru selalu di-enkripsi ulang (`enkripsi()` memakai IV acak,
   * jadi ciphertext-nya berbeda tiap kali) dan menyetel ulang status koneksi ke
   * BELUM_DIUJI: kunci yang baru diganti belum pernah dibuktikan.
   *
   * Server Key yang TIDAK dikirim berarti "biarkan yang lama" — bukan
   * "kosongkan". Ini yang membuat pemilik bisa mengubah Client Key saja tanpa
   * harus mengetik ulang Server Key yang memang tidak pernah ditampilkan.
   */
  async simpanKredensial(
    cafeId: string,
    mode: MidtransMode,
    input: KredensialMidtransInput,
    aktor: AktorAudit,
  ): Promise<PengaturanPembayaranDTO> {
    // Gerbang pertama: tanpa ENCRYPTION_KEY, apa pun yang disimpan hari ini
    // tidak akan bisa dibuka besok. Lebih baik menolak sekarang, dengan sebab
    // yang jujur, daripada meninggalkan kredensial yang tampak tersimpan.
    pastikanKonfigurasiEnkripsi();

    const sebelum = await prisma.midtransCredential.findUnique({
      where: { cafeId_mode: { cafeId, mode } },
    });

    // "Sudah ada Server Key lama" kini berarti ada yang MASIH BISA DIPAKAI.
    // Ciphertext yang tak terbaca bukan cadangan — kalau itu yang tersimpan,
    // Server Key baru wajib diisi.
    const lamaTerpakai = keadaanKredensial(sebelum?.serverKeyEnc ?? null) === 'TERSIMPAN';
    if (!lamaTerpakai && !input.serverKey) {
      throw ApiError.badRequest(
        sebelum?.serverKeyEnc
          ? 'Kredensial lama tidak bisa dibaca lagi. Masukkan Server Key baru untuk melanjutkan.'
          : 'Server Key wajib diisi saat pertama kali menyimpan.',
      );
    }

    // Enkripsi + dekripsi balik dalam satu tarikan. Kalau round-trip gagal,
    // TIDAK ADA yang ditulis ke database.
    const dataKunci = input.serverKey
      ? {
          serverKeyEnc: enkripsiTerverifikasi(input.serverKey),
          serverKeyPetunjuk: input.serverKey.slice(-4),
        }
      : null;

    await prisma.midtransCredential.upsert({
      where: { cafeId_mode: { cafeId, mode } },
      create: {
        cafeId,
        mode,
        clientKey: input.clientKey ?? null,
        serverKeyEnc: dataKunci?.serverKeyEnc ?? null,
        serverKeyHint: dataKunci?.serverKeyPetunjuk ?? null,
      },
      update: {
        ...(input.clientKey !== undefined && { clientKey: input.clientKey }),
        ...(dataKunci && {
          serverKeyEnc: dataKunci.serverKeyEnc,
          serverKeyHint: dataKunci.serverKeyPetunjuk,
          // Kunci baru = bukti lama tidak berlaku lagi.
          statusKoneksi: 'BELUM_DIUJI',
          koneksiDiperiksa: null,
          koneksiPesan: null,
          statusWebhook: 'BELUM_DIPERIKSA',
          webhookDiperiksa: null,
        }),
      },
    });

    await this.sinkronKolomCermin(cafeId);

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.MIDTRANS_KREDENSIAL_DISIMPAN,
      aktor,
      // Yang dicatat hanya FAKTA bahwa kunci diganti, bukan kuncinya.
      nilaiLama: {
        mode,
        clientKey: sebelum?.clientKey ?? null,
        serverKeyTersimpan: Boolean(sebelum?.serverKeyEnc),
      },
      nilaiBaru: {
        mode,
        clientKey: input.clientKey ?? sebelum?.clientKey ?? null,
        serverKeyTersimpan: true,
        serverKeyDiganti: Boolean(input.serverKey),
        // Peringatan awalan ikut tercatat sebagai catatan, bukan penolakan —
        // isinya kalimat, tidak pernah potongan kunci.
        ...(input.peringatan?.length && { peringatan: input.peringatan }),
      },
    });

    // Menyimpan lalu langsung MEMBUKTIKAN. Pemilik yang baru menempel kunci
    // tidak perlu menebak apakah ia benar: jawabannya sudah ada di layar yang
    // sama, dari endpoint mode ini sendiri (Sandbox ke Sandbox, Production ke
    // Production). Kegagalan tes tidak membatalkan simpanan — kunci yang salah
    // pun perlu tersimpan supaya bisa diperbaiki, dan statusnya yang bicara.
    if (dataKunci) await this.tesKoneksiDiam(cafeId, mode);

    return this.getSettings(cafeId);
  },

  /**
   * Tes koneksi tanpa audit & tanpa melempar — dipakai tepat setelah menyimpan.
   *
   * Dipisahkan dari `tesKoneksi` karena yang ini BUKAN tindakan pemilik: ia
   * tidak boleh menggagalkan penyimpanan yang sudah berhasil hanya karena
   * jaringan ke Midtrans sedang bermasalah.
   */
  async tesKoneksiDiam(cafeId: string, mode: MidtransMode): Promise<void> {
    try {
      const hasil = await this.jalankanTes(cafeId, mode);
      await prisma.midtransCredential.update({
        where: { cafeId_mode: { cafeId, mode } },
        data: {
          statusKoneksi: hasil.berhasil ? 'BERHASIL' : 'GAGAL',
          koneksiDiperiksa: new Date(),
          koneksiPesan: hasil.pesan,
        },
      });
    } catch {
      // Sudah tersimpan; statusnya tetap BELUM_DIUJI dan tombol Tes Koneksi
      // masih ada. Tidak ada yang perlu digagalkan karena ini.
    }
  },

  /**
   * Putuskan integrasi untuk satu mode — kredensialnya dihapus.
   *
   * Mode yang sedang aktif tidak boleh diputus begitu saja bila masih ada
   * pesanan yang menunggu pembayaran lewat Midtrans: tagihan yang sudah terbit
   * akan kehilangan kunci untuk memverifikasi notifikasinya, dan tamu yang
   * sudah membayar tidak akan pernah tercatat lunas.
   */
  async hapusKredensial(
    cafeId: string,
    mode: MidtransMode,
    aktor: AktorAudit,
  ): Promise<PengaturanPembayaranDTO> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { midtransProduction: true },
    });
    const modeAktif: MidtransMode = cafe?.midtransProduction ? 'PRODUCTION' : 'SANDBOX';

    if (mode === modeAktif) {
      const menggantung = await prisma.order.count({
        where: {
          cafeId,
          status: 'MENUNGGU_PEMBAYARAN',
          midtransOrderId: { not: null },
        },
      });
      if (menggantung > 0) {
        throw ApiError.conflict(
          `Masih ada ${menggantung} pesanan yang menunggu pembayaran Midtrans. ` +
            'Selesaikan atau batalkan dulu sebelum memutus integrasi.',
        );
      }
    }

    await prisma.midtransCredential.deleteMany({ where: { cafeId, mode } });
    await this.sinkronKolomCermin(cafeId);

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.MIDTRANS_KREDENSIAL_DIHAPUS,
      aktor,
      nilaiLama: { mode, terhubung: true },
      nilaiBaru: { mode, terhubung: false },
    });

    return this.getSettings(cafeId);
  },

  /**
   * Buka kredensial satu mode lalu tanyakan ke Midtrans — inti kedua tes.
   *
   * Endpoint yang dihubungi SELALU milik `mode` yang diminta (lihat
   * `baseUrlMidtrans`). Tidak ada jalan bagi slot Sandbox untuk menyentuh
   * endpoint Production atau sebaliknya, apa pun bentuk kuncinya.
   *
   * Melempar `ApiError` hanya untuk keadaan yang memang menuntut tindakan:
   * belum ada kunci, kunci tak terbaca, atau server belum dikonfigurasi.
   */
  async jalankanTes(
    cafeId: string,
    mode: MidtransMode,
  ): Promise<{ berhasil: boolean; pesan: string }> {
    const namaMode = mode === 'PRODUCTION' ? 'Production' : 'Sandbox';
    const baris = await prisma.midtransCredential.findUnique({
      where: { cafeId_mode: { cafeId, mode } },
    });
    if (!baris?.serverKeyEnc) {
      throw ApiError.badRequest(`Server Key ${namaMode} belum diisi.`);
    }

    const dibuka = dekripsiAman(baris.serverKeyEnc);
    if (!dibuka.ok) {
      // Dua sebab, dua nasihat. Menyuruh mengetik ulang kunci saat yang hilang
      // adalah ENCRYPTION_KEY server adalah nasihat yang menyesatkan: kunci
      // barunya pun tidak akan bisa disimpan.
      if (dibuka.sebab === 'KONFIGURASI') pastikanKonfigurasiEnkripsi();
      throw ApiError.badRequest(
        `Kredensial ${namaMode} yang tersimpan tidak bisa dibaca lagi. ` +
          'Masukkan ulang Server Key dari dasbor Midtrans.',
      );
    }

    return tesKoneksiMidtrans({
      cafeId,
      mode,
      clientKey: baris.clientKey,
      serverKey: dibuka.teks,
    });
  },

  /** Uji kredensial sebuah mode ke server Midtrans dan simpan hasilnya. */
  async tesKoneksi(
    cafeId: string,
    mode: MidtransMode,
    aktor: AktorAudit,
  ): Promise<{ berhasil: boolean; pesan: string; pengaturan: PengaturanPembayaranDTO }> {
    const hasil = await this.jalankanTes(cafeId, mode);

    await prisma.midtransCredential.update({
      where: { cafeId_mode: { cafeId, mode } },
      data: {
        statusKoneksi: hasil.berhasil ? 'BERHASIL' : 'GAGAL',
        koneksiDiperiksa: new Date(),
        koneksiPesan: hasil.pesan,
      },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.MIDTRANS_TES_KONEKSI,
      aktor,
      nilaiBaru: { mode, berhasil: hasil.berhasil, pesan: hasil.pesan },
    });

    return { ...hasil, pengaturan: await this.getSettings(cafeId) };
  },

  /**
   * Ganti mode aktif kafe (Sandbox ⇄ Production).
   *
   * Menyalakan Production adalah satu-satunya tindakan di modul ini yang
   * membuat uang sungguhan berpindah, jadi syaratnya diperiksa DI SERVER —
   * dialog konfirmasi di layar hanya pengingat, bukan penjaga. Kredensial
   * Sandbox tidak pernah boleh menjadi cadangannya.
   */
  async setMode(
    cafeId: string,
    mode: MidtransMode,
    aktor: AktorAudit,
  ): Promise<PengaturanPembayaranDTO> {
    if (mode === 'PRODUCTION') {
      const prod = await prisma.midtransCredential.findUnique({
        where: { cafeId_mode: { cafeId, mode: 'PRODUCTION' } },
      });
      const kurang = penghalangProduction(prod ? toKredensialDTO(prod) : undefined);
      if (kurang.length > 0) {
        throw ApiError.badRequest(
          `Belum bisa mengaktifkan mode Production: ${kurang.join('; ')}.`,
        );
      }
    }

    await prisma.cafe.update({
      where: { id: cafeId },
      data: { midtransProduction: mode === 'PRODUCTION' },
    });
    await this.sinkronKolomCermin(cafeId);

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.MIDTRANS_MODE_DIUBAH,
      aktor,
      nilaiBaru: { mode },
    });

    return this.getSettings(cafeId);
  },

  /**
   * Status webhook sebuah mode.
   *
   * Tidak ada API Midtrans untuk menanyakan "apakah URL notifikasi saya sudah
   * benar", jadi yang bisa dilaporkan adalah FAKTA: apakah pernah ada
   * notifikasi bersignature sah yang benar-benar sampai ke server ini untuk
   * mode tersebut. Penandanya dipasang `tandaiWebhookTerverifikasi()` dari
   * dalam handler webhook — satu-satunya tempat yang tahu itu sungguh terjadi.
   */
  async statusWebhook(cafeId: string, mode: MidtransMode) {
    const baris = await prisma.midtransCredential.findUnique({
      where: { cafeId_mode: { cafeId, mode } },
    });
    return {
      mode,
      status: baris?.statusWebhook ?? 'BELUM_DIPERIKSA',
      diperiksa: baris?.webhookDiperiksa?.toISOString() ?? null,
      webhookUrl: urlWebhookMidtrans(cafeId),
    };
  },

  /** Dipanggil handler webhook saat notifikasi bersignature sah diterima. */
  async tandaiWebhookTerverifikasi(cafeId: string, mode: MidtransMode): Promise<void> {
    await prisma.midtransCredential.updateMany({
      where: { cafeId, mode },
      data: { statusWebhook: 'TERVERIFIKASI', webhookDiperiksa: new Date() },
    });
  },

  // ── Resolusi kredensial untuk jalur transaksi ──────────────────────────────

  /**
   * Kredensial mode yang SEDANG AKTIF, siap dipakai membuat transaksi.
   *
   * `null` bila kafe belum menyetelnya — pemanggil menerjemahkannya menjadi
   * "Midtrans belum tersedia di kafe ini", bukan galat server.
   *
   * CATATAN PENTING: fungsi ini TIDAK menuntut tes koneksi pernah berhasil.
   * Kesiapan integrasi (badge hijau) dan kemampuan menagih adalah dua hal
   * berbeda — memaksakan keduanya sama akan mematikan pembayaran di kafe yang
   * sudah berjalan sejak sebelum tombol Tes Koneksi ada.
   */
  async kredensialAktif(cafeId: string): Promise<KredensialMidtrans | null> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { midtransProduction: true },
    });
    if (!cafe) return null;

    const mode: MidtransMode = cafe.midtransProduction ? 'PRODUCTION' : 'SANDBOX';
    return this.kredensialMode(cafeId, mode);
  },

  /** Kredensial satu mode tertentu (dipakai webhook & tes). */
  async kredensialMode(
    cafeId: string,
    mode: MidtransMode,
  ): Promise<KredensialMidtrans | null> {
    const baris = await prisma.midtransCredential.findUnique({
      where: { cafeId_mode: { cafeId, mode } },
    });
    if (!baris?.serverKeyEnc) return null;

    const dibuka = dekripsiAman(baris.serverKeyEnc);
    if (!dibuka.ok) {
      // Dicatat TANPA menyertakan apa pun dari isi kunci — hanya kafe, mode,
      // dan sebab. `sebab` yang membedakan tiket "server salah konfigurasi"
      // dari tiket "kredensial kafe ini perlu dimasukkan ulang".
      console.error('[pembayaran] kredensial Midtrans tidak bisa didekripsi', {
        cafeId,
        mode,
        sebab: dibuka.sebab,
      });
      return null;
    }

    return {
      cafeId,
      mode,
      clientKey: baris.clientKey,
      serverKey: dibuka.teks,
    };
  },

  /**
   * Semua mode yang punya kredensial — dipakai webhook untuk mencari kunci
   * mana yang cocok dengan signature yang datang.
   *
   * Kedua mode dicoba, bukan hanya yang aktif: dasbor Sandbox dan Production
   * Midtrans menunjuk URL notifikasi yang sama, dan kafe yang baru saja
   * berpindah mode masih bisa menerima notifikasi susulan dari mode lamanya.
   */
  async semuaKredensial(cafeId: string): Promise<KredensialMidtrans[]> {
    const hasil: KredensialMidtrans[] = [];
    for (const mode of ['PRODUCTION', 'SANDBOX'] as MidtransMode[]) {
      const k = await this.kredensialMode(cafeId, mode);
      if (k) hasil.push(k);
    }
    return hasil;
  },

  /**
   * Selaraskan kolom cermin di `cafes` dengan sumber kebenaran yang baru.
   *
   * Alasannya rollback: kalau kode diturunkan versinya tanpa menurunkan
   * database, versi lama membaca kolom-kolom ini. Menjaganya tetap benar
   * membuat penurunan versi menjadi tindakan yang aman, bukan taruhan.
   */
  async sinkronKolomCermin(cafeId: string): Promise<void> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { midtransProduction: true },
    });
    if (!cafe) return;

    const mode: MidtransMode = cafe.midtransProduction ? 'PRODUCTION' : 'SANDBOX';
    const [kredensial, metodeAktif] = await Promise.all([
      prisma.midtransCredential.findUnique({ where: { cafeId_mode: { cafeId, mode } } }),
      prisma.metodePembayaranKafe.findMany({ where: { cafeId, aktif: true } }),
    ]);

    // `midtransAktif` mengikuti definisi yang sama dengan yang dilihat layar:
    // ada DAN terbaca. Ciphertext-nya sendiri tetap disalin apa adanya —
    // kolom cermin ini untuk versi lama aplikasi, dan membuang ciphertext yang
    // hari ini tak terbaca akan menghapus data yang mungkin masih bisa
    // diselamatkan dengan ENCRYPTION_KEY yang benar.
    await prisma.cafe.update({
      where: { id: cafeId },
      data: {
        metodeDiterima: urutkanMetode(metodeAktif).map((m) => m.metode),
        midtransClientKey: kredensial?.clientKey ?? null,
        midtransServerKey: kredensial?.serverKeyEnc ?? null,
        midtransAktif: keadaanKredensial(kredensial?.serverKeyEnc ?? null) === 'TERSIMPAN',
      },
    });
  },
};
