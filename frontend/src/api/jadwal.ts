import { apiFetch } from '../lib/apiClient';
import type {
  AbsensiDTO,
  JadwalDTO,
  PenggantianDTO,
  ShiftDTO,
  TemplateShiftDTO,
} from '../types/pos';

/**
 * Endpoint jadwal, absensi, shift, dan penggantian — PEMILIK.
 *
 * Memakai `apiFetch` (token staf), bukan `posFetch` (cookie terminal): pemilik
 * membukanya dari perangkat mana pun, termasuk yang tidak pernah menjadi
 * terminal kasir. Perbedaan itulah yang memisahkan berkas ini dari `api/pos.ts`.
 */
const id = encodeURIComponent;

function rentang(dari: string, sampai: string, userId?: string): string {
  const q = new URLSearchParams({ dari, sampai });
  if (userId) q.set('userId', userId);
  return `?${q.toString()}`;
}

export interface TemplateShiftBody {
  nama: string;
  jamMulai: string;
  jamSelesai: string;
  lewatTengahMalam?: boolean;
  toleransiTerlambatMenit?: number;
  hariBerlaku?: number[];
  aktif?: boolean;
  urutan?: number;
  catatan?: string | null;
}

export const jadwalApi = {
  // ── Template shift ─────────────────────────────────────────────────────────

  daftarTemplate(): Promise<TemplateShiftDTO[]> {
    return apiFetch<TemplateShiftDTO[]>('/api/jadwal/template');
  },

  simpanTemplate(body: TemplateShiftBody, templateId?: string): Promise<TemplateShiftDTO> {
    return apiFetch<TemplateShiftDTO>(
      templateId ? `/api/jadwal/template/${id(templateId)}` : '/api/jadwal/template',
      { method: templateId ? 'PUT' : 'POST', body: JSON.stringify(body) },
    );
  },

  hapusTemplate(templateId: string): Promise<{ dihapus: boolean }> {
    return apiFetch<{ dihapus: boolean }>(`/api/jadwal/template/${id(templateId)}`, {
      method: 'DELETE',
    });
  },

  // ── Penugasan ──────────────────────────────────────────────────────────────

  daftar(dari: string, sampai: string, userId?: string): Promise<JadwalDTO[]> {
    return apiFetch<JadwalDTO[]>(`/api/jadwal${rentang(dari, sampai, userId)}`);
  },

  tetapkan(body: {
    templateId: string;
    userId: string;
    tanggal: string;
    deviceId?: string | null;
    catatan?: string | null;
  }): Promise<JadwalDTO> {
    return apiFetch<JadwalDTO>('/api/jadwal', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  batalkan(jadwalId: string, alasan?: string | null): Promise<JadwalDTO> {
    return apiFetch<JadwalDTO>(`/api/jadwal/${id(jadwalId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ alasan: alasan ?? null }),
    });
  },

  // ── Absensi & shift ────────────────────────────────────────────────────────

  absensi(dari: string, sampai: string, userId?: string): Promise<AbsensiDTO[]> {
    return apiFetch<AbsensiDTO[]>(`/api/absensi${rentang(dari, sampai, userId)}`);
  },

  setujuiPengecualian(absensiId: string): Promise<AbsensiDTO> {
    return apiFetch<AbsensiDTO>(`/api/absensi/${id(absensiId)}/setujui-pengecualian`, {
      method: 'POST',
    });
  },

  shift(dari: string, sampai: string, userId?: string): Promise<ShiftDTO[]> {
    return apiFetch<ShiftDTO[]>(`/api/shift${rentang(dari, sampai, userId)}`);
  },

  // ── Penggantian ────────────────────────────────────────────────────────────

  pengganti(hanyaMenunggu = false): Promise<PenggantianDTO[]> {
    return apiFetch<PenggantianDTO[]>(
      `/api/pengganti${hanyaMenunggu ? '?status=PENDING_APPROVAL' : ''}`,
    );
  },

  putuskanPengganti(
    penggantianId: string,
    setuju: boolean,
    alasan?: string | null,
  ): Promise<PenggantianDTO> {
    return apiFetch<PenggantianDTO>(`/api/pengganti/${id(penggantianId)}/putuskan`, {
      method: 'POST',
      body: JSON.stringify({ setuju, alasan: alasan ?? null }),
    });
  },
};
