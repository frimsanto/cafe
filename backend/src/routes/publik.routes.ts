import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { pendaftaranService } from '../services/pendaftaran.service';
import { parsePendaftaranPublikInput } from '../validation/pendaftaran.validation';

export const publikRouter = Router();

/**
 * Kuota formulir pendaftaran: 5 permintaan per jam per IP. Cukup longgar untuk
 * pendaftar yang salah ketik lalu mengulang, cukup ketat untuk menghentikan
 * skrip yang membanjiri antrean admin dengan baris palsu.
 */
const batasPendaftaran = rateLimit({
  maks: 5,
  jendelaMs: 60 * 60 * 1000,
  pesan:
    'Terlalu banyak percobaan pendaftaran dari jaringan ini. Coba lagi dalam satu jam.',
});

// POST /api/public/daftar — kirim permintaan pendaftaran kafe baru (publik).
//
// Endpoint ini TIDAK menerbitkan akun. Ia hanya menitipkan data pendaftar ke
// tabel `tenant_registrations` untuk ditindaklanjuti admin; akun kafe dibuat
// manual setelah pendaftarnya dihubungi.
publikRouter.post(
  '/public/daftar',
  batasPendaftaran,
  asyncHandler(async (req, res) => {
    const input = parsePendaftaranPublikInput(req.body);
    const pendaftaran = await pendaftaranService.daftar(input);
    res.status(201).json({ data: pendaftaran });
  }),
);
