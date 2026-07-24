import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CartProvider } from './cart/CartContext';
import { AuthProvider } from './auth/AuthContext';
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
 * Routing aplikasi. Alur QR pelanggan mengarah ke `/menu/:tableId`
 * (mis. hasil scan QR meja). Keranjang bersifat global (CartProvider) sehingga
 * item tetap tersimpan saat berpindah antar halaman.
 *
 * Fase frontend: `tableId` belum dipakai — data masih dari mock.
 */
export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/menu" replace />} />

            {/* Pelanggan (tanpa login — akses lewat QR meja) */}
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/menu/:tableId" element={<MenuPage />} />
            <Route path="/keranjang" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pesanan/sukses" element={<PaymentSuccessPage />} />

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
