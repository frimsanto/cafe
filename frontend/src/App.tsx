import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import Lenis from '@studio-freight/lenis';
import {
  MODAL_CLOSE_EVENT,
  MODAL_OPEN_EVENT,
  isScrollLocked,
} from './hooks/useBodyScrollLock';
import { CartProvider } from './cart/CartContext';
import { AuthProvider } from './auth/AuthContext';
import { TableSessionProvider } from './table/TableSessionContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MenuPage from './pages/MenuPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import PesananStatusPage from './pages/PesananStatusPage';
import KitchenDisplayPage from './pages/KitchenDisplayPage';
import DashboardPage from './pages/DashboardPage';
import CafeMenuPage from './pages/CafeMenuPage';
import MenuManagementPage from './pages/MenuManagementPage';
import TableManagementPage from './pages/TableManagementPage';
import CashierPage from './pages/CashierPage';
import PaymentSettingsPage from './pages/PaymentSettingsPage';
import PembayaranStatusPage from './pages/PembayaranStatusPage';

/**
 * Pembungkus halaman pelanggan: mengambil token QR dari URL lalu
 * menerjemahkannya menjadi meja + kafe untuk seluruh halaman di bawahnya.
 */
function CustomerRoute({ children }: { children: React.ReactNode }) {
  const { qrCode } = useParams();
  return <TableSessionProvider qrCode={qrCode}>{children}</TableSessionProvider>;
}

/**
 * Routing aplikasi. Alur QR pelanggan mengarah ke `/menu/:qrCode` — bentuk
 * URL yang memang dienkode server ke stiker meja (lihat `backend/src/lib/
 * qrUrl.ts`), sehingga tokennya bisa langsung diterjemahkan lewat
 * `GET /api/tables/by-qr/:qrCode`.
 *
 * Keranjang bersifat global (CartProvider) sehingga item tetap tersimpan saat
 * berpindah antar halaman.
 */
export default function App() {
  // Smooth scroll global (Lenis). RAF loop dibersihkan saat unmount agar tidak
  // bertumpuk saat HMR / StrictMode menjalankan efek dua kali.
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    // Lenis dihentikan selama ada modal terbuka. `body { overflow: hidden }`
    // dari `useBodyScrollLock` hanya mencegah gulir dari pengguna — Lenis
    // menggeser `documentElement.scrollTop` lewat kode, sehingga roda mouse di
    // atas latar modal tetap menggeser halaman di belakangnya. Saat berhenti,
    // Lenis menelan wheel & touch tanpa menggerakkan apa pun.
    //
    // Isi modal tidak ikut terkunci: `ModalScrollArea` menandai dirinya dengan
    // `data-lenis-prevent`, dan Lenis memeriksa penanda itu lebih dulu daripada
    // status berhentinya, jadi event di dalam modal dilewatkan ke gulir asli.
    //
    // `start()` memanggil `reset()` di dalam Lenis, yang menyelaraskan posisi
    // internalnya ke posisi gulir sebenarnya — mencegah halaman melompat saat
    // modal ditutup.
    const pause = () => lenis.stop();
    const resume = () => lenis.start();
    window.addEventListener(MODAL_OPEN_EVENT, pause);
    window.addEventListener(MODAL_CLOSE_EVENT, resume);
    // Modal bisa sudah terbuka sebelum efek ini berjalan (StrictMode memasang
    // ulang efek, atau HMR me-refresh App) — kuncinya harus tetap terbawa.
    if (isScrollLocked()) lenis.stop();

    let rafId = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    });
    return () => {
      window.removeEventListener(MODAL_OPEN_EVENT, pause);
      window.removeEventListener(MODAL_CLOSE_EVENT, resume);
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/menu" replace />} />

            {/* Pelanggan (tanpa login — akses lewat QR meja) */}
            <Route
              path="/menu"
              element={
                <CustomerRoute>
                  <MenuPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/menu/:qrCode"
              element={
                <CustomerRoute>
                  <MenuPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/keranjang"
              element={
                <CustomerRoute>
                  <CartPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/checkout"
              element={
                <CustomerRoute>
                  <CheckoutPage />
                </CustomerRoute>
              }
            />
            {/* Status pesanan & pembayaran — tujuan callback Snap dan jalur kasir */}
            <Route
              path="/pesanan/:orderId"
              element={
                <CustomerRoute>
                  <PesananStatusPage />
                </CustomerRoute>
              }
            />

            {/* Staf & pemilik — dilindungi sesuai peran */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/daftar" element={<RegisterPage />} />

            <Route
              path="/dapur"
              element={
                <ProtectedRoute allow={['DAPUR', 'OWNER']}>
                  <KitchenDisplayPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dasbor"
              element={
                <ProtectedRoute allow={['OWNER']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dasbor/menu"
              element={
                <ProtectedRoute allow={['OWNER']}>
                  <CafeMenuPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dasbor/manajemen-menu"
              element={
                <ProtectedRoute allow={['OWNER']}>
                  <MenuManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dasbor/meja"
              element={
                <ProtectedRoute allow={['OWNER']}>
                  <TableManagementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/kasir"
              element={
                <ProtectedRoute allow={['KASIR', 'OWNER']}>
                  <CashierPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dasbor/pembayaran"
              element={
                <ProtectedRoute allow={['OWNER']}>
                  <PaymentSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pembayaran/:midtransOrderId"
              element={
                <ProtectedRoute allow={['KASIR', 'OWNER']}>
                  <PembayaranStatusPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/menu" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
