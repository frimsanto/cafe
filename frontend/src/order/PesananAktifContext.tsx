import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Pesanan tamu yang MASIH berjalan — satu-satunya jalan pulang ke halaman
 * statusnya.
 *
 * Sebelum ini, id pesanan hanya hidup di dua tempat yang sama-sama fana: sebuah
 * ref di dalam CheckoutPage (musnah begitu halamannya di-unmount) dan URL
 * `/pesanan/<id>` yang didatangi dengan `replace`, sehingga jejak riwayatnya
 * ikut tertimpa. Tamu yang menekan "Pesan Lagi" lalu ingin kembali ke pesanan
 * yang sedang dimasak tidak punya satu pun pintu untuk kembali.
 *
 * Disimpan di sessionStorage, sekamar dengan keranjang dan sesi meja: bertahan
 * saat berpindah halaman dan saat halaman dimuat ulang, tapi tidak ikut terbawa
 * ke kunjungan berikutnya — pesanan kemarin bukan urusan tamu hari ini.
 */
const STORAGE_KEY = 'cafeos-pesanan-aktif';

export interface PesananAktif {
  orderId: string;
  cafeId: string;
  /** Nomor antrian (1–999) untuk ditampilkan di banner; null pada data lama. */
  queueNumber: number | null;
  /**
   * Masih menerima item tambahan — belum dibayar DAN belum masuk dapur.
   *
   * Sengaja dipisahkan dari "masih dilacak". Pesanan yang sudah lunas tidak
   * bisa ditambah lagi, tapi justru pada saat itulah tamu paling butuh jalan
   * kembali ke halaman statusnya untuk memantau dapur.
   */
  bisaDitambah: boolean;
}

interface PesananAktifValue {
  /** Pesanan yang sedang berjalan, atau null bila tidak ada. */
  pesananAktif: PesananAktif | null;
  /** Catat/perbarui pesanan yang sedang berjalan. Aman dipanggil berulang. */
  mulai: (pesanan: PesananAktif) => void;
  /** Lupakan pesanan — dipanggil setelah pesanannya benar-benar tuntas. */
  selesai: () => void;
}

const PesananAktifContext = createContext<PesananAktifValue | null>(null);

function baca(): PesananAktif | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PesananAktif) : null;
  } catch {
    // Storage korup atau ditolak (mode privat) — anggap tidak ada pesanan
    // berjalan; tamu masih bisa memesan seperti biasa.
    return null;
  }
}

/** Dua penanda menggambarkan keadaan yang sama persis? */
function sama(a: PesananAktif | null, b: PesananAktif): boolean {
  return (
    a !== null &&
    a.orderId === b.orderId &&
    a.cafeId === b.cafeId &&
    a.queueNumber === b.queueNumber &&
    a.bisaDitambah === b.bisaDitambah
  );
}

export function PesananAktifProvider({ children }: { children: ReactNode }) {
  const [pesananAktif, setPesananAktif] = useState<PesananAktif | null>(baca);

  /**
   * Salinan nilai terkini yang bisa dibaca TANPA menjadikannya dependensi.
   *
   * Ini yang membuat `mulai` benar-benar idempoten: pemanggilnya (halaman
   * status) menyusun objek penanda baru pada setiap render, jadi tanpa
   * perbandingan isi di sini setiap panggilan akan menyimpan referensi baru,
   * membangunkan setiap efek yang bergantung pada `pesananAktif`, dan
   * memanggil `mulai` sekali lagi — putaran render tak berujung yang mengunci
   * halaman status. Membandingkan ISI, bukan referensi, memutus putaran itu.
   */
  const terkiniRef = useRef<PesananAktif | null>(pesananAktif);

  const mulai = useCallback((pesanan: PesananAktif) => {
    if (sama(terkiniRef.current, pesanan)) return;
    terkiniRef.current = pesanan;
    setPesananAktif(pesanan);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pesanan));
    } catch {
      /* storage tidak tersedia — cukup bertahan di memori */
    }
  }, []);

  const selesai = useCallback(() => {
    if (terkiniRef.current === null) return;
    terkiniRef.current = null;
    setPesananAktif(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* abaikan */
    }
  }, []);

  const value = useMemo<PesananAktifValue>(
    () => ({ pesananAktif, mulai, selesai }),
    [pesananAktif, mulai, selesai],
  );

  return (
    <PesananAktifContext.Provider value={value}>
      {children}
    </PesananAktifContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePesananAktif(): PesananAktifValue {
  const ctx = useContext(PesananAktifContext);
  if (!ctx) {
    throw new Error('usePesananAktif harus dipakai di dalam <PesananAktifProvider>');
  }
  return ctx;
}
