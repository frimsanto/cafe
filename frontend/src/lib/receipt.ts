import type { Order } from '../types/order';
import type { CafeInfo } from '../types/menu';
import { formatRupiah } from './format';
import { cashierPaymentMethods, paymentMethods } from '../data/paymentMethods';

// Struk dibuat pada halaman selebar 80mm (ala printer thermal) dengan tinggi
// dihitung dari jumlah item, lalu diunduh sebagai berkas PDF.

const WIDTH = 80; // mm
const MARGIN = 6;
const LINE = 5; // tinggi baris standar

function methodLabel(order: Order): string {
  // Metode bisa berasal dari pembayaran di meja maupun di kasir.
  const all = [...paymentMethods, ...cashierPaymentMethods];
  return all.find((m) => m.code === order.payment.method)?.name ?? order.payment.method;
}

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Bangun struk pembayaran PDF dari sebuah Order dan langsung mengunduhnya.
 *
 * jsPDF di-import dinamis agar tidak membebani bundle awal — pustaka hanya
 * dimuat saat pelanggan benar-benar mengunduh struk.
 *
 * Fase frontend: dibangun dari data order lokal (mock). Fase backend bisa
 * memindahkan pembuatan struk ke server bila diperlukan.
 */
export async function downloadReceiptPdf(order: Order, cafe: CafeInfo): Promise<void> {
  const { jsPDF } = await import('jspdf');

  // Perkiraan tinggi: header + baris item (nama + subtotal) + ringkasan + footer.
  const estHeight = 70 + order.items.length * (LINE * 2) + 40;

  const doc = new jsPDF({ unit: 'mm', format: [WIDTH, estHeight] });
  const right = WIDTH - MARGIN;
  const contentWidth = WIDTH - MARGIN * 2;
  let y = 10;

  const centered = (text: string, size: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, WIDTH / 2, y, { align: 'center' });
    y += LINE;
  };

  const dashed = () => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setDrawColor(150);
    doc.line(MARGIN, y, right, y);
    doc.setLineDashPattern([], 0);
    y += LINE;
  };

  const row = (
    left: string,
    rightText: string,
    opts: { bold?: boolean; size?: number } = {},
  ) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 9);
    doc.text(left, MARGIN, y);
    doc.text(rightText, right, y, { align: 'right' });
    y += LINE;
  };

  // Header kafe
  centered(cafe.name, 13, true);
  doc.setTextColor(90);
  centered(cafe.tagline, 8);
  doc.setTextColor(0);
  y += 1;
  centered('STRUK PEMBAYARAN', 9, true);
  y += 1;
  dashed();

  // Meta pesanan
  row('No. Pesanan', order.id, { size: 8 });
  row('Meja', order.tableName, { size: 8 });
  row('Waktu', formatWaktu(order.createdAt), { size: 8 });
  dashed();

  // Item
  order.items.forEach((item) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    // Nama item bisa panjang — bungkus agar tidak keluar area.
    const nameLines = doc.splitTextToSize(item.name, contentWidth);
    doc.text(nameLines, MARGIN, y);
    y += nameLines.length * LINE;

    doc.setTextColor(110);
    doc.setFontSize(8);
    doc.text(`${item.quantity} x ${formatRupiah(item.price)}`, MARGIN, y);
    doc.setTextColor(0);
    doc.setFontSize(9);
    doc.text(formatRupiah(item.price * item.quantity), right, y, { align: 'right' });
    y += LINE;

    if (item.notes) {
      doc.setTextColor(130);
      doc.setFontSize(7.5);
      const noteLines = doc.splitTextToSize(`Catatan: ${item.notes}`, contentWidth);
      doc.text(noteLines, MARGIN, y);
      y += noteLines.length * (LINE - 1);
      doc.setTextColor(0);
    }
    y += 1;
  });

  dashed();

  // Ringkasan
  row('TOTAL', formatRupiah(order.totalAmount), { bold: true, size: 11 });
  y += 1;
  row('Metode', methodLabel(order), { size: 8 });
  row('Status', order.payment.status === 'SUCCESS' ? 'LUNAS' : order.payment.status, {
    size: 8,
  });
  row('ID Transaksi', order.payment.transactionId, { size: 8 });
  dashed();

  // Footer
  doc.setTextColor(90);
  centered('Terima kasih atas kunjungan Anda!', 8);
  centered('Simpan struk ini sebagai bukti pembayaran.', 7);
  doc.setTextColor(0);

  doc.save(`struk-${order.id}.pdf`);
}
