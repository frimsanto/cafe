import QRCode from 'qrcode';
import { ApiError } from './ApiError';

/**
 * Gambar QR meja untuk dicetak.
 *
 * Ukuran default sengaja besar (1024 px): stiker meja biasanya dicetak, dan QR
 * beresolusi layar akan pecah saat diperbesar. Level koreksi kesalahan "M"
 * dipilih karena stiker meja rawan tergores/terkena tumpahan — QR tetap
 * terbaca meski sebagian rusak.
 */
export const DEFAULT_QR_SIZE = 1024;
const MIN_QR_SIZE = 256;
const MAX_QR_SIZE = 2048;

/** Baca & validasi query `size` (piksel sisi gambar). */
export function parseQrSize(value: unknown): number {
  if (value === undefined) return DEFAULT_QR_SIZE;

  const size = Number(value);
  if (!Number.isInteger(size) || size < MIN_QR_SIZE || size > MAX_QR_SIZE) {
    throw ApiError.badRequest(
      `Parameter "size" harus bilangan bulat ${MIN_QR_SIZE}–${MAX_QR_SIZE}`,
    );
  }
  return size;
}

/** PNG QR code sebagai buffer, siap dikirim sebagai berkas unduhan. */
export function renderQrPng(text: string, size = DEFAULT_QR_SIZE): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: size,
    margin: 2, // "quiet zone" — tanpa ini banyak pemindai gagal membaca
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

/** "Meja 12" -> "meja-12", supaya aman dipakai sebagai nama berkas. */
export function slugifyFileName(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'meja'
  );
}
