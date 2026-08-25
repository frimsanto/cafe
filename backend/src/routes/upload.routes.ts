import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth, requireRole } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import { ApiError } from '../lib/ApiError';
import { uploadService } from '../services/upload.service';

/**
 * Unggah berkas ke Cloudinary.
 *
 * Berbeda dari endpoint menu, tidak ada `:cafeId` pada URL: tenant SEPENUHNYA
 * ditentukan token. Kalau kafe tujuan bisa dipilih klien, pemilik kafe A akan
 * bisa menitipkan (atau menghapus) berkas di folder kafe B.
 */
export const uploadRouter = Router();

/** Hanya pemilik kafe yang boleh mengubah aset menu. */
const ownerOnly = [requireAuth, requireRole('OWNER')];

// POST /api/upload/menu-item — unggah satu foto item menu (field: `foto`).
uploadRouter.post(
  '/upload/menu-item',
  ownerOnly,
  uploadSingle,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('Belum ada foto yang dipilih.');
    }

    const data = await uploadService.unggahFotoMenu(
      req.auth!.cafeId,
      req.file.buffer,
    );

    res.status(201).json({ data });
  }),
);

// DELETE /api/upload/menu-item/:publicId — hapus foto dari Cloudinary.
// Public id memuat garis miring (`cafeos/<cafeId>/menu/<berkas>`), jadi polanya
// dibuat menerima sisa jalur apa adanya — klien boleh mengirimnya ter-encode
// (`%2F`) maupun mentah.
uploadRouter.delete(
  '/upload/menu-item/:publicId(.*)',
  ownerOnly,
  asyncHandler(async (req, res) => {
    await uploadService.hapusFotoMenu(req.auth!.cafeId, req.params.publicId);
    res.json({ data: { berhasil: true } });
  }),
);
