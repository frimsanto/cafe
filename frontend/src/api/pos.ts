import { posFetch } from '../lib/posClient';
import type {
  AbsensiDTO,
  JadwalDTO,
  PemasanganDTO,
  PenggantianDTO,
  PetugasRingkasDTO,
  RiwayatSayaDTO,
  SesiKasirDTO,
  ShiftDTO,
  StatusAbsensiPosDTO,
} from '../types/pos';

/**
 * Endpoint terminal POS.
 *
 * Tidak satu pun fungsi di bawah menerima `cafeId` maupun `userId` — keduanya
 * diturunkan backend dari token perangkat dan PIN yang sudah dibuktikan. Itu
 * bukan penyederhanaan API melainkan bagian dari isolasi tenant: id yang bisa
 * dititipkan klien adalah id yang bisa ditebak.
 */

/** Rentang tanggal `YYYY-MM-DD` untuk layar "…Saya". */
function rentang(dari: string, sampai: string): string {
  return `?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`;
}

export const posApi = {
  // ── Perangkat & sesi ───────────────────────────────────────────────────────

  /**
   * Tukar token perangkat dengan cookie HttpOnly.
   *
   * Dipanggil SEKALI, membawa token di header. Sesudah ini tokennya hidup di
   * cookie yang tidak bisa dibaca JavaScript — termasuk oleh kode kita sendiri,
   * yang berarti tidak ada tempat di aplikasi ini yang bisa membocorkannya.
   */
  /**
   * Tukar KODE PEMASANGAN dengan cookie perangkat.
   *
   * Kodenya pendek dan dibaca manusia; tokennya lahir di server pada permintaan
   * ini dan langsung menjadi cookie HttpOnly. Tidak ada tempat di aplikasi ini
   * yang pernah memegang token perangkat — termasuk kode kita sendiri.
   */
  pasang(kode: string): Promise<PemasanganDTO> {
    return posFetch<PemasanganDTO>('/api/pos/pasang', {
      method: 'POST',
      json: { kode },
    });
  },

  /**
   * Cek apakah terminal ini sudah terpasang (cookie masih berlaku).
   *
   * Endpoint TERPISAH dari `pasang`, dan itu penting: memakai ulang `pasang`
   * untuk mengecek status berarti setiap pemuatan halaman /kasir menembak
   * endpoint yang dibatasi laju penukaran kode.
   */
  statusPerangkat(): Promise<PemasanganDTO> {
    return posFetch<PemasanganDTO>('/api/pos/terpasang');
  },

  petugas(): Promise<PetugasRingkasDTO[]> {
    return posFetch<PetugasRingkasDTO[]>('/api/pos/petugas');
  },

  bukaSesi(userId: string, pin: string): Promise<SesiKasirDTO> {
    return posFetch<SesiKasirDTO>('/api/pos/sesi', {
      method: 'POST',
      json: { userId, pin },
    });
  },

  sesi(): Promise<SesiKasirDTO> {
    return posFetch<SesiKasirDTO>('/api/pos/sesi');
  },

  /** "Ganti Petugas" — mengunci sesi tanpa menutup shift yang sedang berjalan. */
  kunciSesi(): Promise<{ terkunci: boolean }> {
    return posFetch<{ terkunci: boolean }>('/api/pos/sesi', { method: 'DELETE' });
  },

  // ── Absensi ────────────────────────────────────────────────────────────────

  statusAbsensi(): Promise<StatusAbsensiPosDTO> {
    return posFetch<StatusAbsensiPosDTO>('/api/pos/absensi');
  },

  /**
   * Absen masuk/pulang.
   *
   * `foto` adalah Blob JPEG hasil canvas — bukan berkas yang dipilih pengguna.
   * `diambilPada` ikut dikirim sebagai KETERANGAN saja; jam kerjanya selalu
   * waktu server, dan backend tidak pernah memakai nilai ini untuk menghitung
   * keterlambatan.
   */
  absen(
    arah: 'masuk' | 'pulang',
    input: {
      foto: Blob | null;
      diambilPada: Date | null;
      alasanPengecualian?: string | null;
      catatan?: string | null;
    },
  ): Promise<AbsensiDTO> {
    const form = new FormData();
    if (input.foto) form.append('foto', input.foto, 'absen.jpg');
    if (input.diambilPada) form.append('diambilPada', input.diambilPada.toISOString());
    if (input.alasanPengecualian) {
      form.append('alasanPengecualian', input.alasanPengecualian);
    }
    if (input.catatan) form.append('catatan', input.catatan);

    return posFetch<AbsensiDTO>(`/api/pos/absensi/${arah}`, { method: 'POST', form });
  },

  // ── Shift ──────────────────────────────────────────────────────────────────

  shiftAktif(): Promise<ShiftDTO | null> {
    return posFetch<ShiftDTO | null>('/api/pos/shift');
  },

  bukaShift(input: {
    modalAwal: number;
    scheduleId?: string | null;
    catatan?: string | null;
  }): Promise<ShiftDTO> {
    return posFetch<ShiftDTO>('/api/pos/shift/buka', { method: 'POST', json: input });
  },

  tutupShift(
    shiftId: string,
    input: { kasAktual: number; catatan?: string | null },
  ): Promise<ShiftDTO> {
    return posFetch<ShiftDTO>(`/api/pos/shift/${encodeURIComponent(shiftId)}/tutup`, {
      method: 'POST',
      json: input,
    });
  },

  catatKas(
    shiftId: string,
    input: { jenis: 'MASUK' | 'KELUAR'; nominal: number; alasan: string },
  ): Promise<ShiftDTO> {
    return posFetch<ShiftDTO>(`/api/pos/shift/${encodeURIComponent(shiftId)}/kas`, {
      method: 'POST',
      json: input,
    });
  },

  // ── Milik saya ─────────────────────────────────────────────────────────────

  jadwalSaya(dari: string, sampai: string): Promise<JadwalDTO[]> {
    return posFetch<JadwalDTO[]>(`/api/pos/jadwal-saya${rentang(dari, sampai)}`);
  },

  absensiSaya(dari: string, sampai: string): Promise<AbsensiDTO[]> {
    return posFetch<AbsensiDTO[]>(`/api/pos/absensi-saya${rentang(dari, sampai)}`);
  },

  riwayatSaya(): Promise<RiwayatSayaDTO> {
    return posFetch<RiwayatSayaDTO>('/api/pos/riwayat-saya');
  },

  // ── Penggantian ────────────────────────────────────────────────────────────

  ajukanPengganti(scheduleId: string, alasan: string): Promise<PenggantianDTO> {
    return posFetch<PenggantianDTO>('/api/pos/pengganti', {
      method: 'POST',
      json: { scheduleId, alasan },
    });
  },
};
