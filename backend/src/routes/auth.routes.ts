import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { authService } from '../services/auth.service';
import { parseLoginInput, parseRefreshInput } from '../validation/auth.validation';

export const authRouter = Router();

// POST /api/auth/register — DITUTUP.
//
// Endpoint ini dulu membuat kafe + akun OWNER aktif seketika. Sekarang kafe
// baru hanya boleh lahir setelah admin menyetujui pendaftarannya, jadi jalur
// itu dihapus sampai ke service-nya: tidak ada lagi kode di backend yang bisa
// menerbitkan akun tanpa persetujuan. Yang tersisa hanya penanda 410 supaya
// klien lama menerima penjelasan, bukan 404 yang membingungkan.
authRouter.post('/auth/register', (_req, res) => {
  res.status(410).json({
    error:
      'Pendaftaran mandiri sudah ditutup. Kirim permintaan lewat POST /api/public/daftar — akun diaktifkan admin setelah kamu dihubungi.',
  });
});

// POST /api/auth/login — masuk & terima JWT (publik).
authRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const input = parseLoginInput(req.body);
    const session = await authService.login(input);
    res.json({ data: session });
  }),
);

// POST /api/auth/refresh — tukar refresh token dengan token akses baru (publik:
// refresh token itu sendiri yang jadi kredensialnya, jadi tidak butuh header
// Authorization — justru dipanggil ketika token akses sudah kedaluwarsa).
authRouter.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = parseRefreshInput(req.body);
    const session = await authService.refresh(refreshToken);
    res.json({ data: session });
  }),
);
