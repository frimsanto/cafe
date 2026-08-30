import { describe, expect, it } from 'vitest';
import {
  dianggapHadir,
  ditetapkanManusia,
  isJenisKas,
  isStatusAbsensi,
  normalisasiStatusAbsensi,
  normalisasiStatusJadwal,
  normalisasiStatusPenggantian,
  normalisasiStatusShift,
  statusMasuk,
  statusPulang,
} from './shiftStatus';

describe('status absensi', () => {
  it('mengenali kosakata kanonik', () => {
    expect(isStatusAbsensi('PRESENT')).toBe(true);
    expect(isStatusAbsensi('EARLY_LEAVE')).toBe(true);
    expect(isStatusAbsensi('HADIR')).toBe(false);
  });

  it('menganggap nilai tak dikenal sebagai SCHEDULED', () => {
    expect(normalisasiStatusAbsensi(null)).toBe('SCHEDULED');
    expect(normalisasiStatusAbsensi('ENTAH')).toBe('SCHEDULED');
    expect(normalisasiStatusAbsensi('LATE')).toBe('LATE');
  });

  it('membedakan status yang berarti orangnya benar-benar bekerja', () => {
    expect(dianggapHadir('PRESENT')).toBe(true);
    expect(dianggapHadir('LATE')).toBe(true);
    expect(dianggapHadir('COMPLETED')).toBe(true);
    expect(dianggapHadir('SICK')).toBe(false);
    expect(dianggapHadir('ABSENT')).toBe(false);
    expect(dianggapHadir('SCHEDULED')).toBe(false);
  });

  it('menandai status yang hanya boleh ditetapkan manusia', () => {
    expect(ditetapkanManusia('SICK')).toBe(true);
    expect(ditetapkanManusia('PERMISSION')).toBe(true);
    expect(ditetapkanManusia('REPLACED')).toBe(true);
    expect(ditetapkanManusia('LATE')).toBe(false);
  });
});

describe('penentuan status dari jam', () => {
  // Toleransi INKLUSIF: datang persis pada batas yang diumumkan pemilik tidak
  // boleh dihitung terlambat.
  it('menghitung terlambat hanya setelah melewati toleransi', () => {
    expect(statusMasuk(0, 10)).toBe('PRESENT');
    expect(statusMasuk(10, 10)).toBe('PRESENT');
    expect(statusMasuk(11, 10)).toBe('LATE');
    // Datang lebih awal.
    expect(statusMasuk(-15, 10)).toBe('PRESENT');
  });

  it('menandai lembur dan pulang awal saat melewati ambang', () => {
    expect(statusPulang('PRESENT', 30, 0)).toBe('OVERTIME');
    expect(statusPulang('PRESENT', 0, 30)).toBe('EARLY_LEAVE');
    expect(statusPulang('PRESENT', 0, 0)).toBe('COMPLETED');
    // Di bawah ambang 15 menit dianggap pulang normal.
    expect(statusPulang('PRESENT', 10, 0)).toBe('COMPLETED');
    expect(statusPulang('PRESENT', 0, 10)).toBe('COMPLETED');
  });

  // Menebus keterlambatan dengan lembur tidak menghapus keterlambatannya —
  // kalau tidak, laporan kedisiplinan berhenti berguna.
  it('mempertahankan LATE meski staf pulang lembur', () => {
    expect(statusPulang('LATE', 60, 0)).toBe('LATE');
    expect(statusPulang('LATE', 0, 0)).toBe('LATE');
  });
});

describe('status shift kasir', () => {
  it('mengenali kosakata kanonik', () => {
    expect(normalisasiStatusShift('AKTIF')).toBe('AKTIF');
    expect(normalisasiStatusShift('DITUTUP')).toBe('DITUTUP');
  });

  // Sengaja memilih yang paling membatasi: shift berstatus rusak yang dibaca
  // AKTIF akan mengizinkan penerimaan uang atas nama laci yang tidak jelas.
  it('menganggap nilai rusak sebagai DITUTUP, bukan AKTIF', () => {
    expect(normalisasiStatusShift(null)).toBe('DITUTUP');
    expect(normalisasiStatusShift('')).toBe('DITUTUP');
    expect(normalisasiStatusShift('ENTAH')).toBe('DITUTUP');
  });
});

describe('status jadwal & penggantian', () => {
  it('menormalkan status jadwal', () => {
    expect(normalisasiStatusJadwal('DIBATALKAN')).toBe('DIBATALKAN');
    expect(normalisasiStatusJadwal('DIJADWALKAN')).toBe('DIJADWALKAN');
    expect(normalisasiStatusJadwal(null)).toBe('DIJADWALKAN');
  });

  // Nilai rusak tidak boleh terbaca sebagai "sudah disetujui".
  it('menganggap penggantian tak dikenal sebagai menunggu persetujuan', () => {
    expect(normalisasiStatusPenggantian('APPROVED')).toBe('APPROVED');
    expect(normalisasiStatusPenggantian('REJECTED')).toBe('REJECTED');
    expect(normalisasiStatusPenggantian(null)).toBe('PENDING_APPROVAL');
    expect(normalisasiStatusPenggantian('ENTAH')).toBe('PENDING_APPROVAL');
  });
});

describe('jenis pergerakan kas', () => {
  it('hanya menerima MASUK dan KELUAR', () => {
    expect(isJenisKas('MASUK')).toBe(true);
    expect(isJenisKas('KELUAR')).toBe(true);
    expect(isJenisKas('TRANSFER')).toBe(false);
    expect(isJenisKas(null)).toBe(false);
  });
});
