import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { OrderDTO, OrderWithTableDTO } from '../dto/order.dto';
import {
  PROTOKOL_UTAMA,
  masihSah,
  urlHandshake,
  verifikasiHandshake,
  type IdentitasWs,
} from './wsAuth';

// Mekanisme realtime berbasis WebSocket native (library `ws`) — bukan Socket.io
// / Supabase. Klien berlangganan channel per kafe (`cafeId`) sehingga pesan
// hanya sampai ke tenant yang tepat.
//
// ── cafeId TIDAK datang dari klien ──
//
// Kafe sebuah koneksi ditentukan saat HANDSHAKE, dari sesi yang dibuktikan di
// sana (lihat `wsAuth.ts`): baris `users` untuk staf, token perangkat untuk
// terminal POS, baris `orders` untuk ponsel tamu. Query string dan pesan
// `subscribe` tidak pernah bisa memindahkan sebuah koneksi ke kafe lain — yang
// menyebut kafe orang lain justru diputus.
//
// Protokol pesan (JSON):
//   Client → server: { "type": "subscribe", "orderId"?: "<id>" }
//   Server → client: { "type": "<event>", "data": <payload> }
//
// `orderId` MEMPERSEMPIT langganan: klien yang menyebutkannya hanya menerima
// event pesanan itu. Untuk tamu penyempitan ini WAJIB dan terkunci sejak
// handshake; layar staf (KDS, kasir, dasbor) berlangganan tanpa `orderId` dan
// menerima seluruh aliran kafenya sendiri.

interface WsData {
  identitas: IdentitasWs;
  /** Penyempitan aktif ke satu pesanan; null = seluruh aliran kafe. */
  orderId: string | null;
  isAlive: boolean;
}

const HEARTBEAT_MS = 30_000;

/**
 * Seberapa sering sesi di balik koneksi yang sudah terbuka diperiksa ulang.
 *
 * Bukan sekadar kerapian: sesi kasir berumur 14 jam dan tab dasbor bisa
 * dibiarkan terbuka semalaman. Tanpa pemeriksaan berkala, mencabut sebuah
 * terminal atau menonaktifkan seorang staf tidak menghentikan aliran pesanan
 * yang sedang mereka terima — pencabutannya baru berlaku saat koneksinya
 * kebetulan putus sendiri. Lima menit cukup rapat untuk itu dan cukup jarang
 * untuk tidak membebani database (satu query per koneksi staf/POS).
 */
const REVALIDASI_MS = 5 * 60_000;

/** Kode penutupan khusus aplikasi (4000–4999 dicadangkan RFC 6455). */
const TUTUP_TIDAK_BERHAK = 4403;
const TUTUP_SESI_BERAKHIR = 4401;

/**
 * Identitas hasil handshake, dititipkan dari `verifyClient` ke `connection`.
 *
 * `ws` tidak menyediakan jalan resmi untuk membawa hasil verifikasi ke handler
 * koneksi. WeakMap dipakai alih-alih menempelkan properti ke `req`: kuncinya
 * ikut hilang bersama request-nya, dan tidak ada properti liar yang bisa
 * tertukar dengan milik middleware lain.
 */
const identitasHandshake = new WeakMap<IncomingMessage, IdentitasWs>();

class Realtime {
  private wss: WebSocketServer | null = null;
  private meta = new WeakMap<WebSocket, WsData>();
  private heartbeat: NodeJS.Timeout | null = null;
  private revalidasi: NodeJS.Timeout | null = null;

  /**
   * Pasang WS server pada HTTP server Express (berbagi port yang sama).
   *
   * ── Kenapa handshake-nya diautentikasi, bukan cuma disaring origin ──
   *
   * CORS TIDAK BERLAKU pada WebSocket, dan daftar origin hanya menjawab "dari
   * halaman mana koneksi ini dibuka" — bukan "siapa yang membukanya". Dua hal
   * lolos darinya: klien non-peramban yang cukup TIDAK mengirim `Origin`, dan
   * kasir sah kafe A yang mengganti satu parameter URL menjadi kafe B.
   *
   * Karena itu setiap koneksi sekarang harus membuktikan sesi di handshake, dan
   * kafenya diturunkan dari sesi itu. Daftar origin tetap dipasang sebagai
   * lapis pertama — ia menolak lebih awal dan lebih murah — tapi bukan lagi
   * satu-satunya yang menjaga.
   */
  init(server: Server): void {
    if (this.wss) return;
    const wss = new WebSocketServer({
      server,
      path: '/ws',
      // Klien membawa token staf di sini (`bearer.<jwt>`), jadi subprotokol
      // yang dipilih harus dijawab — peramban memutus koneksi yang menawarkan
      // subprotokol tapi tidak mendapat satu pun kembali.
      handleProtocols: (protocols) =>
        protocols.has(PROTOKOL_UTAMA) ? PROTOKOL_UTAMA : false,
      verifyClient: ({ origin, req }, cb) => {
        void verifikasiHandshake(req, origin)
          .then((hasil) => {
            if (hasil.ok) {
              identitasHandshake.set(req, hasil.identitas);
              cb(true);
              return;
            }
            // Alasannya dicatat, TIDAK dikirim: klien yang ditolak tidak perlu
            // diberi tahu apakah yang salah sesinya, kafenya, atau id
            // pesanannya.
            console.warn(`[realtime] handshake ditolak (${hasil.kode})`);
            cb(false, hasil.status, hasil.pesan);
          })
          .catch((err: unknown) => {
            // Database sedang tidak bisa dihubungi, dsb. Ditolak, bukan
            // diloloskan: kegagalan verifikasi tidak boleh berarti "boleh".
            console.error('[realtime] verifikasi handshake gagal:', err);
            cb(false, 503, 'Verifikasi sesi gagal');
          });
      },
    });
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      const identitas = identitasHandshake.get(req);
      if (!identitas) {
        // Tidak akan terjadi selama `verifyClient` terpasang; ditutup alih-alih
        // dilayani tanpa identitas kalau toh terjadi.
        ws.close(TUTUP_SESI_BERAKHIR, 'Sesi tidak dikenali');
        return;
      }
      identitasHandshake.delete(req);

      this.meta.set(ws, {
        identitas,
        orderId: awalOrderId(identitas, req),
        isAlive: true,
      });

      ws.on('pong', () => {
        const m = this.meta.get(ws);
        if (m) m.isAlive = true;
      });

      ws.on('message', (raw) => this.tanganiPesan(ws, raw.toString()));

      const m = this.meta.get(ws);
      ws.send(
        JSON.stringify({
          type: 'connected',
          // Dikirim balik supaya klien tahu kafe mana yang SERVER tetapkan
          // untuknya — bukan untuk dipakai klien sebagai izin.
          cafeId: identitas.cafeId,
          orderId: m?.orderId ?? null,
          jenis: identitas.jenis,
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

    this.revalidasi = setInterval(() => void this.periksaUlangSesi(), REVALIDASI_MS);
    this.revalidasi.unref?.();

    wss.on('close', () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.revalidasi) clearInterval(this.revalidasi);
    });
  }

  /**
   * Pesan dari klien.
   *
   * Hanya `subscribe` yang berarti, dan yang bisa diubahnya HANYA penyempitan
   * ke satu pesanan. Kafe koneksi sudah ditetapkan saat handshake dan tidak
   * punya jalan untuk berubah di sini.
   */
  private tanganiPesan(ws: WebSocket, teks: string): void {
    const m = this.meta.get(ws);
    if (!m) return;

    let msg: { type?: string; cafeId?: string; orderId?: string };
    try {
      msg = JSON.parse(teks) as typeof msg;
    } catch {
      return; // pesan bukan JSON valid — abaikan
    }
    if (msg.type !== 'subscribe') return;

    // Klien lama mengirim `cafeId` miliknya sendiri dan tetap dilayani. Yang
    // menyebut kafe LAIN sedang mencoba menyeberang; koneksinya diputus, bukan
    // sekadar diabaikan — permintaan seperti itu tidak punya versi yang benar.
    if (typeof msg.cafeId === 'string' && msg.cafeId.trim() !== m.identitas.cafeId) {
      this.tolakLangganan(ws, 'LINTAS_TENANT', 'Kafe pada langganan bukan kafe sesimu');
      return;
    }

    const diminta =
      typeof msg.orderId === 'string' && msg.orderId.trim() !== ''
        ? msg.orderId.trim()
        : null;

    if (m.identitas.jenis === 'tamu') {
      // Tamu terkunci pada pesanannya. Menyambung ulang boleh menegaskan
      // langganan yang sama; melebarkannya ke seluruh kafe tidak.
      if (diminta !== m.identitas.orderId) {
        this.tolakLangganan(
          ws,
          'LANGGANAN_DITOLAK',
          'Langganan ini terbatas pada pesananmu sendiri',
        );
        return;
      }
    } else {
      // Staf & terminal POS boleh mempersempit ke satu pesanan, atau melebar
      // kembali ke seluruh kafenya sendiri saat menyambung ulang. Penyempitan
      // hanyalah saringan — tidak ada hak baru yang bisa lahir darinya, karena
      // siaran sudah disaring per kafe lebih dulu.
      m.orderId = diminta;
    }

    ws.send(
      JSON.stringify({
        type: 'subscribed',
        cafeId: m.identitas.cafeId,
        orderId: m.orderId,
      }),
    );
  }

  private tolakLangganan(ws: WebSocket, kode: string, pesan: string): void {
    console.warn(`[realtime] langganan ditolak (${kode})`);
    ws.send(JSON.stringify({ type: 'error', code: kode, message: pesan }));
    ws.close(TUTUP_TIDAK_BERHAK, pesan);
  }

  /** Putuskan koneksi yang sesinya sudah dicabut sejak handshake. */
  private async periksaUlangSesi(): Promise<void> {
    if (!this.wss) return;
    for (const ws of this.wss.clients) {
      const m = this.meta.get(ws);
      if (!m || ws.readyState !== WebSocket.OPEN) continue;
      try {
        if (await masihSah(m.identitas)) continue;
      } catch {
        // Database sedang bermasalah — koneksi yang sudah terbukti sah
        // dibiarkan hidup. Memutus semua layar kasir karena satu query gagal
        // jauh lebih merugikan daripada menunda pencabutan lima menit.
        continue;
      }
      console.warn('[realtime] sesi dicabut, koneksi ditutup');
      ws.close(TUTUP_SESI_BERAKHIR, 'Sesi sudah tidak berlaku');
    }
  }

  /**
   * Kirim payload ke klien yang berlangganan sebuah kafe.
   *
   * `orderId` menandai pesanan yang diwakili payload ini. Klien yang
   * mempersempit langganannya ke satu pesanan (ponsel tamu) hanya menerima
   * payload dengan `orderId` yang sama — event kafe yang tak terkait, termasuk
   * omzet dasbor dan pesanan meja lain, tidak pernah sampai ke sana.
   */
  broadcastToCafe(cafeId: string, payload: unknown, orderId?: string): void {
    if (!this.wss) return;
    const message = JSON.stringify(payload);
    this.wss.clients.forEach((ws) => {
      const m = this.meta.get(ws);
      if (!m || m.identitas.cafeId !== cafeId || ws.readyState !== WebSocket.OPEN) return;
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

/**
 * Penyempitan awal sebuah koneksi, sebelum pesan `subscribe` pertama datang.
 *
 * Tamu SELALU terkunci pada pesanannya sejak detik pertama — bukan setelah ia
 * sopan mengirim `subscribe`. Antara `connection` dan pesan pertama ada jeda,
 * dan sebuah siaran yang jatuh di jeda itu tidak boleh menemukan ponsel tamu
 * yang masih mendengarkan seluruh kafe.
 */
function awalOrderId(identitas: IdentitasWs, req: IncomingMessage): string | null {
  if (identitas.jenis === 'tamu') return identitas.orderId;
  const nilai = urlHandshake(req).searchParams.get('orderId');
  return nilai && nilai.trim() !== '' ? nilai.trim() : null;
}

export const realtime = new Realtime();
