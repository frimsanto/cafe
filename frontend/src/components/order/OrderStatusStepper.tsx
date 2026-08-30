import type { ReactElement, ReactNode } from 'react';
import type { KitchenStatus, OrderStatus } from '../../types/order';

/** Fase yang dilihat pelanggan — lebih halus daripada `OrderStatus` mentah. */
export type OrderPhase = 'DIBAYAR' | 'DIMASAK' | 'SIAP' | 'SELESAI';

const PHASES: OrderPhase[] = ['DIBAYAR', 'DIMASAK', 'SIAP', 'SELESAI'];

/** Label satu kata di bawah tiap lingkaran — harus muat empat kolom di ponsel. */
const LABEL: Record<OrderPhase, string> = {
  DIBAYAR: 'Dibayar',
  DIMASAK: 'Diproses',
  SIAP: 'Siap',
  SELESAI: 'Selesai',
};

/** Kalimat pendamping tiap fase — dipakai kartu status utama di halaman. */
export const PHASE_CAPTION: Record<OrderPhase, string> = {
  DIBAYAR: 'Pesanan sudah masuk antrean dapur.',
  DIMASAK: 'Dapur sedang menyiapkan pesanan kamu.',
  SIAP: 'Tunjukkan nomor ini kepada pelayan.',
  SELESAI: 'Terima kasih, selamat menikmati.',
};

/** True bila seluruh item pesanan sudah ditandai siap oleh dapur. */
export function semuaItemSiap(items: { kitchenStatus: KitchenStatus }[]): boolean {
  return items.length > 0 && items.every((i) => i.kitchenStatus === 'READY');
}

/**
 * Terjemahkan keadaan pesanan menjadi satu fase pelanggan.
 *
 * `orders.status` hanya mengenal tiga nilai (menunggu bayar → dapur → selesai),
 * sehingga "baru masuk antrean" dan "sedang dimasak" tidak bisa dibedakan
 * darinya saja. Yang membedakan ada di `items[].kitchenStatus`: begitu chef
 * menekan "Dimasak" pada item mana pun, pesanan naik ke fase DIMASAK.
 *
 * Catatan tahap 3 & 4: keduanya kini benar-benar terpisah. "Siap" menyala saat
 * chef menyelesaikan masakannya, dan "Selesai" baru menyusul ketika kasir
 * menandai pesanannya sudah diserahkan ke tamu. Sebelumnya server menutup
 * pesanan pada detik item terakhir matang — yang berarti pesanan tercatat
 * selesai padahal belum ada yang mengantarkannya ke meja.
 */
export function orderPhase(
  status: OrderStatus,
  items: { kitchenStatus: KitchenStatus }[] = [],
): OrderPhase {
  if (status === 'SELESAI') return 'SELESAI';
  if (semuaItemSiap(items)) return 'SIAP';
  if (status !== 'DIPROSES_DAPUR') return 'DIBAYAR';
  return items.some((i) => i.kitchenStatus !== 'WAITING') ? 'DIMASAK' : 'DIBAYAR';
}

/**
 * Kerangka ikon garis 24×24 bergeometri Lucide (CreditCard, ChefHat, BellRing,
 * CircleCheck, Check). Digambar langsung alih-alih menarik `lucide-react`: lima
 * lambang tidak sebanding dengan satu dependensi ikon baru, dan berkas ini
 * satu-satunya pemakainya.
 */
function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** CreditCard — pesanan sudah dibayar. */
function IkonKartu() {
  return (
    <Ikon>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </Ikon>
  );
}

/** ChefHat — dapur sedang menyiapkan. */
function IkonTopiChef() {
  return (
    <Ikon>
      <path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z" />
      <path d="M6 17h12" />
    </Ikon>
  );
}

/** BellRing — pesanan siap disajikan, tamu dipanggil. */
function IkonLonceng() {
  return (
    <Ikon>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M22 8c0-2.3-.8-4.3-2-6" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      <path d="M4 2C2.8 3.7 2 5.7 2 8" />
    </Ikon>
  );
}

/** CircleCheck — pesanan tuntas. */
function IkonLingkaranCentang() {
  return (
    <Ikon>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Ikon>
  );
}

/** Check — menggantikan lambang tahap begitu tahap itu terlewati. */
function IkonCentang() {
  return (
    <Ikon>
      <path d="M20 6 9 17l-5-5" />
    </Ikon>
  );
}

const IKON: Record<OrderPhase, () => ReactElement> = {
  DIBAYAR: IkonKartu,
  DIMASAK: IkonTopiChef,
  SIAP: IkonLonceng,
  SELESAI: IkonLingkaranCentang,
};

interface OrderStatusStepperProps {
  status: OrderStatus;
  /** Item pesanan — sumber fase "sedang diproses" & "siap". */
  items?: { kitchenStatus: KitchenStatus }[];
}

/**
 * Progres pesanan untuk PELANGGAN: Dibayar → Diproses → Siap → Selesai.
 *
 * Disusun MENYAMPING dalam empat kolom sama lebar, dihubungkan garis tipis:
 * seluruh perjalanan pesanan terbaca dalam satu pandang tanpa menggulir, dan
 * kartu ini tetap ringkas di layar ponsel.
 *
 * Tiga keadaan, dibedakan tanpa perlu membaca label:
 *  - Belum tercapai: lambang tahapnya abu-abu di lingkaran berbingkai kosong.
 *  - Sedang berjalan: lambang tahapnya putih di lingkaran hijau, dengan denyut
 *    yang melebar keluar sehingga mata langsung menemukannya.
 *  - Sudah lewat: lambangnya berganti centang di lingkaran hijau padat.
 *
 * Garis penghubungnya ikut bercerita: ruas yang sudah dilewati terisi hijau
 * dari kiri ke kanan (lewat transform, bukan lebar — supaya animasinya tidak
 * memaksa tata letak dihitung ulang), sedangkan ruas yang SEDANG ditempuh
 * dialiri cahaya hijau berjalan searah, penanda "pesanan masih bergerak menuju
 * tahap berikutnya".
 *
 * Digerakkan realtime: halaman status menyambung ke kanal WebSocket kafe dan
 * memperbarui pesanan tiap kali dapur mengubah status masaknya, jadi seluruh
 * perpindahan keadaan di atas terjadi sendiri di layar tamu.
 */
export default function OrderStatusStepper({
  status,
  items = [],
}: OrderStatusStepperProps) {
  const fase = orderPhase(status, items);
  const currentIndex = PHASES.indexOf(fase);

  return (
    <ol className="flex items-start">
      {PHASES.map((phase, index) => {
        const lewat = index < currentIndex;
        const berjalan = index === currentIndex;
        const tercapai = index <= currentIndex;
        const Lambang = IKON[phase];

        return (
          <li
            key={phase}
            aria-current={berjalan ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center"
          >
            {/* Garis menuju tahap berikutnya. Dimulai dari titik tengah kolom
                ini dan selebar satu kolom penuh — karena semua kolom `flex-1`,
                ujungnya jatuh tepat di titik tengah kolom sesudahnya. */}
            {index < PHASES.length - 1 && (
              <span
                aria-hidden
                className="absolute left-1/2 top-5 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-slate-200"
              >
                <span
                  className={`block h-full w-full origin-left rounded-full bg-forest-600 transition-transform duration-500 ease-out ${
                    lewat ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
                {berjalan && <span className="line-flow absolute inset-0" />}
              </span>
            )}

            <span
              className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                tercapai
                  ? 'border-forest-600 bg-forest-600 text-white'
                  : 'border-slate-200 bg-white text-slate-300'
              } ${berjalan ? 'ring-4 ring-forest-600/15' : 'ring-0 ring-transparent'}`}
            >
              {berjalan && (
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-forest-500 opacity-40 motion-reduce:animate-none"
                />
              )}
              {/* `key` berganti saat tahap ini terlewati, jadi React memasang
                  ulang simpulnya dan centangnya benar-benar memantul masuk
                  alih-alih diam-diam menggantikan lambang sebelumnya. */}
              <span
                key={lewat ? 'centang' : 'lambang'}
                className="relative animate-pop-in"
              >
                {lewat ? <IkonCentang /> : <Lambang />}
              </span>
            </span>

            <p
              className={`mt-2 text-center text-xs font-semibold transition-colors duration-500 ${
                tercapai ? 'text-forest-800' : 'text-slate-400'
              }`}
            >
              {LABEL[phase]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
