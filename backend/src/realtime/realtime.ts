import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { OrderDTO, OrderWithTableDTO } from '../dto/order.dto';

// Mekanisme realtime berbasis WebSocket native (library `ws`) — bukan Socket.io
// / Supabase. Klien (Layar Dapur, HP pelanggan) berlangganan channel per kafe
// (`cafeId`) sehingga pesan hanya sampai ke tenant yang tepat.
//
// Protokol pesan (JSON):
//   Client → server: { "type": "subscribe", "cafeId": "<id>", "orderId"?: "<id>" }
//   Server → client: { "type": "<event>", "data": <payload> }
// Berlangganan juga bisa lewat query saat connect:
//   ws://host/ws?cafeId=<id>[&orderId=<id>]
//
// `orderId` MEMPERSEMPIT langganan: klien yang menyebutkannya hanya menerima
// event pesanan itu. Ini dipakai HP pelanggan — kanal kafe tidak berautentikasi,
// jadi tanpa penyempitan ini tiap ponsel tamu akan ikut menerima rincian
// pesanan meja lain (dan angka omzet dasbor). Layar staf (KDS, kasir, dasbor)
// berlangganan tanpa `orderId` dan tetap menerima seluruh aliran kafe.

type WsData = { cafeId: string | null; orderId: string | null; isAlive: boolean };

const HEARTBEAT_MS = 30_000;

/** Ambil nilai query yang tidak kosong; null bila tidak ada. */
function bacaParam(url: URL, nama: string): string | null {
  const nilai = url.searchParams.get(nama);
  return nilai && nilai.trim() !== '' ? nilai.trim() : null;
}

function parseLangganan(req: IncomingMessage): { cafeId: string | null; orderId: string | null } {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    return { cafeId: bacaParam(url, 'cafeId'), orderId: bacaParam(url, 'orderId') };
  } catch {
    return { cafeId: null, orderId: null };
  }
}

class Realtime {
  private wss: WebSocketServer | null = null;
  private meta = new WeakMap<WebSocket, WsData>();
  private heartbeat: NodeJS.Timeout | null = null;

  /** Pasang WS server pada HTTP server Express (berbagi port yang sama). */
  init(server: Server): void {
    if (this.wss) return;
    const wss = new WebSocketServer({ server, path: '/ws' });
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      const awal = parseLangganan(req);
      this.meta.set(ws, { ...awal, isAlive: true });

      ws.on('pong', () => {
        const m = this.meta.get(ws);
        if (m) m.isAlive = true;
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            cafeId?: string;
            orderId?: string;
          };
          if (msg.type === 'subscribe' && typeof msg.cafeId === 'string') {
            const m = this.meta.get(ws);
            if (m) {
              m.cafeId = msg.cafeId.trim() || null;
              // Langganan yang tidak menyebut `orderId` melebar kembali ke
              // seluruh kafe — itu yang dipakai layar staf saat menyambung ulang.
              m.orderId =
                typeof msg.orderId === 'string' ? msg.orderId.trim() || null : null;
            }
            ws.send(
              JSON.stringify({
                type: 'subscribed',
                cafeId: msg.cafeId,
                orderId: msg.orderId ?? null,
              }),
            );
          }
        } catch {
          /* pesan bukan JSON valid — abaikan */
        }
      });

      // Sapa klien; kirim status langganan awal (dari query, bila ada).
      const m = this.meta.get(ws);
      ws.send(
        JSON.stringify({
          type: 'connected',
          cafeId: m?.cafeId ?? null,
          orderId: m?.orderId ?? null,
        }),
      );
    });

    // Heartbeat — putuskan koneksi yang sudah mati.
    this.heartbeat = setInterval(() => {
      wss.clients.forEach((ws) => {
        const m = this.meta.get(ws);
        if (!m) return;
        if (!m.isAlive) {
          ws.terminate();
          return;
        }
        m.isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_MS);
    this.heartbeat.unref?.();

    wss.on('close', () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
    });
  }

  /**
   * Kirim payload ke klien yang berlangganan sebuah kafe.
   *
   * `orderId` menandai pesanan yang diwakili payload ini. Klien yang
   * mempersempit langganannya ke satu pesanan (HP pelanggan) hanya menerima
   * payload dengan `orderId` yang sama — event kafe yang tak terkait, termasuk
   * omzet dasbor dan pesanan meja lain, tidak pernah sampai ke sana.
   */
  broadcastToCafe(cafeId: string, payload: unknown, orderId?: string): void {
    if (!this.wss) return;
    const message = JSON.stringify(payload);
    this.wss.clients.forEach((ws) => {
      const m = this.meta.get(ws);
      if (!m || m.cafeId !== cafeId || ws.readyState !== WebSocket.OPEN) return;
      if (m.orderId !== null && m.orderId !== orderId) return;
      ws.send(message);
    });
  }

  /** Pesanan baru masuk ke dapur (setelah pembayaran sukses). */
  emitKitchenOrderCreated(cafeId: string, order: OrderWithTableDTO): void {
    this.broadcastToCafe(cafeId, { type: 'kitchen.order.created', data: order }, order.id);
  }

  /** Pesanan diperbarui (mis. status masak item berubah). */
  emitKitchenOrderUpdated(cafeId: string, order: OrderWithTableDTO): void {
    this.broadcastToCafe(cafeId, { type: 'kitchen.order.updated', data: order }, order.id);
  }

  /**
   * Notifikasi ke pelanggan: seluruh item pesanan sudah siap.
   * Klien pelanggan menyaring event ini berdasarkan `data.id` (order miliknya).
   */
  emitOrderReady(cafeId: string, order: OrderDTO): void {
    this.broadcastToCafe(cafeId, { type: 'order.ready', data: order }, order.id);
  }

  /**
   * Status pemakaian meja berubah (kosong ⇄ digunakan) karena pesanan masuk
   * atau selesai. Dipakai halaman Manajemen Meja agar penanda warnanya ikut
   * hidup tanpa perlu memuat ulang.
   */
  emitTableStatusChanged(
    cafeId: string,
    data: { tableId: string; status: 'KOSONG' | 'DIGUNAKAN' },
  ): void {
    this.broadcastToCafe(cafeId, { type: 'table.status.changed', data });
  }

  /**
   * Status pembayaran sebuah pesanan berubah (MENUNGGU → LUNAS/GAGAL).
   *
   * Dipancarkan oleh KEDUA jalur pembayaran, termasuk webhook Midtrans yang
   * datang tanpa ada layar yang menunggunya — inilah yang membuat badge status
   * di layar kasir berubah sendiri tanpa menunggu polling.
   */
  emitPaymentStatusChanged(
    cafeId: string,
    data: {
      orderId: string;
      statusPembayaran: string | null;
      metodePembayaran: string | null;
    },
  ): void {
    this.broadcastToCafe(cafeId, { type: 'payment.status.changed', data }, data.orderId);
  }

  /**
   * Pesanan baru DIBAYAR — dipakai dasbor pemilik untuk menaikkan omzet dan
   * hitungan menu terlaris secara langsung tanpa memuat ulang data.
   * Payload sengaja ringkas (hanya yang dibutuhkan agregasi dasbor).
   */
  emitDashboardOrderPaid(cafeId: string, order: OrderDTO): void {
    this.broadcastToCafe(cafeId, {
      type: 'dashboard.order.paid',
      data: {
        orderId: order.id,
        totalAmount: order.totalAmount,
        paidAt: order.payment?.createdAt ?? order.updatedAt,
        items: order.items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
        })),
      },
    });
  }
}

export const realtime = new Realtime();
