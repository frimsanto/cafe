import { useNavigate } from 'react-router-dom';
import { usePesananAktif } from '../../order/PesananAktifContext';
import { nomorAntrian } from '../../lib/orderCode';

/**
 * Bilah pengingat "kamu punya pesanan yang sedang berjalan", dengan jalan
 * kembali ke halaman statusnya.
 *
 * Inilah pintu pulang yang selama ini hilang: begitu tamu meninggalkan halaman
 * status — entah untuk menambah menu, entah karena tidak sengaja menekan
 * "Pesan Lagi" — tidak ada apa pun di layar menu/keranjang yang mengingatkan
 * bahwa ada pesanan berjalan, apalagi menunjukkan caranya kembali. Halaman
 * status didatangi dengan `replace`, jadi tombol "kembali" peramban pun bukan
 * jalan yang bisa diandalkan.
 *
 * Bilah ini bertahan sampai pesanannya benar-benar tuntas, BUKAN sampai
 * dibayar. Justru setelah membayar tamu paling sering ingin menengok
 * status — "pesananku sudah dimasak belum?" — dan di situlah pintu ini paling
 * dibutuhkan.
 *
 * Sengaja lengket di atas (`sticky`) dan bukan sekadar teks: tamu yang sedang
 * menelusuri menu panjang harus tetap bisa kembali tanpa menggulir ke puncak.
 */
export default function PesananAktifBanner() {
  const { pesananAktif } = usePesananAktif();
  const navigate = useNavigate();

  if (!pesananAktif) return null;

  // Belum dibayar = ada yang harus tamu LAKUKAN, jadi diberi warna peringatan.
  // Sudah dibayar = sekadar kabar, jadi warnanya tenang — bilah yang selalu
  // menyala oranye sepanjang pesanan berlangsung akan cepat diabaikan.
  const perluTindakan = pesananAktif.bisaDitambah;

  return (
    <div
      className={`sticky top-0 z-30 border-b px-4 py-2.5 ${
        perluTindakan
          ? 'border-amber-200 bg-amber-50'
          : 'border-forest-200 bg-forest-50'
      }`}
    >
      <div className="mx-auto flex max-w-md items-center gap-3">
        <p
          className={`min-w-0 flex-1 text-sm leading-snug ${
            perluTindakan ? 'text-amber-900' : 'text-forest-900'
          }`}
        >
          Pesanan{' '}
          <span className="font-bold tabular-nums">
            {nomorAntrian(pesananAktif.queueNumber)}
          </span>{' '}
          {perluTindakan ? 'menunggu pembayaran' : 'sedang diproses'}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/pesanan/${pesananAktif.orderId}`)}
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-sm font-bold text-white transition active:scale-[0.98] ${
            perluTindakan
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-forest-600 hover:bg-forest-700'
          }`}
        >
          Lihat Status
        </button>
      </div>
    </div>
  );
}
