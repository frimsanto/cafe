import type { UserRole } from './auth';
import type { Order } from './order';

/** Bentuk data terminal POS di sisi klien — cerminan DTO backend. */

export interface SesiKasirDTO {
  userId: string;
  nama: string;
  role: UserRole;
  cafeId: string;
  cafeName: string;
  deviceId: string;
  deviceLabel: string;
}

export interface PetugasRingkasDTO {
  id: string;
  name: string;
  role: UserRole;
}

export interface PemasanganDTO {
  terpasang: boolean;
  deviceId: string;
  label: string;
  cafeId: string;
}

// ── Jadwal ───────────────────────────────────────────────────────────────────

export interface TemplateShiftDTO {
  id: string;
  nama: string;
  jamMulai: string;
  jamSelesai: string;
  menitMulai: number;
  menitSelesai: number;
  lewatTengahMalam: boolean;
  toleransiTerlambatMenit: number;
  hariBerlaku: number[];
  aktif: boolean;
  urutan: number;
  catatan: string | null;
}

export interface JadwalDTO {
  id: string;
  tanggal: string;
  status: string;
  catatan: string | null;
  template: TemplateShiftDTO;
  staf: { id: string; nama: string; role: string };
  terminal: { id: string; label: string } | null;
  mulaiPada: string;
  selesaiPada: string;
}

// ── Absensi ──────────────────────────────────────────────────────────────────

export type StatusAbsensi =
  | 'SCHEDULED'
  | 'PRESENT'
  | 'LATE'
  | 'PERMISSION'
  | 'SICK'
  | 'ABSENT'
  | 'REPLACED'
  | 'OVERTIME'
  | 'EARLY_LEAVE'
  | 'COMPLETED';

export interface AbsensiDTO {
  id: string;
  userId: string;
  nama: string;
  status: StatusAbsensi;
  masukPada: string | null;
  keluarPada: string | null;
  terlambatMenit: number | null;
  lemburMenit: number | null;
  durasiMenit: number | null;
  pengecualianFoto: boolean;
  alasanPengecualian: string | null;
  disetujuiPada: string | null;
  jadwal: { id: string; namaShift: string; mulaiPada: string; selesaiPada: string } | null;
  foto: Array<{
    id: string;
    jenis: string;
    terlambatDiunggah: boolean;
    diterimaPada: string;
  }>;
  catatan: string | null;
}

export interface StatusAbsensiPosDTO {
  absensi: AbsensiDTO | null;
  jadwalCocok: JadwalDTO[];
}

// ── Shift kasir ──────────────────────────────────────────────────────────────

export interface RekapShiftDTO {
  modalAwal: number;
  penjualanTunai: number;
  kasMasuk: number;
  kasKeluar: number;
  tunaiSeharusnya: number;
  tunaiAktual: number | null;
  selisih: number | null;
  nonTunai: Array<{ metode: string; total: number; jumlahTransaksi: number }>;
  totalNonTunai: number;
  jumlahTransaksi: number;
  pesananDibatalkan: number;
  pembayaranDitolak: number;
}

export interface ShiftDTO {
  id: string;
  status: 'AKTIF' | 'DITUTUP';
  namaShift: string;
  kasir: { id: string; nama: string };
  terminal: { id: string; label: string } | null;
  dibukaPada: string;
  ditutupPada: string | null;
  catatanBuka: string | null;
  catatanTutup: string | null;
  attendanceId: string | null;
  rekap: RekapShiftDTO;
  pergerakanKas: Array<{
    id: string;
    jenis: 'MASUK' | 'KELUAR';
    nominal: number;
    alasan: string;
    createdAt: string;
  }>;
  dikoreksi: { pada: string; alasan: string | null } | null;
}

// ── Penggantian ──────────────────────────────────────────────────────────────

export type StatusPenggantian = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface PenggantianDTO {
  id: string;
  status: StatusPenggantian;
  alasan: string;
  diajukanPada: string;
  diputuskanPada: string | null;
  alasanKeputusan: string | null;
  jadwal: { id: string; tanggal: string; namaShift: string };
  staffTerjadwal: { id: string; nama: string };
  staffPengganti: { id: string; nama: string };
}

// ── Riwayat kasir ────────────────────────────────────────────────────────────

export interface RiwayatSayaDTO {
  bolehLihatShiftLama: boolean;
  shift: Array<{
    id: string;
    namaShift: string;
    dibukaPada: string;
    ditutupPada: string | null;
    status: string;
  }>;
  pesanan: Order[];
}
