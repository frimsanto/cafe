// Pembuatan QR code meja. QR berisi URL menu digital dengan token meja, jadi
// pelanggan yang memindainya langsung mendarat di menu meja yang benar tanpa
// memasang aplikasi apa pun.
//
// Pustaka `qrcode` dimuat saat dibutuhkan (dynamic import) — halaman pelanggan
// yang dibuka dari ponsel tidak ikut menanggung ukurannya.

const QR_DARK = '#0f172a'; // slate-900
const QR_LIGHT = '#ffffff';

async function loadQrCode() {
  return (await import('qrcode')).default;
}

/** URL yang dienkode ke QR meja, mis. https://kafe.id/menu/mj-02-001 */
export function tableMenuUrl(qrCode: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/menu/${qrCode}`;
}

/** QR sebagai data URL PNG — dipakai untuk pratinjau di layar. */
export async function qrDataUrl(text: string, size = 240): Promise<string> {
  const QRCode = await loadQrCode();
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}

/**
 * Susun kartu QR siap cetak (PNG): nama kafe, nama meja, QR, dan ajakan scan —
 * supaya hasil unduhan bisa langsung ditempel di meja tanpa diedit lagi.
 */
export async function downloadTableQrCard(options: {
  tableName: string;
  cafeName: string;
  qrCode: string;
}): Promise<void> {
  const { tableName, cafeName, qrCode } = options;
  const url = tableMenuUrl(qrCode);

  const QRCode = await loadQrCode();
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, url, {
    width: 560,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: QR_DARK, light: QR_LIGHT },
  });

  const card = document.createElement('canvas');
  card.width = 720;
  card.height = 980;
  const ctx = card.getContext('2d');
  if (!ctx) throw new Error('Kanvas tidak didukung di peramban ini.');

  ctx.fillStyle = QR_LIGHT;
  ctx.fillRect(0, 0, card.width, card.height);

  ctx.textAlign = 'center';

  ctx.fillStyle = '#64748b'; // slate-500
  ctx.font = '500 30px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(cafeName, card.width / 2, 90);

  ctx.fillStyle = QR_DARK;
  ctx.font = 'bold 64px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(tableName, card.width / 2, 170);

  ctx.drawImage(qrCanvas, (card.width - 560) / 2, 220);

  ctx.fillStyle = QR_DARK;
  ctx.font = '600 34px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Scan untuk buka menu & pesan', card.width / 2, 860);

  ctx.fillStyle = '#94a3b8'; // slate-400
  ctx.font = '24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(qrCode, card.width / 2, 910);

  const blob = await new Promise<Blob | null>((resolve) =>
    card.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('Gagal membuat berkas PNG.');

  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `qr-${slugify(tableName)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** "Meja 12" -> "meja-12", agar aman dipakai sebagai nama berkas. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
