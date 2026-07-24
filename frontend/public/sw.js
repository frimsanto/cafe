/* CafeOS Service Worker — menerima Web Push & menampilkan notifikasi. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'CafeOS', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'CafeOS';
  const options = {
    body: data.body || '',
    tag: data.orderId || 'cafeos',
    data: { orderId: data.orderId },
    vibrate: [100, 50, 100],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
