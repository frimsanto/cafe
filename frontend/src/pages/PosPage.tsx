import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { PosSessionProvider, usePos } from '../pos/PosSessionContext';
import { useAuth } from '../auth/AuthContext';
import CashierPage from './CashierPage';
import PosShell, { type TabPos } from '../components/pos/PosShell';
import PosPairingScreen from '../components/pos/PosPairingScreen';
import PosLockScreen from '../components/pos/PosLockScreen';
import PanelShift from '../components/pos/PanelShift';
import { AbsensiSaya, JadwalSaya, RiwayatSaya } from '../components/pos/PanelSaya';

/**
 * Layar kasir — gerbang yang menentukan bentuknya dari keadaan terminal.
 *
 * ── Dua cara masuk, dan kenapa keduanya perlu ada ──
 *
 * 1. TERMINAL BERSAMA (jalur utama Bagian C). Tablet di meja kasir yang sudah
 *    dipasangkan pemilik; petugas berganti sepanjang hari dengan PIN, tanpa
 *    seorang pun mengetik kata sandi di layar yang terlihat antrean tamu.
 *
 * 2. STAF YANG LOGIN BIASA. Pemilik membuka laptopnya untuk membantu menagih,
 *    atau kasir masuk dari perangkat yang belum didaftarkan. Ini tetap
 *    dilayani — dengan terus terang menyebutkan apa yang TIDAK bisa dilakukan
 *    di sana: shift dan absensi menuntut terminal terdaftar, karena keduanya
 *    mencatat siapa yang memegang laci di perangkat mana.
 *
 * Yang tidak boleh terjadi adalah kasir mendarat di layar kosong tanpa tahu
 * langkah berikutnya. Setiap keadaan di bawah punya kalimatnya sendiri.
 */
export default function PosPage() {
  return (
    <PosSessionProvider>
      <GerbangPos />
    </PosSessionProvider>
  );
}

function GerbangPos() {
  const { keadaan } = usePos();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabPos>('KASIR');

  if (keadaan === 'MEMUAT') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-cream">
        <p className="text-sm text-warm-muted">Menyiapkan terminal…</p>
      </div>
    );
  }

  if (keadaan === 'PERANGKAT') {
    // Staf yang sudah login tetap bisa bekerja tanpa terminal — tapi tahu
    // batasnya. Yang belum login hanya punya satu jalan: memasang terminal.
    return user ? <TanpaTerminal /> : <PosPairingScreen />;
  }

  if (keadaan === 'TERKUNCI') return <PosLockScreen />;

  return (
    <PosShell tab={tab} onTab={setTab}>
      {tab === 'KASIR' && <CashierPage embedded />}
      {tab === 'SHIFT' && <PanelShift />}
      {tab === 'JADWAL' && <JadwalSaya />}
      {tab === 'ABSENSI' && <AbsensiSaya />}
      {tab === 'RIWAYAT' && <RiwayatSaya />}
    </PosShell>
  );
}

/**
 * Layar kasir untuk staf yang login TANPA terminal terdaftar.
 *
 * Kerangkanya sengaja bukan `AppLayout`: Bagian A menuntut kasir tidak melihat
 * rel navigasi pemilik, dan itu berlaku di sini juga. Pemilik tetap mendapat
 * jalan pulang ke dasbor.
 */
function TanpaTerminal() {
  const { user } = useAuth();

  // Peran dapur tidak punya urusan di layar kasir sama sekali.
  if (user && user.role === 'DAPUR') return <Navigate to="/dapur" replace />;

  return (
    <div className="min-h-screen bg-warm-cream">
      <header className="sticky top-0 z-30 border-b border-warm-line bg-warm-paper/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-warm-espresso">
              {user?.cafeName ?? 'CafeOS'} — Kasir
            </p>
            <p className="truncate text-xs text-warm-muted">{user?.name}</p>
          </div>
          {user?.role === 'OWNER' && (
            <Link
              to="/dasbor"
              className="rounded-lg border border-warm-line px-3 py-1.5 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30"
            >
              Kembali ke Dasbor
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 rounded-2xl border border-warm-amber/40 bg-warm-amber/5 p-4">
          <h2 className="text-sm font-semibold text-warm-espresso">
            Perangkat ini belum terdaftar sebagai terminal
          </h2>
          <p className="mt-1 text-sm text-warm-muted">
            Kamu tetap bisa menerima pesanan dan menagih dari sini. Yang belum
            bisa dipakai adalah <strong>shift kasir dan absensi</strong> —
            keduanya mencatat siapa yang memegang laci di perangkat mana, jadi
            keduanya menuntut terminal yang didaftarkan pemilik.
          </p>
          {user?.role === 'OWNER' && (
            <Link
              to="/dasbor/staf"
              className="mt-2 inline-block text-sm font-medium text-warm-amber underline"
            >
              Daftarkan terminal di Manajemen Staf
            </Link>
          )}
        </div>

        <CashierPage embedded />
      </main>
    </div>
  );
}
