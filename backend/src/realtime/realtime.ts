import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { OrderDTO, OrderWithTableDTO } from '../dto/order.dto';

// Mekanisme realtime berbasis WebSocket native (library `ws`) — bukan Socket.io
// / Supabase. Klien (Layar Dapur, HP pelanggan) berlangganan channel per kafe
// (`cafeId`) sehingga pesan hanya sampai ke tenant yang tepat.
//
// Protokol pesan (JSON):
//   Client → server: { "type": "subscribe", "cafeId": "<id>" }
//   Server → client: { "type": "<event>", "data": <payload> }
// Berlangganan juga bisa lewat query saat connect: ws://host/ws?cafeId=<id>

type WsData = { cafeId: string | null; isAlive: boolean };

const HEARTBEAT_MS = 30_000;

function parseCafeId(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const cafeId = url.searchParams.get('cafeId');
    return cafeId && cafeId.trim() !== '' ? cafeId.trim() : null;
  } catch {
    return null;
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
      this.meta.set(ws, { cafeId: parseCafeId(req), isAlive: true });

      ws.on('pong', () => {
        const m = this.meta.get(ws);
        if (m) m.isAlive = true;
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; cafeId?: string };
          if (msg.type === 'subscribe' && typeof msg.cafeId === 'string') {
            const m = this.meta.get(ws);
            if (m) m.cafeId = msg.cafeId.trim() || null;
            ws.send(JSON.stringify({ type: 'subscribed', cafeId: msg.cafeId }));
          }
        } catch {
          /* pesan bukan JSON valid — abaikan */
        }
      });

      // Sapa klien; kirim status langganan awal (dari query, bila ada).
      const cafeId = this.meta.get(ws)?.cafeId ?? null;
      ws.send(JSON.stringify({ type: 'connected', cafeId }));
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

  /** Kirim payload ke seluruh klien yang berlangganan sebuah kafe. */
  broadcastToCafe(cafeId: string, payload: unknown): void {
    if (!this.wss) return;
    const message = JSON.stringify(payload);
    this.wss.clients.forEach((ws) => {
      const m = this.meta.get(ws);
      if (m?.cafeId === cafeId && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  /** Pesanan baru masuk ke dapur (setelah pembayaran sukses). */
  emitKitchenOrderCreated(cafeId: string, order: OrderWithTableDTO): void {
    this.broadcastToCafe(cafeId, { type: 'kitchen.order.created', data: order });
  }

  /** Pesanan diperbarui (mis. status masak item berubah). */
  emitKitchenOrderUpdated(cafeId: string, order: OrderWithTableDTO): void {
    this.broadcastToCafe(cafeId, { type: 'kitchen.order.updated', data: order });
  }

  /**
   * Notifikasi ke pelanggan: seluruh item pesanan sudah siap.
   * Klien pelanggan menyaring event ini berdasarkan `data.id` (order miliknya).
   */
  emitOrderReady(cafeId: string, order: OrderDTO): void {
    this.broadcastToCafe(cafeId, { type: 'order.ready', data: order });
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
