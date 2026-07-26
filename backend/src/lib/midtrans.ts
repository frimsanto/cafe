import { CoreApi, Snap } from 'midtrans-client';
import type { Cafe } from '@prisma/client';
import { dekripsi } from './enkripsi';

// Klien Midtrans PER KAFE. Setiap kafe membawa kredensialnya sendiri (serverKey
// disimpan terenkripsi di database), jadi instance Snap/CoreApi dibuat on-demand
// dari data kafe — bukan dari satu kredensial global.
//
// `getMidtransSnap`  : untuk membuat transaksi (Snap token) di jalur checkout.
// `getMidtransCoreApi`: untuk menanyakan status transaksi (polling & rekonsiliasi).

/** Bagian kredensial Midtrans yang dibutuhkan pembuatan klien. */
type CafeMidtransConfig = Pick<
  Cafe,
  'midtransServerKey' | 'midtransClientKey' | 'midtransProduction'
>;

/**
 * Dekripsi serverKey kafe. Melempar bila Midtrans belum dikonfigurasi — pemanggil
 * (route pembayaran) menerjemahkannya menjadi galat 400 yang ramah.
 */
function resolveServerKey(cafe: CafeMidtransConfig): string {
  if (!cafe.midtransServerKey) {
    throw new Error('Midtrans belum dikonfigurasi');
  }
  return dekripsi(cafe.midtransServerKey);
}

/** Instance Snap API sesuai mode (sandbox/production) kafe. */
export function getMidtransSnap(cafe: CafeMidtransConfig): Snap {
  return new Snap({
    isProduction: cafe.midtransProduction,
    serverKey: resolveServerKey(cafe),
    clientKey: cafe.midtransClientKey ?? '',
  });
}

/** Instance Core API sesuai mode kafe — dipakai mengecek status transaksi. */
export function getMidtransCoreApi(cafe: CafeMidtransConfig): CoreApi {
  return new CoreApi({
    isProduction: cafe.midtransProduction,
    serverKey: resolveServerKey(cafe),
    clientKey: cafe.midtransClientKey ?? '',
  });
}
