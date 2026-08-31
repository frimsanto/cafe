import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  OpsiPembayaranDTO,
  OrderWithTableDTO,
  StatusPembayaranDTO,
} from '../types/api';
import type { StatusPembayaran } from '../types/order';
import { pembayaranApi } from '../api/pembayaran';
import { nadaStatus, normalisasiStatus, statusFinal } from '../lib/paymentStatus';
import { payWithSnap } from '../lib/midtransSnap';
import { describeApiError } from '../lib/apiClient';
import { subscribeRealtime, type RealtimeStatus } from '../lib/realtime';
import { samakanUrutanItem } from '../lib/orderItems';
import { nomorAntrian } from '../lib/orderCode';
import { playReadyChime } from '../lib/sound';
import { downloadReceiptPdf } from '../lib/receipt';
import {
  isPushSupported,
  subscribeToOrderPush,
  syncOrderPushSubscription,
  type SubscribeResult,
} from '../lib/push';
import { usePesananAktif } from '../order/PesananAktifContext';
import OrderStatusStepper, {
  orderPhase,
  PHASE_CAPTION,
  type OrderPhase,
} from '../components/order/OrderStatusStepper';
import OrderDetailCard from '../components/order/OrderDetailCard';

/**
 * Jaring pengaman saat WebSocket TIDAK hidup — bukan denyut normal halaman.
 * Selama sambungan sehat tidak ada satu pun permintaan berkala yang dikirim.
 */
const POLL_BAYAR_MS = 6_000;
const POLL_DAPUR_MS = 20_000;

/**
 * Getaran saat pesanan siap — pola yang sama dengan notifikasi push di
 * `public/sw.js`, supaya tamu yang layarnya menyala (halaman ini terbuka) dan
 * tamu yang layarnya mati merasakan isyarat yang sama persis.
 *
 * Tiga denyut panjang, bukan satu denyut pendek: ponsel biasanya tergeletak di
 * meja di tengah keramaian kafe.
 */
const GETAR_SIAP = [300, 100, 300, 100, 300];

const PUSH_MESSAGE: Record<SubscribeResult, string> = {
  ok: 'Notifikasi aktif — kamu akan diberi tahu saat pesanan siap.',
  denied: 'Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.',
  unsupported: 'Browser ini belum mendukung notifikasi push.',
  disabled: 'Layanan notifikasi belum aktif di server.',
  error: 'Gagal mengaktifkan notifikasi. Coba lagi nanti.',
};

/** Rupa kartu utama: satu keadaan pesanan = satu baris di tabel ini. */
interface Tampilan {
  /** Kartu hijau pekat — dipakai hanya untuk kabar baik (siap & selesai). */
  gelap: boolean;
  ikon: 'centang' | 'muat' | 'silang';
  judul: string;
  sub: string;
}

const TAMPILAN_FASE: Record<OrderPhase, Tampilan> = {
  DIBAYAR: {
    gelap: false,
    ikon: 'muat',
    judul: 'Sedang dipersiapkan',
    sub: PHASE_CAPTION.DIBAYAR,
  },
  DIMASAK: {
    gelap: false,
    ikon: 'muat',
    judul: 'Sedang dipersiapkan',
    sub: PHASE_CAPTION.DIMASAK,
  },
  SIAP: {
    gelap: true,
    ikon: 'centang',
    judul: 'Pesanan siap disajikan!',
    sub: PHASE_CAPTION.SIAP,
  },
  SELESAI: {
    gelap: true,
    ikon: 'centang',
    judul: 'Pesanan selesai',
    sub: PHASE_CAPTION.SELESAI,
  },
};

const TAMPILAN_BAYAR: Record<StatusPembayaran, Tampilan> = {
  UNPAID: {
    gelap: false,
    ikon: 'muat',
    judul: 'Menunggu pembayaran',
    sub: 'Tunjukkan nomor ini kepada pelayan.',
  },
  // Tamu SUDAH mengirim pembayarannya; yang ditunggu adalah kasir memeriksanya.
  // Ini keadaan yang dulu tidak punya nama sendiri — ia menumpang di
  // "menunggu pembayaran", sehingga tamu yang sudah transfer membaca kalimat
  // yang seolah menyuruhnya membayar lagi.
  AWAITING_VERIFICATION: {
    gelap: false,
    ikon: 'muat',
    judul: 'Menunggu verifikasi kasir',
    sub: 'Pembayaranmu sedang diperiksa. Tunjukkan nomor ini ke kasir.',
  },
  FAILED: {
    gelap: false,
    ikon: 'silang',
    judul: 'Pembayaran gagal',
    sub: 'Pembayaran tidak selesai. Kamu bisa mencoba lagi.',
  },
  EXPIRED: {
    gelap: false,
    ikon: 'silang',
    judul: 'Pembayaran kedaluwarsa',
    sub: 'Batas waktunya lewat. Silakan buat pembayaran baru.',
  },
  CANCELLED: {
    gelap: false,
    ikon: 'silang',
    judul: 'Pembayaran dibatalkan',
    sub: 'Pembayaran dibatalkan. Kamu bisa mencoba lagi.',
  },
  REFUNDED: {
    gelap: false,
    ikon: 'silang',
    judul: 'Pembayaran dikembalikan',
    sub: 'Dananya sudah dikembalikan. Hubungi kasir bila ada pertanyaan.',
  },
  PARTIALLY_REFUNDED: {
    gelap: false,
    ikon: 'silang',
    judul: 'Sebagian dana dikembalikan',
    sub: 'Sebagian pembayaranmu dikembalikan. Hubungi kasir untuk rinciannya.',
  },
  // Setelah lunas, tampilan diambil alih fase dapur (`TAMPILAN_FASE`); baris
  // ini hanya jaring pengaman untuk sepersekian detik sebelum pesanannya tiba.
  PAID: {
    gelap: false,
    ikon: 'centang',
    judul: 'Pembayaran diterima',
    sub: 'Pesanan sedang diteruskan ke dapur.',
  },
};

/** Status awal dari query callback Snap (?status=sukses|menunggu|gagal). */
function initialFromQuery(value: string | null): StatusPembayaran {
  if (value === 'sukses') return 'PAID';
  if (value === 'gagal') return 'FAILED';
  return 'UNPAID';
}

/** "Meja 4" tetap "Meja 4"; "4" jadi "Meja 4" — tanpa "Meja Meja 4". */
function labelMeja(tableName?: string | null): string | null {
  const nama = tableName?.trim();
  if (!nama) return null;
  return /^meja\b/i.test(nama) ? nama : `Meja ${nama}`;
}

/**
 * Tidak ada lagi yang perlu ditanyakan ke server: pembayaran gagal, atau sudah
 * lunas DAN pesanannya rampung di dapur.
 */
function sudahTuntas(
  statusBayar: StatusPembayaran,
  pesanan: OrderWithTableDTO | null,
): boolean {
  // "Menunggu verifikasi" TIDAK tuntas: yang ditunggu adalah kasir menekan
  // tombol, dan halaman ini harus tetap mendengarkan sampai itu terjadi.
  if (statusBayar === 'AWAITING_VERIFICATION') return false;
  if (statusBayar !== 'PAID') return statusFinal(statusBayar);
  return pesanan?.status === 'SELESAI';
}

/** Lingkaran centang — penanda utama "beres". */
function IkonCentang({ gelap }: { gelap: boolean }) {
  return (
    <span
      className={`animate-pop-in flex h-16 w-16 items-center justify-center rounded-full ${
        gelap ? 'bg-white text-forest-700' : 'bg-forest-600 text-white'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden>
        <path
          d="M5 13l4.5 4.5L19 7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Cincin berputar — dipakai selama pesanan masih berjalan. */
function IkonMuat() {
  return (
    <span
      className="h-16 w-16 animate-spin rounded-full border-4 border-forest-100 border-t-forest-600"
      aria-hidden
    />
  );
}

function IkonSilang() {
  return (
    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden>
        <path
          d="M7 7l10 10M17 7L7 17"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Kursi — satu-satunya ikon dekoratif yang tersisa, penanda nomor meja. */
function IkonKursi() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4v7M18 4v7M4 11h16M6 11v3a2 2 0 002 2h8a2 2 0 002-2v-3M8 16v4M16 16v4" />
    </svg>
  );
}

/**
 * Halaman status pesanan untuk PELANGGAN — layar yang langsung terbuka setelah
 * checkout, bukan halaman yang harus dicari.
 *
 * Isinya disusun menurut apa yang dibutuhkan tamu sambil menunggu di meja:
 * status pesanan, nomor antrian sebesar mungkin, lalu barulah rincian. Tidak
 * ada tombol "Lihat Status" — halaman ini memperbarui dirinya sendiri.
 *
 * Sumber kebenarannya server. Callback Snap hanya memberi tahu apa yang dilihat
 * peramban, jadi status dari query param dipakai sebagai tampilan awal saja
 * lalu dipastikan lewat endpoint status pembayaran.
 *
 * Setelah pemuatan pertama, perubahan datang lewat WebSocket: halaman
 * berlangganan kanal kafe yang dipersempit ke satu pesanan (kitchen.order.*,
 * order.ready, payment.status.changed), sehingga tindakan chef di Layar Dapur
 * terlihat di sini seketika. Polling hanya menyala saat sambungan realtime
 * sedang putus — selama WebSocket hidup, halaman ini diam.
 */
export default function PesananStatusPage() {
  const { orderId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { mulai, selesai, pesananAktif } = usePesananAktif();

  const [status, setStatus] = useState<StatusPembayaran>(() =>
    initialFromQuery(searchParams.get('status')),
  );
  const [detail, setDetail] = useState<StatusPembayaranDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  /**
   * Izin notifikasi milik peramban. Disalin ke state karena
   * `Notification.permission` bukan nilai reaktif — tanpa salinan ini, ajakan
   * mengaktifkan notifikasi tetap menempel di layar setelah tamu menekannya.
   * `unsupported` untuk peramban tanpa Web Push (mis. Safari iOS lawas).
   */
  const [izinNotif, setIzinNotif] = useState<NotificationPermission | 'unsupported'>(
    () => (isPushSupported() ? Notification.permission : 'unsupported'),
  );
  /** Metode pembayaran kafe — menentukan apakah tamu bisa membayar dari sini. */
  const [opsiBayar, setOpsiBayar] = useState<OpsiPembayaranDTO | null>(null);
  const [koneksi, setKoneksi] = useState<RealtimeStatus>('connecting');
  const [bantuan, setBantuan] = useState(false);

  /**
   * Penanda pesanan berjalan versi terkini, dibaca TANPA menjadi dependensi
   * efek. Menjadikan `pesananAktif` dependensi akan membangunkan efek itu
   * setiap kali ia sendiri memperbarui penandanya.
   */
  const pesananAktifRef = useRef(pesananAktif);
  pesananAktifRef.current = pesananAktif;

  /** Penanda unmount — dibaca semua permintaan yang sedang terbang. */
  const cancelledRef = useRef(false);
  /**
   * Id pesanan CafeOS yang sebenarnya. Parameter URL bisa berisi `order_id`
   * gateway (callback Snap mengembalikan bentuk itu), sedangkan event realtime
   * selalu memakai id CafeOS — penyaringan harus memakai id yang sama.
   */
  const idPesananRef = useRef(orderId);
  /** Fase terakhir yang sudah diumumkan — mencegah bunyi "siap" berulang. */
  const faseRef = useRef<OrderPhase | null>(null);
  /** True setelah sambungan realtime pernah hidup — penanda "ini sambung ULANG". */
  const pernahOnlineRef = useRef(false);

  const terapkanDetail = useCallback((res: StatusPembayaranDTO) => {
    idPesananRef.current = res.pesanan.id;
    // Data server dipakai apa adanya; hanya URUTAN item yang diselaraskan
    // dengan yang sedang tampil, supaya daftar tidak berganti susunan di
    // tengah pesanan berjalan.
    setDetail((prev) =>
      prev
        ? {
            ...res,
            pesanan: {
              ...res.pesanan,
              items: samakanUrutanItem(prev.pesanan.items, res.pesanan.items),
            },
          }
        : res,
    );
    setStatus(normalisasiStatus(res.status));
    setError(null);
  }, []);

  const ambilStatus = useCallback(async (): Promise<StatusPembayaranDTO | null> => {
    try {
      const res = await pembayaranApi.status(idPesananRef.current || orderId);
      if (cancelledRef.current) return null;
      terapkanDetail(res);
      return res;
    } catch (err) {
      if (cancelledRef.current) return null;
      setError(describeApiError(err, 'Status pesanan gagal dimuat.'));
      return null;
    } finally {
      if (!cancelledRef.current) setMemuat(false);
    }
  }, [orderId, terapkanDetail]);

  // Pemuatan pertama — satu permintaan, lalu halaman menyerahkan diri ke realtime.
  useEffect(() => {
    if (!orderId) return;
    cancelledRef.current = false;
    idPesananRef.current = orderId;
    void ambilStatus();

    return () => {
      cancelledRef.current = true;
    };
  }, [orderId, ambilStatus]);

  const pesanan = detail?.pesanan ?? null;
  const fase = useMemo<OrderPhase | null>(
    () =>
      status === 'PAID' && pesanan ? orderPhase(pesanan.status, pesanan.items) : null,
    [status, pesanan],
  );
  const tuntas = sudahTuntas(status, pesanan);

  // Kafe & pesanan yang dilanggan. Keduanya baru pasti setelah fetch pertama:
  // parameter URL bisa berupa referensi gateway, sedangkan server menyaring
  // langganan dengan id pesanan CafeOS.
  const cafeId = pesanan?.cafeId ?? '';
  const idPesanan = pesanan?.id ?? '';

  /**
   * Aliran realtime pesanan ini — inti halaman. Langganan dipersempit ke satu
   * pesanan, jadi ponsel tamu hanya menerima kabar pesanannya sendiri.
   */
  useEffect(() => {
    if (!cafeId || !idPesanan) return;

    return subscribeRealtime(
      (message) => {
        switch (message.type) {
          case 'kitchen.order.created':
          case 'kitchen.order.updated':
          case 'order.ready': {
            const order = message.data as OrderWithTableDTO | undefined;
            if (!order?.id || order.id !== idPesananRef.current) return;
            setDetail((prev) =>
              prev
                ? {
                    ...prev,
                    pesanan: {
                      ...order,
                      items: samakanUrutanItem(prev.pesanan.items, order.items),
                    },
                  }
                : prev,
            );
            break;
          }

          case 'payment.status.changed': {
            const data = message.data as
              | { orderId?: string; statusPembayaran?: string | null }
              | undefined;
            if (!data?.orderId || data.orderId !== idPesananRef.current) return;
            if (data.statusPembayaran) setStatus(normalisasiStatus(data.statusPembayaran));
            // Pembayaran berubah — ambil pesanan versi lengkapnya sekali.
            void ambilStatus();
            break;
          }
        }
      },
      {
        orderId: idPesanan,
        onStatus: (next) => {
          setKoneksi(next);
          if (next !== 'online') return;
          // Sambungan PULIH setelah putus: samakan dengan server, karena event
          // yang lewat selama putus tidak dikirim ulang. Sambungan pertama
          // dilewati — pemuatan awal sudah mengambil data yang sama.
          if (pernahOnlineRef.current) void ambilStatus();
          pernahOnlineRef.current = true;
        },
      },
    );
  }, [cafeId, idPesanan, ambilStatus]);

  /**
   * Jaring pengaman, bukan denyut utama: bertanya ke server HANYA selama
   * WebSocket belum/tidak tersambung. Begitu realtime hidup, timer ini dilepas
   * dan halaman berhenti mengirim permintaan berkala sama sekali.
   */
  useEffect(() => {
    if (tuntas || koneksi === 'online') return;
    const jeda = status === 'PAID' ? POLL_DAPUR_MS : POLL_BAYAR_MS;
    const timer = setInterval(() => void ambilStatus(), jeda);
    return () => clearInterval(timer);
  }, [tuntas, koneksi, status, ambilStatus]);

  /**
   * Pesanan ini masih boleh ditambah isinya — cermin persis gerbang di server
   * (`orderService.addItems`): belum masuk dapur DAN belum lunas.
   *
   * Menampilkan tombol yang lebih longgar daripada aturan server hanya akan
   * memindahkan penolakan ke tempat yang paling menyakitkan: setelah tamu
   * memilih menu, mengisi keranjang, dan menekan kirim.
   */
  const bisaTambahMenu =
    pesanan?.status === 'MENUNGGU_PEMBAYARAN' &&
    status !== 'PAID' &&
    // Pembayaran yang sedang diperiksa kasir tidak boleh ditambah isinya:
    // tagihannya sudah dikirim ke kasir, dan menambah item di belakang
    // punggungnya membuat nominal yang sedang dicocokkan berubah sendiri.
    status !== 'AWAITING_VERIFICATION';

  /**
   * Tagihan ini masih bisa dibayar langsung dari halaman ini.
   *
   * Pembayaran yang gagal selalu boleh dicoba ulang (tagihannya sudah pernah
   * terbit). Untuk yang belum dibayar, tombolnya hanya ditawarkan bila kafe
   * memang punya gateway aktif — kafe yang hanya menerima bayar-di-kasir tidak
   * boleh diberi tombol yang pasti berujung pesan galat.
   */
  const bisaBayarDiSini =
    bisaTambahMenu && (nadaStatus(status) === 'gagal' || opsiBayar?.midtransAktif === true);

  /**
   * Catat/lupakan pesanan ini sebagai "yang sedang berjalan".
   *
   * Halaman ini adalah satu-satunya tempat yang tahu keadaan pesanan versi
   * server, jadi di sinilah penanda itu paling tepat dijaga.
   *
   * Penandanya bertahan sampai pesanan benar-benar SELESAI — bukan sampai
   * dibayar. Versi sebelumnya mencabutnya begitu pembayaran lunas, dan itu
   * memutus satu-satunya jalan pulang tepat pada saat tamu paling
   * membutuhkannya: tamu yang tidak sengaja menekan "Pesan Lagi" mendarat di
   * halaman menu tanpa bilah pengingat, tanpa riwayat (halaman status
   * didatangi dengan `replace`), dan tidak bisa lagi menengok pesanannya yang
   * sedang dimasak.
   *
   * `bisaDitambah` yang membedakan keduanya: ia mengunci penambahan item
   * setelah lunas, sementara jalan pulangnya tetap terbuka.
   */
  useEffect(() => {
    if (!pesanan) return;
    // Pesanan tuntas → penanda dicabut, tapi hanya bila yang tuntas memang
    // pesanan YANG SEDANG dilacak. Tanpa syarat itu, membuka kembali struk
    // pesanan lama akan menghapus jejak pesanan yang justru masih berjalan.
    if (pesanan.status === 'SELESAI') {
      if (pesananAktifRef.current?.orderId === pesanan.id) selesai();
      return;
    }
    mulai({
      orderId: pesanan.id,
      cafeId: pesanan.cafeId,
      queueNumber: pesanan.queueNumber,
      bisaDitambah: bisaTambahMenu,
    });
  }, [pesanan, bisaTambahMenu, mulai, selesai]);

  /**
   * Metode pembayaran kafe ini. Diambil hanya selama tagihan belum lunas —
   * setelah itu tidak ada lagi yang bisa dibayar dari halaman ini.
   */
  useEffect(() => {
    if (!cafeId || status === 'PAID') return;
    let batal = false;
    pembayaranApi
      .opsi(cafeId)
      .then((data) => {
        if (!batal) setOpsiBayar(data);
      })
      .catch(() => {
        // Gagal memuat opsi bukan kesalahan yang perlu ditampilkan: akibatnya
        // hanya tombol bayar tidak muncul, dan tamu tetap bisa membayar di
        // kasir seperti yang tertulis di kartu status.
      });
    return () => {
      batal = true;
    };
  }, [cafeId, status]);

  /**
   * Tautkan ulang langganan push perangkat ini ke pesanan yang sedang dibuka.
   *
   * Tidak ada dialog izin yang muncul — fungsinya diam bila izin belum
   * diberikan. Yang diperbaikinya adalah pesanan KEDUA dan seterusnya: ajakan
   * "Aktifkan" hanya tampil saat izin masih `default`, jadi tanpa penyelarasan
   * ini langganan perangkat selamanya menunjuk ke pesanan pertama dan pesanan
   * berikutnya tidak pernah memicu notifikasi apa pun.
   */
  useEffect(() => {
    if (!cafeId || !idPesanan) return;
    // Pesanan yang sudah tuntas dilewati. Perangkat hanya punya SATU langganan,
    // jadi menautkannya ke pesanan yang sudah selesai — misalnya saat tamu
    // membuka lagi struk lama — justru akan membungkam pesanan barunya yang
    // masih ditunggu di dapur.
    if (pesanan?.status === 'SELESAI') return;
    void syncOrderPushSubscription(cafeId, idPesanan);
  }, [cafeId, idPesanan, pesanan?.status]);

  /** Pesanan rampung di dapur — pemicu kartu hijau, bunyi & getar "siap". */
  const siapDisajikan = fase === 'SIAP' || fase === 'SELESAI';

  // Umumkan sekali saat pesanan berpindah ke "siap". SIAP → SELESAI menyusul
  // hampir seketika (server menandai selesai begitu item terakhir siap), jadi
  // perpindahan di antara keduanya tidak boleh membunyikan chime kedua kali.
  //
  // Getaran menemani bunyi karena keduanya menutupi celah yang berbeda: kafe
  // yang berisik menelan chime, sedangkan ponsel yang disenyapkan menelan
  // keduanya kecuali getar. Dijalankan hanya pada PERPINDAHAN fase (bukan saat
  // halaman dibuka dalam keadaan sudah siap), jadi tamu yang memuat ulang
  // halaman tidak digetarkan berulang-ulang.
  useEffect(() => {
    if (!fase || faseRef.current === fase) return;
    const sebelumnya = faseRef.current;
    faseRef.current = fase;
    const sudahSiapSebelumnya = sebelumnya === 'SIAP' || sebelumnya === 'SELESAI';
    if (!siapDisajikan || sebelumnya === null || sudahSiapSebelumnya) return;

    playReadyChime();
    // Tidak semua peramban punya Vibration API (Safari iOS sama sekali tidak),
    // dan pemanggilan bisa ditolak diam-diam bila laman belum pernah disentuh.
    if ('vibrate' in navigator) navigator.vibrate(GETAR_SIAP);
  }, [fase, siapDisajikan]);

  const view: Tampilan =
    fase !== null
      ? TAMPILAN_FASE[fase]
      : (TAMPILAN_BAYAR[status] ?? TAMPILAN_BAYAR.UNPAID);

  const kodeAntrian = nomorAntrian(pesanan?.queueNumber);
  const meja = labelMeja(pesanan?.tableName);

  /** Coba bayar lagi lewat Midtrans (pesanan yang sama, transaksi baru). */
  const handleCobaLagi = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      const tx = await pembayaranApi.buatMidtrans(pesanan?.id ?? orderId);
      if (!tx.clientKey) {
        setError('Pembayaran online kafe ini belum lengkap dikonfigurasi.');
        return;
      }
      payWithSnap({
        snapToken: tx.snapToken,
        clientKey: tx.clientKey,
        isProduction: tx.isProduction,
        onSuccess: () => void ambilStatus(),
        onPending: () => void ambilStatus(),
        onError: () => setError('Pembayaran gagal diproses. Silakan coba lagi.'),
        onClose: () => void ambilStatus(),
      });
    } catch (err) {
      setError(describeApiError(err, 'Pembayaran gagal dimulai. Coba lagi.'));
    } finally {
      setRetrying(false);
    }
  };

  const handleAktifkanPush = async () => {
    if (pushBusy || !pesanan) return;
    setPushBusy(true);
    const result = await subscribeToOrderPush(pesanan.cafeId, pesanan.id);
    setPushMsg(PUSH_MESSAGE[result]);
    // Baca ulang izinnya: apa pun jawaban tamu — diizinkan ATAU ditolak —
    // ajakan di bawah stepper tidak boleh muncul lagi.
    setIzinNotif(isPushSupported() ? Notification.permission : 'unsupported');
    setPushBusy(false);
  };

  const handleUnduhStruk = async () => {
    if (downloading || !pesanan || !detail) return;
    setDownloading(true);
    try {
      await downloadReceiptPdf(pesanan, {
        id: pesanan.cafeId,
        name: detail.cafeName,
        tagline: '',
      });
    } catch {
      setError('Struk gagal dibuat. Silakan coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  if (memuat && !detail) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-slate-50 px-4 py-8">
        <div className="h-72 animate-pulse rounded-3xl bg-white" />
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50">
      {/* Header — nama kafe & satu tombol bantuan. Tidak ada yang lain. */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5">
        <p className="truncate text-base font-bold text-slate-900">
          {detail?.cafeName ?? 'Pesanan'}
        </p>
        <button
          type="button"
          onClick={() => setBantuan((v) => !v)}
          aria-expanded={bantuan}
          aria-label="Bantuan"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-base font-bold text-slate-500 transition hover:bg-slate-100"
        >
          ?
        </button>
      </header>

      {bantuan && (
        <div className="border-b border-slate-200 bg-white px-4 pb-4 text-sm leading-relaxed text-slate-600">
          <p>
            Nomor besar di kartu adalah nomor antrianmu — tunjukkan ke pelayan
            saat pesanan disajikan.
          </p>
          <p className="mt-2">
            Status di halaman ini berubah sendiri begitu dapur memperbaruinya.
            Tidak perlu memuat ulang.
          </p>
          <p className="mt-2">
            Ada yang keliru? Sampaikan ke staf sambil menyebut ID pesanan di
            bagian bawah halaman.
          </p>
        </div>
      )}

      <main className="space-y-4 px-4 pb-10 pt-4">
        {/* Kartu utama — status, nomor antrian, dan tindakan. */}
        <section
          aria-live="polite"
          className={`rounded-3xl px-5 py-7 text-center ${
            view.gelap
              ? 'bg-forest-600 text-white shadow-lg'
              : 'bg-white ring-1 ring-slate-200'
          }`}
        >
          <div className="flex justify-center">
            {view.ikon === 'centang' && <IkonCentang gelap={view.gelap} />}
            {view.ikon === 'muat' && <IkonMuat />}
            {view.ikon === 'silang' && <IkonSilang />}
          </div>

          <h1
            className={`mt-5 text-3xl font-black leading-tight ${
              view.gelap ? 'text-white' : 'text-slate-900'
            }`}
          >
            {view.judul}
          </h1>
          <p
            className={`mx-auto mt-2 max-w-xs text-base ${
              view.gelap ? 'text-forest-100' : 'text-slate-500'
            }`}
          >
            {view.sub}
          </p>

          {/* Nomor antrian — elemen terbesar di halaman, sengaja. */}
          <p className="mt-6 text-6xl font-black leading-none tracking-tight tabular-nums">
            {kodeAntrian}
          </p>

          {meja && (
            <span
              className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                view.gelap ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <IkonKursi />
              {meja}
            </span>
          )}

          {koneksi !== 'online' && !tuntas && (
            <p
              className={`mt-4 text-sm ${
                view.gelap ? 'text-forest-100' : 'text-slate-400'
              }`}
            >
              Menyambung ke dapur…
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-800"
            >
              {error}
            </p>
          )}

          <div className="mt-6 space-y-3">
            {status === 'PAID' && (
              <button
                type="button"
                onClick={() => void handleUnduhStruk()}
                disabled={downloading}
                className={`w-full rounded-2xl py-4 text-base font-bold transition active:scale-[0.99] disabled:opacity-60 ${
                  view.gelap
                    ? 'bg-white text-forest-700 hover:bg-forest-50'
                    : 'bg-forest-600 text-white hover:bg-forest-700'
                }`}
              >
                {downloading ? 'Menyiapkan struk…' : 'Unduh Struk'}
              </button>
            )}

            {/* Jalan keluar dari tagihan yang belum lunas.
                Sebelumnya tombol ini HANYA muncul saat pembayaran GAGAL,
                sehingga tamu yang sekadar menutup popup Midtrans mendarat di
                status "menunggu pembayaran" tanpa satu pun cara membayar dari
                ponselnya — buntu, kecuali kafenya kebetulan menerima
                pembayaran di kasir. Kondisinya sama dengan yang dipakai
                halaman checkout: hanya ditawarkan bila gateway-nya memang
                aktif di kafe ini. */}
            {bisaBayarDiSini && (
              <button
                type="button"
                onClick={() => void handleCobaLagi()}
                disabled={retrying}
                className="w-full rounded-2xl bg-forest-600 py-4 text-base font-bold text-white transition hover:bg-forest-700 active:scale-[0.99] disabled:opacity-60"
              >
                {retrying
                  ? 'Menyiapkan…'
                  : nadaStatus(status) === 'gagal'
                    ? 'Coba Bayar Lagi'
                    : 'Bayar Sekarang'}
              </button>
            )}

            {/* Selama tagihan belum ditutup, tambahan masuk ke pesanan INI —
                satu meja, satu tagihan, satu nomor antrian. Setelah lunas atau
                masuk dapur, tombolnya berubah menjadi "Pesan Lagi": tambahan
                sesudah itu memang seharusnya menjadi pesanan baru, dan server
                pun menolaknya sebagai tambahan. */}
            {bisaTambahMenu ? (
              <button
                type="button"
                onClick={() => navigate('/menu')}
                className="w-full rounded-2xl border-2 border-forest-600 py-3.5 text-base font-bold text-forest-700 transition hover:bg-forest-50 active:scale-[0.99]"
              >
                + Tambah Menu
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/menu')}
                className={`w-full py-1 text-base font-semibold underline-offset-4 hover:underline ${
                  view.gelap ? 'text-forest-100' : 'text-slate-500'
                }`}
              >
                Pesan Lagi
              </button>
            )}
          </div>
        </section>

        {/* Perjalanan pesanan — hanya berarti setelah pembayaran lunas. */}
        {fase !== null && pesanan && (
          <section className="rounded-2xl bg-white px-5 py-5 ring-1 ring-slate-200">
            <OrderStatusStepper status={pesanan.status} items={pesanan.items} />
          </section>
        )}

        {/* Pengingat ke ponsel — hanya berguna selagi pesanan belum siap.
            Ajakannya tampil HANYA saat izin masih 'default': begitu tamu
            mengizinkan atau menolak, tidak ada lagi yang bisa dilakukan dari
            sini (izin yang ditolak hanya bisa dicabut lewat setelan peramban),
            jadi banner-nya menyingkir dan menyisakan pesan hasilnya saja. */}
        {fase !== null && !siapDisajikan && izinNotif === 'default' && (
          <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 ring-1 ring-slate-200">
            <p className="flex-1 text-sm leading-snug text-slate-600">
              🔔 Aktifkan notifikasi agar tahu saat pesanan siap
            </p>
            <button
              type="button"
              onClick={() => void handleAktifkanPush()}
              disabled={pushBusy}
              className="shrink-0 rounded-xl bg-forest-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-forest-700 active:scale-[0.98] disabled:opacity-60"
            >
              {pushBusy ? 'Mengaktifkan…' : 'Aktifkan'}
            </button>
          </div>
        )}

        {fase !== null && !siapDisajikan && izinNotif !== 'default' && pushMsg && (
          <p className="text-center text-sm text-slate-500">{pushMsg}</p>
        )}

        {pesanan && pesanan.items.length > 0 && (
          <OrderDetailCard
            pesanan={pesanan}
            totalFallback={detail?.grossAmount ?? null}
            metodePembayaran={status === 'PAID' ? detail?.metodePembayaran : null}
            tampilkanStatusItem={fase !== null && fase !== 'SELESAI'}
          />
        )}
      </main>
    </div>
  );
}
