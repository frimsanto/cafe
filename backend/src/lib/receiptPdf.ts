import PDFDocument from 'pdfkit';
import type { Cafe, Order, OrderItem, Payment, Table } from '@prisma/client';
import { formatRupiah } from './money';

/** Order lengkap dengan relasi yang dibutuhkan struk. */
export type ReceiptOrder = Order & {
  cafe: Cafe;
  table: Table;
  items: OrderItem[];
  payment: Payment | null;
};

const METHOD_LABEL: Record<string, string> = {
  QRIS: 'QRIS',
  GOPAY: 'GoPay',
  CARD: 'Kartu Kredit/Debit',
  CASH: 'Tunai',
  EDC: 'Kartu (EDC)',
};

function formatDateTime(date: Date): string {
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Membangun struk pembayaran PDF (lebar 80mm ala printer thermal) dan mem-pipe-
 * nya ke stream tujuan (mis. HTTP response).
 */
export function streamReceiptPdf(stream: NodeJS.WritableStream, order: ReceiptOrder): void {
  const WIDTH = 226.77; // 80mm dalam poin
  const MARGIN = 16;
  const CONTENT_W = WIDTH - MARGIN * 2;
  const estHeight = 240 + order.items.length * 48;

  const doc = new PDFDocument({
    size: [WIDTH, estHeight],
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
  });
  doc.pipe(stream);

  const dashed = () => {
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(WIDTH - MARGIN, doc.y)
      .dash(2, { space: 2 })
      .strokeColor('#999999')
      .stroke()
      .undash();
    doc.moveDown(0.5);
  };

  // Baris kiri–kanan pada baris y yang sama.
  const rowLR = (left: string, right: string) => {
    const y = doc.y;
    doc.text(left, MARGIN, y, { lineBreak: false });
    doc.text(right, MARGIN, y, { align: 'right', width: CONTENT_W });
  };

  // Header kafe.
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text(order.cafe.name, {
    align: 'center',
  });
  if (order.cafe.address) {
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(order.cafe.address, {
      align: 'center',
    });
  }
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('STRUK PEMBAYARAN', {
    align: 'center',
  });
  doc.moveDown(0.4);
  dashed();

  // Meta pesanan.
  doc.font('Helvetica').fontSize(8).fillColor('#000000');
  rowLR('No. Pesanan', order.id);
  rowLR('Meja', order.table.tableName);
  rowLR('Waktu', formatDateTime(order.createdAt));
  dashed();

  // Item.
  order.items.forEach((item) => {
    const price = Number(item.price);
    doc.font('Helvetica').fontSize(9).fillColor('#000000').text(item.name, MARGIN, doc.y, {
      width: CONTENT_W,
    });
    const y = doc.y;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(`${item.quantity} x ${formatRupiah(price)}`, MARGIN, y, { lineBreak: false });
    doc
      .fontSize(9)
      .fillColor('#000000')
      .text(formatRupiah(price * item.quantity), MARGIN, y, {
        align: 'right',
        width: CONTENT_W,
      });
    if (item.notes) {
      doc
        .fontSize(7.5)
        .fillColor('#777777')
        .text(`Catatan: ${item.notes}`, MARGIN, doc.y, { width: CONTENT_W });
      doc.fillColor('#000000');
    }
    doc.moveDown(0.3);
  });
  dashed();

  // Ringkasan.
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
  rowLR('TOTAL', formatRupiah(Number(order.totalAmount)));
  doc.font('Helvetica').fontSize(8).moveDown(0.2);
  if (order.payment) {
    rowLR('Metode', METHOD_LABEL[order.payment.method] ?? order.payment.method);
    rowLR('Status', order.payment.status === 'SUCCESS' ? 'LUNAS' : order.payment.status);
    if (order.payment.transactionId) {
      rowLR('ID Transaksi', order.payment.transactionId);
    }
  }
  dashed();

  // Footer.
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#555555')
    .text('Terima kasih atas kunjungan Anda!', { align: 'center' });
  doc.fontSize(7).text('Simpan struk ini sebagai bukti pembayaran.', { align: 'center' });

  doc.end();
}
