import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Kamera absensi: `getUserMedia` → `<canvas>` → JPEG.
 *
 * ── Kenapa canvas, bukan `<input type="file" capture>` ──
 *
 * Yang terakhir jauh lebih pendek ditulis, tapi ia membuka PEMILIH BERKAS pada
 * sebagian perangkat — dan begitu galeri bisa dibuka, "foto absensi" berhenti
 * membuktikan bahwa orangnya ada di tempat. Alur di sini tidak punya jalan ke
 * galeri sama sekali: yang tersimpan hanya piksel yang baru saja keluar dari
 * sensor kamera.
 *
 * Dua akibat sampingan yang menguntungkan:
 *   - Gambar dari canvas TIDAK PERNAH membawa EXIF, jadi koordinat GPS ponsel
 *     tidak ikut sejak awal. (Server tetap membuangnya lagi — lihat
 *     `lib/jpeg.ts` di backend — karena itu pernyataan tentang klien kami,
 *     bukan tentang siapa pun yang memanggil endpoint.)
 *   - Ukurannya dipangkas di sini, sehingga kasir di koneksi lambat tidak
 *     menunggu foto belasan megapiksel terkirim.
 *
 * ── Kegagalan diperlakukan sebagai keadaan, bukan kecelakaan ──
 *
 * Kamera bisa ditolak izinnya, tidak ada sama sekali, atau sedang dipakai
 * aplikasi lain. Ketiganya nyata di tablet kasir, dan ketiganya harus punya
 * kalimatnya sendiri — "gagal membuka kamera" tidak memberi tahu siapa pun apa
 * yang harus dilakukan berikutnya.
 */

/** Lebar maksimum foto yang disimpan. Cukup untuk mengenali wajah. */
const LEBAR_MAKS = 720;
const MUTU_JPEG = 0.82;

export type MasalahKamera =
  | 'IZIN_DITOLAK'
  | 'TIDAK_ADA'
  | 'SEDANG_DIPAKAI'
  | 'TIDAK_DIDUKUNG'
  | 'LAIN';

const PESAN: Record<MasalahKamera, { judul: string; saran: string }> = {
  IZIN_DITOLAK: {
    judul: 'Izin kamera ditolak',
    saran:
      'Buka pengaturan situs di peramban terminal ini, izinkan kamera, lalu coba lagi.',
  },
  TIDAK_ADA: {
    judul: 'Tidak ada kamera di perangkat ini',
    saran: 'Terminal tanpa kamera bisa memakai pengecualian foto di bawah.',
  },
  SEDANG_DIPAKAI: {
    judul: 'Kamera sedang dipakai aplikasi lain',
    saran: 'Tutup aplikasi yang memakai kamera, lalu coba lagi.',
  },
  TIDAK_DIDUKUNG: {
    judul: 'Peramban ini tidak mendukung kamera',
    saran:
      'Kamera hanya bisa dibuka lewat HTTPS (atau localhost). Hubungi pemilik bila alamat terminal ini belum HTTPS.',
  },
  LAIN: {
    judul: 'Kamera tidak bisa dibuka',
    saran: 'Coba lagi, atau pakai pengecualian foto bila tetap gagal.',
  },
};

/**
 * Terjemahkan galat `getUserMedia` menjadi keadaan yang punya saran.
 *
 * Nama galatnya berbeda antar peramban untuk sebab yang sama — Chrome memakai
 * `NotAllowedError`, Safari lama `PermissionDeniedError` — jadi keduanya
 * dipetakan ke keadaan yang sama alih-alih dibiarkan jatuh ke "LAIN".
 */
function bacaMasalah(err: unknown): MasalahKamera {
  const nama = (err as { name?: string })?.name ?? '';
  switch (nama) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'IZIN_DITOLAK';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'TIDAK_ADA';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'SEDANG_DIPAKAI';
    default:
      return 'LAIN';
  }
}

export interface HasilFoto {
  blob: Blob;
  /** URL objek untuk pratinjau — pemanggil yang mencabutnya saat selesai. */
  pratinjau: string;
  diambilPada: Date;
}

interface Props {
  /** Foto siap dipakai — pemanggil menyimpannya lalu mengirim. */
  onSiap: (hasil: HasilFoto) => void;
  /** Pengguna memilih jalur pengecualian (kamera tidak bisa dipakai). */
  onPengecualian?: (masalah: MasalahKamera) => void;
  /** Label tombol ambil, mis. "Ambil Foto Masuk". */
  labelAmbil?: string;
}

export default function KameraAbsensi({ onSiap, onPengecualian, labelAmbil }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [siap, setSiap] = useState(false);
  const [masalah, setMasalah] = useState<MasalahKamera | null>(null);
  const [pratinjau, setPratinjau] = useState<HasilFoto | null>(null);

  /** Matikan kamera. Track yang tidak dihentikan membuat lampu tetap menyala. */
  const matikan = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSiap(false);
  }, []);

  const nyalakan = useCallback(async () => {
    setMasalah(null);
    setSiap(false);

    // `mediaDevices` tidak ada sama sekali pada konteks non-secure (http:// di
    // luar localhost) — itu keadaan yang berbeda dari izin ditolak, dan
    // sarannya pun berbeda.
    if (!navigator.mediaDevices?.getUserMedia) {
      setMasalah('TIDAK_DIDUKUNG');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setSiap(true);
    } catch (err) {
      setMasalah(bacaMasalah(err));
    }
  }, []);

  useEffect(() => {
    void nyalakan();
    return () => matikan();
    // Sengaja sekali saat dipasang: menyalakan ulang kamera tiap render akan
    // membuat lampu indikator berkedip-kedip di depan orang yang sedang difoto.
  }, [nyalakan, matikan]);

  /** Bebaskan URL objek pratinjau saat komponen dilepas. */
  useEffect(() => {
    return () => {
      if (pratinjau) URL.revokeObjectURL(pratinjau.pratinjau);
    };
  }, [pratinjau]);

  const ambil = async () => {
    const video = videoRef.current;
    if (!video || !siap) return;

    const skala = Math.min(1, LEBAR_MAKS / (video.videoWidth || LEBAR_MAKS));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((video.videoWidth || LEBAR_MAKS) * skala);
    canvas.height = Math.round((video.videoHeight || LEBAR_MAKS) * skala);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setMasalah('LAIN');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', MUTU_JPEG),
    );
    if (!blob) {
      setMasalah('LAIN');
      return;
    }

    // Kamera dimatikan begitu foto diambil: pratinjau tidak butuh aliran hidup,
    // dan lampu kamera yang menyala terus saat orang sedang membaca konfirmasi
    // membuat siapa pun tidak nyaman.
    matikan();
    setPratinjau({
      blob,
      pratinjau: URL.createObjectURL(blob),
      diambilPada: new Date(),
    });
  };

  const ulangi = () => {
    if (pratinjau) URL.revokeObjectURL(pratinjau.pratinjau);
    setPratinjau(null);
    void nyalakan();
  };

  // ── Pratinjau: ambil ulang atau pakai ──────────────────────────────────────
  if (pratinjau) {
    return (
      <div className="space-y-3">
        <img
          src={pratinjau.pratinjau}
          alt="Pratinjau foto absensi"
          className="mx-auto w-full max-w-xs rounded-2xl border border-warm-line"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={ulangi}
            className="flex-1 rounded-xl border border-warm-line px-4 py-2.5 text-sm font-medium text-warm-espresso transition hover:bg-warm-line/30"
          >
            Ambil Ulang
          </button>
          <button
            type="button"
            onClick={() => onSiap(pratinjau)}
            className="flex-1 rounded-xl bg-warm-amber px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
          >
            Pakai Foto Ini
          </button>
        </div>
      </div>
    );
  }

  // ── Kamera bermasalah ──────────────────────────────────────────────────────
  if (masalah) {
    const { judul, saran } = PESAN[masalah];
    return (
      <div
        role="alert"
        className="space-y-3 rounded-2xl border border-warm-amber/40 bg-warm-amber/5 p-4"
      >
        <div>
          <h3 className="text-sm font-semibold text-warm-espresso">{judul}</h3>
          <p className="mt-1 text-sm text-warm-muted">{saran}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void nyalakan()}
            className="rounded-xl border border-warm-line bg-white px-4 py-2 text-sm font-medium text-warm-espresso transition hover:bg-warm-line/30"
          >
            Coba Lagi
          </button>
          {onPengecualian && (
            <button
              type="button"
              onClick={() => onPengecualian(masalah)}
              className="rounded-xl border border-warm-line px-4 py-2 text-sm font-medium text-warm-muted transition hover:bg-warm-line/30"
            >
              Absen tanpa foto (perlu alasan)
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Kamera hidup ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-2xl border border-warm-line bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          // Dicerminkan supaya orangnya melihat dirinya seperti di cermin —
          // menggerakkan kepala ke kanan menggeser bayangan ke kanan juga.
          // Foto yang TERSIMPAN tidak ikut dicerminkan: canvas menggambar dari
          // aliran aslinya.
          className="aspect-[3/4] w-full scale-x-[-1] object-cover"
        />
        {!siap && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Menyalakan kamera…
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void ambil()}
        disabled={!siap}
        className="w-full rounded-xl bg-warm-amber px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
      >
        {labelAmbil ?? 'Ambil Foto'}
      </button>

      {onPengecualian && (
        <button
          type="button"
          onClick={() => onPengecualian('LAIN')}
          className="w-full text-center text-xs font-medium text-warm-muted underline"
        >
          Kamera bermasalah? Absen tanpa foto
        </button>
      )}
    </div>
  );
}
