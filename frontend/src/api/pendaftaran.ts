import { apiFetch } from '../lib/apiClient';

// Formulir pendaftaran publik.
//
//   POST /api/public/daftar  { nama_cafe, nama_pemilik, email, no_hp, pesan? }
//
// Endpoint ini TIDAK menerbitkan akun dan tidak membalas token: ia hanya
// menitipkan permintaan pendaftaran untuk ditindaklanjuti admin. Karena itu
// tidak ada `writeAuthSession` di sekitar pemanggilnya — halaman `/daftar`
// berhenti di layar "kami hubungi lewat WhatsApp".
//
// Nama field-nya snake_case mengikuti kontrak formulir publik; sisi React tetap
// camelCase dan pemetaannya dikerjakan di sini supaya hanya ada satu tempat
// yang perlu diperiksa saat kontraknya berubah.

/** Data yang diisi pendaftar di halaman `/daftar`. */
export interface PendaftaranPayload {
  namaCafe: string;
  namaPemilik: string;
  email: string;
  noHp: string;
  pesan: string;
}

/** Tanda terima pendaftaran — statusnya selalu `baru` saat baru masuk. */
export interface PendaftaranDiterima {
  id: string;
  status: string;
  createdAt: string;
}

export const pendaftaranApi = {
  daftar(input: PendaftaranPayload): Promise<PendaftaranDiterima> {
    const pesan = input.pesan.trim();
    return apiFetch<PendaftaranDiterima>('/api/public/daftar', {
      method: 'POST',
      body: JSON.stringify({
        nama_cafe: input.namaCafe.trim(),
        nama_pemilik: input.namaPemilik.trim(),
        email: input.email.trim().toLowerCase(),
        no_hp: input.noHp.trim(),
        // Field opsional: kirim hanya bila diisi, jangan string kosong.
        ...(pesan ? { pesan } : {}),
      }),
    });
  },
};
