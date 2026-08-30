import type { PengaturanPembayaranDTO, StatusIntegrasiMidtrans } from '../../types/api';
import PaymentIcon, { type PaymentIconName } from './PaymentIcon';
import type { NadaBadge } from './StatusBadge';

interface PaymentSummaryProps {
  pengaturan: PengaturanPembayaranDTO;
}

const NADA_KELAS: Record<NadaBadge, { titik: string; nilai: string }> = {
  hijau: { titik: 'bg-warm-success', nilai: 'text-warm-success' },
  kuning: { titik: 'bg-amber-500', nilai: 'text-amber-700' },
  merah: { titik: 'bg-rose-500', nilai: 'text-rose-700' },
  abu: { titik: 'bg-warm-muted', nilai: 'text-warm-muted' },
};

/** Terjemahan status integrasi ke kalimat yang dimengerti pemilik kafe. */
const INTEGRASI: Record<StatusIntegrasiMidtrans, { nada: NadaBadge; teks: string }> = {
  SIAP: { nada: 'hijau', teks: 'Siap digunakan' },
  KREDENSIAL_TERSIMPAN: { nada: 'kuning', teks: 'Perlu diperiksa' },
  KONEKSI_GAGAL: { nada: 'merah', teks: 'Koneksi gagal' },
  // Dua keadaan yang dulu ikut menyamar sebagai "Perlu diperiksa" — padahal
  // keduanya berarti pembayaran online sedang TIDAK bisa dipakai sama sekali.
  PERLU_DIMASUKKAN_ULANG: { nada: 'merah', teks: 'Kredensial perlu diisi ulang' },
  KONFIGURASI_SERVER: { nada: 'merah', teks: 'Konfigurasi server bermasalah' },
  BELUM_DIKONFIGURASI: { nada: 'abu', teks: 'Belum aktif' },
};

interface Kartu {
  label: string;
  nilai: string;
  nada: NadaBadge;
  ikon: PaymentIconName;
}

/**
 * Kartu ringkasan di kepala halaman Pembayaran.
 *
 * Menjawab satu pertanyaan yang paling sering ditanyakan pemilik kafe sebelum
 * ia menyentuh apa pun: "sekarang tamu saya bisa bayar pakai apa, dan ada yang
 * bermasalah tidak?". Sebelumnya jawaban itu harus dirakit sendiri dari tiga
 * kartu konfigurasi yang tersebar.
 *
 * Setiap kartu membawa titik warna DAN kata. Kafe dibaca di layar murah, sering
 * di bawah cahaya matahari, dan sebagian pemakainya tidak membedakan hijau dari
 * merah — jadi warna tidak pernah menjadi satu-satunya penyampai keadaan.
 */
export default function PaymentSummary({ pengaturan }: PaymentSummaryProps) {
  const { midtrans, jumlahMetodeAktif } = pengaturan;
  const aktif = midtrans.kredensial.find((k) => k.mode === midtrans.modeAktif);
  const integrasi = INTEGRASI[midtrans.statusIntegrasi];

  const kartu: Kartu[] = [
    {
      label: 'Pembayaran online',
      nilai: integrasi.teks,
      nada: integrasi.nada,
      ikon: 'online',
    },
    {
      label: 'Gateway',
      nilai: midtrans.bisaTransaksi ? 'Midtrans terhubung' : 'Midtrans belum terhubung',
      nada: midtrans.bisaTransaksi ? 'hijau' : 'abu',
      ikon: 'tautan',
    },
    {
      label: 'Mode',
      nilai: midtrans.modeAktif === 'PRODUCTION' ? 'Production' : 'Sandbox',
      // Sandbox bukan kesalahan — ia keadaan wajar saat kafe masih menyiapkan
      // diri. Karena itu netral, bukan kuning.
      nada: midtrans.modeAktif === 'PRODUCTION' ? 'hijau' : 'abu',
      ikon: 'shield',
    },
    {
      label: 'Webhook',
      nilai:
        aktif?.statusWebhook === 'TERVERIFIKASI' ? 'Terverifikasi' : 'Belum diperiksa',
      nada: aktif?.statusWebhook === 'TERVERIFIKASI' ? 'hijau' : 'kuning',
      ikon: 'check',
    },
    {
      label: 'Metode aktif',
      nilai: String(jumlahMetodeAktif),
      nada: jumlahMetodeAktif > 0 ? 'hijau' : 'merah',
      ikon: 'tunai',
    },
  ];

  return (
    <section aria-label="Ringkasan pembayaran">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kartu.map((k) => {
          const kelas = NADA_KELAS[k.nada];
          return (
            <li
              key={k.label}
              className="rounded-2xl bg-warm-paper p-3.5 shadow-sm ring-1 ring-warm-line"
            >
              <div className="flex items-center gap-1.5 text-warm-muted">
                <PaymentIcon name={k.ikon} size={14} />
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide">
                  {k.label}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${kelas.titik}`}
                />
                <span className={`truncate text-sm font-bold ${kelas.nilai}`}>
                  {k.nilai}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
