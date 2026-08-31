#!/usr/bin/env node
/**
 * Health check handshake WebSocket — LEWAT NGINX, bukan langsung ke backend.
 *
 * ── Kenapa harus lewat Nginx ──
 *
 * Yang bisa gagal di sini justru ada DI ANTARA keduanya. Autentikasi staf
 * dibawa header `Sec-WebSocket-Protocol` dan sesi terminal dibawa `Cookie`;
 * kalau reverse proxy tidak meneruskan salah satunya, backend tidak melihat
 * kredensial apa pun dan menolak setiap layar staf dengan 401 — sementara uji
 * yang menembak `localhost:4001` langsung akan lulus dengan gembira dan tidak
 * memberi tahu apa-apa.
 *
 * ── Tiga hasil yang harus benar bersamaan ──
 *
 *   A. token staf yang sah          → 101, dan balasannya menyebut `cafeos.v1`
 *   B. cookie terminal POS yang sah → 101
 *   C. tanpa kredensial             → 401
 *   D. origin asing                 → 403
 *
 * C sendirian tidak cukup: server yang rusak total juga menjawab 401 untuk
 * segalanya. A yang membuktikan kredensialnya benar-benar sampai; C yang
 * membuktikan ketiadaannya benar-benar ditolak. Keduanya harus lulus.
 *
 * Pemakaian:
 *   WS_TOKEN=<jwt> WS_COOKIE="cafeos_device=…; cafeos_pos=…" \
 *     node scripts/cek-ws.mjs --base https://cafe.fessolution.my.id/cafe-ws \
 *                             --resolve 127.0.0.1
 *
 * Kredensial dibaca dari environment, bukan argumen: argumen baris perintah
 * terlihat di `ps` bagi setiap pengguna mesin itu.
 */
import https from 'node:https';
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
function opsi(nama, bawaan = null) {
  const i = args.indexOf(nama);
  return i === -1 ? bawaan : (args[i + 1] ?? bawaan);
}

const base = opsi('--base', 'https://cafe.fessolution.my.id/cafe-ws');
const resolve = opsi('--resolve', null);
const url = new URL(base);
const aman = url.protocol === 'https:';
const origin = opsi('--origin', `${aman ? 'https' : 'http'}://${url.hostname}`);

const token = process.env.WS_TOKEN ?? '';
const cookie = process.env.WS_COOKIE ?? '';

/**
 * Kirim satu permintaan upgrade dan laporkan status yang benar-benar diterima.
 *
 * Node memancarkan `upgrade` untuk 101 dan `response` untuk selain itu — dua
 * jalur berbeda untuk satu pertanyaan yang sama, jadi keduanya bermuara ke
 * penyelesaian yang sama di sini.
 */
function handshake({ jalur = '', protokol, cookie: kuki, origin: asal }) {
  return new Promise((selesai) => {
    const opsiReq = {
      host: resolve ?? url.hostname,
      port: url.port || (aman ? 443 : 80),
      path: url.pathname + jalur,
      method: 'GET',
      headers: {
        Host: url.host,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        ...(asal ? { Origin: asal } : {}),
        ...(protokol ? { 'Sec-WebSocket-Protocol': protokol } : {}),
        ...(kuki ? { Cookie: kuki } : {}),
      },
      ...(aman ? { servername: url.hostname, rejectUnauthorized: false } : {}),
    };

    const req = (aman ? https : http).request(opsiReq);
    let sudah = false;
    const jawab = (hasil) => {
      if (sudah) return;
      sudah = true;
      req.destroy();
      selesai(hasil);
    };

    req.on('upgrade', (res, socket) => {
      socket.destroy();
      jawab({ status: 101, subprotokol: res.headers['sec-websocket-protocol'] ?? null });
    });
    req.on('response', (res) => {
      res.resume();
      jawab({ status: res.statusCode ?? 0, subprotokol: null });
    });
    req.on('error', (err) => jawab({ status: 0, galat: err.message }));
    req.setTimeout(10_000, () => jawab({ status: 0, galat: 'timeout' }));
    req.end();
  });
}

const PROTOKOL = 'cafeos.v1';
const hasil = [];

function catat(nama, lulus, keterangan) {
  hasil.push({ nama, lulus });
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${nama}\n         ${keterangan}`);
}

// ── A. Staf dengan token sah → 101 ───────────────────────────────────────────
if (token) {
  const a = await handshake({ protokol: `${PROTOKOL}, bearer.${token}`, origin });
  catat(
    'A. staf dengan token sah → 101',
    a.status === 101 && a.subprotokol === PROTOKOL,
    `status=${a.status} subprotokol=${a.subprotokol ?? '-'}${a.galat ? ` galat=${a.galat}` : ''}`,
  );
} else {
  console.log('LEWAT  A. staf dengan token sah — WS_TOKEN tidak diisi');
}

// ── B. Terminal POS dengan cookie sah → 101 ──────────────────────────────────
if (cookie) {
  const b = await handshake({ protokol: PROTOKOL, cookie, origin });
  catat(
    'B. terminal POS dengan cookie sah → 101',
    b.status === 101 && b.subprotokol === PROTOKOL,
    `status=${b.status} subprotokol=${b.subprotokol ?? '-'}${b.galat ? ` galat=${b.galat}` : ''}`,
  );
} else {
  console.log('LEWAT  B. terminal POS dengan cookie sah — WS_COOKIE tidak diisi');
}

// ── C. Tanpa kredensial → 401 ────────────────────────────────────────────────
const c = await handshake({ protokol: PROTOKOL, origin });
catat(
  'C. tanpa kredensial → 401',
  c.status === 401,
  `status=${c.status}${c.galat ? ` galat=${c.galat}` : ''}`,
);

// ── D. Origin asing → 403 ────────────────────────────────────────────────────
const d = await handshake({
  protokol: token ? `${PROTOKOL}, bearer.${token}` : PROTOKOL,
  origin: 'https://situs-jahat.id',
});
catat(
  'D. origin asing → 403',
  d.status === 403,
  `status=${d.status}${d.galat ? ` galat=${d.galat}` : ''}`,
);

const gagal = hasil.filter((h) => !h.lulus);
console.log(`\n${hasil.length - gagal.length}/${hasil.length} lulus`);
process.exit(gagal.length === 0 ? 0 : 1);
