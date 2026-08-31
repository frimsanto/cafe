import { apiFetch } from '../lib/apiClient';
import type {
  PerangkatDTO,
  PerangkatBaruDTO,
  StafDTO,
  StafBaruBody,
  StafUbahBody,
} from '../types/staf';

/**
 * Endpoint Manajemen Staf & perangkat POS — PEMILIK saja.
 *
 * Tidak ada `cafeId` di satu pun jalur di bawah: kafenya selalu diambil backend
 * dari token pemanggil. Itu bukan penyederhanaan melainkan bagian dari isolasi
 * tenant — id kafe yang bisa dititipkan klien adalah id kafe yang bisa ditebak.
 *
 * ── PIN tidak pernah bolak-balik ──
 *
 * PIN hanya bergerak SATU ARAH: dari layar pemilik ke server. Tidak ada
 * endpoint yang mengembalikannya, dan `StafDTO` hanya membawa `punyaPin`
 * (true/false). "Reset PIN" berarti mengganti dengan yang baru, lalu pemilik
 * menyampaikannya langsung ke stafnya.
 */
const id = encodeURIComponent;

export const stafApi = {
  daftar(): Promise<StafDTO[]> {
    return apiFetch<StafDTO[]>('/api/staf');
  },

  tambah(body: StafBaruBody): Promise<StafDTO> {
    return apiFetch<StafDTO>('/api/staf', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  perbarui(userId: string, body: StafUbahBody): Promise<StafDTO> {
    return apiFetch<StafDTO>(`/api/staf/${id(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  ubahAktif(userId: string, aktif: boolean): Promise<StafDTO> {
    return apiFetch<StafDTO>(`/api/staf/${id(userId)}/aktif`, {
      method: 'PUT',
      body: JSON.stringify({ aktif }),
    });
  },

  aturPin(userId: string, pin: string): Promise<StafDTO> {
    return apiFetch<StafDTO>(`/api/staf/${id(userId)}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pin }),
    });
  },

  bukaKunciPin(userId: string): Promise<StafDTO> {
    return apiFetch<StafDTO>(`/api/staf/${id(userId)}/buka-kunci`, { method: 'POST' });
  },
};

export const perangkatApi = {
  daftar(): Promise<PerangkatDTO[]> {
    return apiFetch<PerangkatDTO[]>('/api/perangkat');
  },

  /**
   * Daftarkan terminal baru.
   *
   * Balasannya memuat KODE PEMASANGAN — satu-satunya kali kode itu terlihat,
   * dan ia berumur pendek. Kalau kedaluwarsa, `terbitkanKode` di bawah membuat
   * yang baru tanpa perlu mencabut terminalnya.
   */
  daftarkan(label: string): Promise<PerangkatBaruDTO> {
    return apiFetch<PerangkatBaruDTO>('/api/perangkat', {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  },

  /** Terbitkan ulang kode pemasangan untuk terminal yang sudah ada. */
  terbitkanKode(deviceId: string): Promise<PerangkatBaruDTO> {
    return apiFetch<PerangkatBaruDTO>(`/api/perangkat/${id(deviceId)}/kode`, {
      method: 'POST',
    });
  },

  cabut(deviceId: string): Promise<PerangkatDTO> {
    return apiFetch<PerangkatDTO>(`/api/perangkat/${id(deviceId)}`, {
      method: 'DELETE',
    });
  },
};
