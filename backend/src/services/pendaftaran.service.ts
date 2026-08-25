import { prisma } from '../lib/prisma';
import type { PendaftaranPublikInput } from '../validation/pendaftaran.validation';

/**
 * Balasan formulir pendaftaran. Sengaja tipis — halaman publik hanya perlu
 * tahu permintaannya tercatat; detail tindak lanjutnya urusan panel admin.
 */
export interface PendaftaranPublikDTO {
  id: string;
  status: string;
  createdAt: string;
}

export const pendaftaranService = {
  /**
   * Catat permintaan pendaftaran dari formulir publik.
   *
   * TIDAK membuat kafe maupun akun: yang lahir hanya satu baris
   * `tenant_registrations` berstatus `baru`. Aktivasi dikerjakan admin lewat
   * panel super admin setelah pendaftarnya dihubungi — itulah gerbang approval
   * yang membuat `/daftar` tidak lagi bisa menerbitkan akun aktif sendiri.
   *
   * Pendaftaran dengan email yang sama TIDAK ditolak di sini. Tabel ini
   * mencatat permintaan, bukan identitas: menolaknya akan membocorkan email
   * mana yang sudah mendaftar, sekaligus mengunci pendaftar yang perlu
   * mengirim ulang karena salah ketik. Baris kembar cukup ditandai `batal`
   * oleh admin.
   */
  async daftar(input: PendaftaranPublikInput): Promise<PendaftaranPublikDTO> {
    const baris = await prisma.tenantRegistration.create({
      data: {
        namaBisnis: input.namaBisnis,
        namaPemilik: input.namaPemilik,
        email: input.email,
        noHp: input.noHp,
        pesan: input.pesan,
        jenisAplikasi: 'CafeOS',
        status: 'baru',
      },
      select: { id: true, status: true, createdAt: true },
    });

    return {
      id: baris.id,
      status: baris.status,
      createdAt: baris.createdAt.toISOString(),
    };
  },
};
