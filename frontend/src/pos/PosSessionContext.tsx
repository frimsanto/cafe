import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { posApi } from '../api/pos';
import { PosError } from '../lib/posClient';
import type { AbsensiDTO, JadwalDTO, PemasanganDTO, SesiKasirDTO, ShiftDTO } from '../types/pos';

/**
 * Keadaan terminal POS, dari perangkat sampai laci kas.
 *
 * ── Kenapa satu context, bukan empat hook terpisah ──
 *
 * Keempat keadaan di bawah BERURUTAN dan saling menjadi syarat: tidak ada sesi
 * tanpa perangkat, tidak ada shift tanpa absensi. Menyebarnya ke beberapa hook
 * membuat setiap layar harus menyusun ulang urutan itu sendiri — dan cukup satu
 * layar yang keliru untuk menampilkan tombol "Buka Shift" kepada orang yang
 * belum absen, lalu menyalahkan backend ketika ditolak.
 *
 * ── Yang menentukan layar mana yang muncul ──
 *
 *   PERANGKAT  belum terpasang        → layar pemasangan
 *   TERKUNCI   terpasang, tanpa sesi  → layar pergantian petugas
 *   SIAP       ada sesi               → POS, dengan panel shift di dalamnya
 *
 * Ketiganya diturunkan dari kegagalan permintaan, bukan dari tebakan: backend
 * memakai pesan berbeda untuk "perangkat tidak dikenal" dan "sesi berakhir",
 * dan `posClient` menerjemahkannya menjadi `PosError.keadaan`.
 *
 * ── Muat ulang halaman tidak boleh mengubah apa pun ──
 *
 * Seluruh keadaan hidup di COOKIE dan di server. Tidak ada satu pun bagian dari
 * modul ini yang menulis ke localStorage. Menekan F5 di tengah shift karena itu
 * menghasilkan layar yang sama persis — dan tab yang dibuka orang lain di
 * terminal yang sama juga, karena keduanya membaca sesi yang sama.
 */

export type KeadaanPos = 'MEMUAT' | 'PERANGKAT' | 'TERKUNCI' | 'SIAP';

interface NilaiPos {
  keadaan: KeadaanPos;
  perangkat: PemasanganDTO | null;
  sesi: SesiKasirDTO | null;
  absensi: AbsensiDTO | null;
  jadwalCocok: JadwalDTO[];
  shift: ShiftDTO | null;
  galat: string | null;

  /** Pasang terminal dengan token dari pemilik. */
  pasang: (token: string) => Promise<void>;
  /** Buka sesi dengan PIN. */
  masuk: (userId: string, pin: string) => Promise<void>;
  /** "Ganti Petugas" — kunci sesi, shift dibiarkan berjalan. */
  kunci: () => Promise<void>;
  /** Muat ulang absensi & shift setelah sebuah tindakan. */
  segarkan: () => Promise<void>;
  /** Perbarui shift di context tanpa memanggil server lagi. */
  pakaiShift: (shift: ShiftDTO | null) => void;
  pakaiAbsensi: (absensi: AbsensiDTO | null) => void;
}

const Konteks = createContext<NilaiPos | null>(null);

export function usePos(): NilaiPos {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('usePos dipakai di luar PosSessionProvider');
  return nilai;
}

export function PosSessionProvider({ children }: { children: ReactNode }) {
  const [keadaan, setKeadaan] = useState<KeadaanPos>('MEMUAT');
  const [perangkat, setPerangkat] = useState<PemasanganDTO | null>(null);
  const [sesi, setSesi] = useState<SesiKasirDTO | null>(null);
  const [absensi, setAbsensi] = useState<AbsensiDTO | null>(null);
  const [jadwalCocok, setJadwalCocok] = useState<JadwalDTO[]>([]);
  const [shift, setShift] = useState<ShiftDTO | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  // Permintaan yang selesai setelah komponen dilepas tidak boleh menulis state.
  const hidup = useRef(true);
  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);

  /** Bersihkan seluruh keadaan milik petugas — dipakai saat sesi berakhir. */
  const lupakanPetugas = useCallback(() => {
    setSesi(null);
    setAbsensi(null);
    setJadwalCocok([]);
    setShift(null);
  }, []);

  /** Absensi & shift milik petugas yang sedang memegang terminal. */
  const muatMilikPetugas = useCallback(async () => {
    const [status, shiftAktif] = await Promise.all([
      posApi.statusAbsensi(),
      posApi.shiftAktif(),
    ]);
    if (!hidup.current) return;
    setAbsensi(status.absensi);
    setJadwalCocok(status.jadwalCocok);
    setShift(shiftAktif);
  }, []);

  /**
   * Tentukan keadaan terminal dari nol.
   *
   * Dipanggil saat halaman dibuka DAN setiap kali sebuah permintaan menyatakan
   * sesinya sudah tidak berlaku — sehingga tab yang ditinggalkan semalaman
   * kembali ke layar pergantian petugas, bukan menampilkan tombol yang semuanya
   * gagal saat ditekan.
   */
  const tentukan = useCallback(async () => {
    setGalat(null);
    try {
      const status = await posApi.statusPerangkat();
      if (!hidup.current) return;
      setPerangkat(status);

      try {
        const sesiKini = await posApi.sesi();
        if (!hidup.current) return;
        setSesi(sesiKini);
        await muatMilikPetugas();
        if (hidup.current) setKeadaan('SIAP');
      } catch (err) {
        if (!hidup.current) return;
        lupakanPetugas();
        // Sesi habis/belum ada bukan galat yang perlu ditampilkan — itu keadaan
        // normal sebuah terminal yang sedang menunggu petugas berikutnya.
        if (err instanceof PosError && err.keadaan === 'SESI') {
          setKeadaan('TERKUNCI');
          return;
        }
        setKeadaan('TERKUNCI');
        if (err instanceof PosError && err.status !== 401) setGalat(err.message);
      }
    } catch (err) {
      if (!hidup.current) return;
      setPerangkat(null);
      lupakanPetugas();
      setKeadaan('PERANGKAT');
      if (err instanceof PosError && err.status !== 401) setGalat(err.message);
    }
  }, [lupakanPetugas, muatMilikPetugas]);

  useEffect(() => {
    void tentukan();
  }, [tentukan]);

  const pasang = useCallback(
    async (token: string) => {
      const status = await posApi.pasang(token.trim());
      if (!hidup.current) return;
      setPerangkat(status);
      setKeadaan('TERKUNCI');
      setGalat(null);
    },
    [],
  );

  const masuk = useCallback(
    async (userId: string, pin: string) => {
      const sesiBaru = await posApi.bukaSesi(userId, pin);
      if (!hidup.current) return;
      setSesi(sesiBaru);
      await muatMilikPetugas();
      if (hidup.current) setKeadaan('SIAP');
    },
    [muatMilikPetugas],
  );

  const kunci = useCallback(async () => {
    // Kegagalannya DITELAN, bukan diteruskan. "Ganti Petugas" adalah tindakan
    // yang tidak punya jalan gagal yang berguna: kalau permintaannya tidak
    // sampai ke server, layar tetap harus terkunci — dan pemanggilnya (sebuah
    // `onClick`) tidak punya cara menangani penolakan selain membuangnya, yang
    // berakhir sebagai unhandled rejection di konsol terminal kasir.
    //
    // Sesi di server tetap berumur terbatas dan cookienya dibuang peramban di
    // sisi ini, jadi menelan galat di sini tidak menyisakan sesi yang terbuka.
    try {
      await posApi.kunciSesi();
    } catch (err) {
      console.warn('[pos] gagal mengunci sesi di server, layar tetap dikunci', err);
    } finally {
      // Dikunci di layar APA PUN hasil permintaannya. Kalau jaringan sedang
      // putus, yang paling tidak boleh terjadi adalah terminal tetap terbuka
      // atas nama orang yang sudah berjalan pergi.
      if (hidup.current) {
        lupakanPetugas();
        setKeadaan('TERKUNCI');
      }
    }
  }, [lupakanPetugas]);

  const segarkan = useCallback(async () => {
    try {
      await muatMilikPetugas();
    } catch (err) {
      if (err instanceof PosError && err.keadaan === 'SESI') {
        lupakanPetugas();
        setKeadaan('TERKUNCI');
        return;
      }
      throw err;
    }
  }, [lupakanPetugas, muatMilikPetugas]);

  const nilai = useMemo<NilaiPos>(
    () => ({
      keadaan,
      perangkat,
      sesi,
      absensi,
      jadwalCocok,
      shift,
      galat,
      pasang,
      masuk,
      kunci,
      segarkan,
      pakaiShift: setShift,
      pakaiAbsensi: setAbsensi,
    }),
    [
      keadaan,
      perangkat,
      sesi,
      absensi,
      jadwalCocok,
      shift,
      galat,
      pasang,
      masuk,
      kunci,
      segarkan,
    ],
  );

  return <Konteks.Provider value={nilai}>{children}</Konteks.Provider>;
}
