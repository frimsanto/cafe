import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { enkripsi } from '../lib/enkripsi';
import type { PaymentConfigInput } from '../validation/cafePayment.validation';

// Konfigurasi pembayaran per kafe. `cafeId` selalu berasal dari token (bukan
// input klien), jadi kafe hanya bisa membaca/menyetel konfigurasinya sendiri.
//
// serverKey Midtrans DISIMPAN TERENKRIPSI dan TIDAK PERNAH dikembalikan ke klien;
// clientKey memang publik (dipakai Snap.js di browser) sehingga aman diekspos.

/** Bentuk konfigurasi yang aman dikirim ke klien — tanpa serverKey. */
export interface PaymentConfigDTO {
  metodeDiterima: string[];
  midtransAktif: boolean;
  clientKey: string | null;
  isProduction: boolean;
}

export const cafePaymentService = {
  /** Konfigurasi pembayaran kafe (untuk halaman pengaturan & modal kasir). */
  async getConfig(cafeId: string): Promise<PaymentConfigDTO> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: {
        metodeDiterima: true,
        midtransAktif: true,
        midtransClientKey: true,
        midtransProduction: true,
      },
    });
    if (!cafe) throw ApiError.notFound('Kafe tidak ditemukan');

    return {
      metodeDiterima: cafe.metodeDiterima,
      midtransAktif: cafe.midtransAktif,
      clientKey: cafe.midtransClientKey,
      isProduction: cafe.midtransProduction,
    };
  },

  /**
   * Simpan konfigurasi pembayaran. serverKey (bila dikirim) dienkripsi lalu
   * disimpan, dan mengaktifkan Midtrans; bila tidak dikirim, kredensial lama
   * dibiarkan apa adanya.
   */
  async saveConfig(cafeId: string, input: PaymentConfigInput): Promise<PaymentConfigDTO> {
    const data: {
      metodeDiterima: string[];
      midtransClientKey?: string;
      midtransProduction?: boolean;
      midtransServerKey?: string;
      midtransAktif?: boolean;
    } = { metodeDiterima: input.metodeDiterima };

    if (input.clientKey !== undefined) data.midtransClientKey = input.clientKey;
    if (input.isProduction !== undefined) data.midtransProduction = input.isProduction;

    // serverKey baru → enkripsi + aktifkan Midtrans. Tanpa serverKey baru,
    // status aktif tidak diubah (kredensial lama tetap berlaku).
    if (input.serverKey !== undefined) {
      data.midtransServerKey = enkripsi(input.serverKey);
      data.midtransAktif = true;
    }

    const cafe = await prisma.cafe.update({
      where: { id: cafeId },
      data,
      select: {
        metodeDiterima: true,
        midtransAktif: true,
        midtransClientKey: true,
        midtransProduction: true,
      },
    });

    return {
      metodeDiterima: cafe.metodeDiterima,
      midtransAktif: cafe.midtransAktif,
      clientKey: cafe.midtransClientKey,
      isProduction: cafe.midtransProduction,
    };
  },
};
