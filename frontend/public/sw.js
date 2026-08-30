/* CafeOS Service Worker — menerima Web Push & menampilkan notifikasi. */

/**
 * Pola getaran "pesanan siap": tiga denyut panjang berjeda pendek.
 *
 * Sengaja lebih tegas daripada getaran notifikasi biasa — ponsel tamu lazimnya
 * tergeletak di meja menghadap ke bawah di tengah keramaian kafe, jadi satu
 * denyut singkat kerap tidak terasa dan tidak terdengar.
 */
const GETAR_SIAP = [300, 100, 300, 100, 300];

/**
 * Tempat halaman menitipkan bekal untuk `pushsubscriptionchange` (lihat
 * `src/lib/push.ts`). Service Worker tidak bisa membaca localStorage, jadi
 * Cache Storage adalah satu-satunya laci yang bisa dijangkau keduanya.
 */
const CACHE_KONTEKS = 'cafeos-push-ctx';
const KUNCI_KONTEKS = '/__cafeos_push_ctx';

/**
 * Ambil alih segera, tanpa menunggu seluruh tab lama ditutup.
 *
 * Tanpa dua pengait ini, versi baru sw.js hanya "waiting" sampai tamu menutup
 * SEMUA tab CafeOS — di ponsel itu berarti perbaikan di berkas ini baru berlaku
 * entah kapan, dan uji coba notifikasi masih dilayani kode lama.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Payload bukan JSON (mis. uji coba dari alat luar) — tetap tampilkan
    // sesuatu. Notifikasi yang salah bunyi masih jauh lebih baik daripada
    // tidak ada notifikasi: `userVisibleOnly` membuat push yang TIDAK
    // menampilkan apa pun dihukum peramban, sampai push berikutnya diblokir.
    data = { title: 'CafeOS', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Pesanan Siap! 🎉';
  const options = {
    body: data.body || 'Pesananmu sudah siap disajikan!',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: GETAR_SIAP,
    // Satu notifikasi per pesanan: kiriman ulang MENGGANTI yang lama alih-alih
    // menumpuk beberapa "Pesanan Siap!" di baki notifikasi. Notifikasi uji
    // membawa tag sendiri agar tidak menimpa kabar pesanan sungguhan.
    tag: data.tag || (data.orderId ? `pesanan-siap-${data.orderId}` : 'pesanan-siap'),
    // Berpasangan dengan `tag`: tanpa ini, notifikasi pengganti muncul DIAM —
    // tanpa bunyi maupun getar — karena peramban menganggapnya sekadar
    // pemutakhiran notifikasi yang sudah ada.
    renotify: true,
    // Eksplisit `false`: inilah yang membuat ponsel membunyikan nada
    // notifikasinya. Nada mana yang berbunyi adalah urusan setelan sistem —
    // web tidak bisa memilihkannya — tapi `silent: true` (atau nilai warisan
    // dari langganan lama) membungkamnya sama sekali.
    silent: false,
    // Notifikasi bertahan sampai disentuh — tamu yang sedang mengobrol tidak
    // kehilangan kabarnya hanya karena tidak melihat layar selama lima detik.
    requireInteraction: true,
    data: { orderId: data.orderId || null },
    actions: [{ action: 'lihat', title: 'Lihat Status' }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Tombol "Lihat Status" dan badan notifikasi menuju tempat yang sama —
  // halaman status pesanan itu sendiri.
  const orderId = event.notification.data && event.notification.data.orderId;
  const tujuan = orderId ? `/pesanan/${orderId}` : '/';
  const tujuanUrl = new URL(tujuan, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Tab yang SUDAH berada di halaman yang dituju cukup difokuskan.
      const sudahDiSana = clients.find((c) => c.url === tujuanUrl);
      if (sudahDiSana) return sudahDiSana.focus();

      // Ada tab CafeOS lain yang terbuka: arahkan tab itu, jangan sekadar
      // memfokuskannya. Sebelumnya tamu yang menyentuh notifikasi sementara
      // aplikasinya terbuka di halaman menu hanya melihat halaman menu lagi —
      // status pesanannya, satu-satunya alasan ia menyentuh notifikasi itu,
      // tidak pernah muncul.
      const lain = clients[0];
      if (lain && 'navigate' in lain) {
        return lain.navigate(tujuanUrl).then((c) => (c ? c.focus() : undefined));
      }
      if (lain) return lain.focus();

      if (self.clients.openWindow) return self.clients.openWindow(tujuanUrl);
      return undefined;
    }),
  );
});

/**
 * Langganan diputar ulang oleh peramban — daftarkan yang baru, diam-diam.
 *
 * Peristiwa ini terjadi tanpa halaman mana pun terbuka (peramban memutar kunci
 * langganan atas kemauannya sendiri). Kalau dibiarkan, langganan yang tercatat
 * di server menjadi yatim: server tetap mengirim ke endpoint lama yang sudah
 * mati, dan tamu berhenti menerima notifikasi TANPA gejala apa pun — tidak ada
 * error di layarnya, tombol "Aktifkan" pun sudah lama hilang karena izinnya
 * memang masih `granted`.
 *
 * Bekalnya (alamat API, kafe, pesanan, kunci VAPID) dititipkan halaman saat
 * berlangganan; tanpa bekal itu tidak ada yang bisa dilakukan di sini.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_KONTEKS);
        const res = await cache.match(KUNCI_KONTEKS);
        if (!res) return;
        const ctx = await res.json();
        if (!ctx || !ctx.apiBase || !ctx.cafeId || !ctx.orderId || !ctx.vapidKey) return;

        const baru =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlKeUint8(ctx.vapidKey),
          }));

        await fetch(
          `${ctx.apiBase}/api/cafes/${encodeURIComponent(ctx.cafeId)}/orders/${encodeURIComponent(ctx.orderId)}/push-subscription`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(baru.toJSON()),
          },
        );
      } catch (err) {
        // Tidak ada layar untuk mengabarkan kegagalan ini; halaman status akan
        // mendaftar ulang saat tamu membukanya kembali.
        console.warn('[cafeos-sw] Gagal memperbarui langganan push:', err);
      }
    })(),
  );
});

/** Kunci VAPID base64url → Uint8Array (kembaran fungsi di `src/lib/push.ts`). */
function base64UrlKeUint8(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = self.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
