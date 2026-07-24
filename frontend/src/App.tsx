import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { CartProvider } from './cart/CartContext';
import { AuthProvider } from './auth/AuthContext';
import { TableSessionProvider } from './table/TableSessionContext';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MenuPage from './pages/MenuPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import KitchenDisplayPage from './pages/KitchenDisplayPage';
import DashboardPage from './pages/DashboardPage';
import CafeMenuPage from './pages/CafeMenuPage';
import MenuManagementPage from './pages/MenuManagementPage';
import TableManagementPage from './pages/TableManagementPage';
import CashierPage from './pages/CashierPage';

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
            <Route
              path="/pesanan/sukses"
              element={
                <CustomerRoute>
                  <PaymentSuccessPage />
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

            <Route path="*" element={<Navigate to="/menu" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
