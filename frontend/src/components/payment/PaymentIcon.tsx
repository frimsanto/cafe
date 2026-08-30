import type { SVGProps } from 'react';

/**
 * Ikon garis untuk modul pembayaran.
 *
 * Project ini tidak memakai pustaka ikon — `AppLayout` sudah menggambar rel
 * navigasinya dengan SVG inline bergaya sama, dan modul ini mengikutinya.
 * Emoji sengaja TIDAK dipakai lagi (halaman lama memakai 💵/📱/🏦/💳): emoji
 * dirender berbeda di tiap sistem operasi, tidak bisa diwarnai mengikuti
 * keadaan (aktif/nonaktif), dan dibacakan pembaca layar sebagai kalimat penuh
 * yang tidak diminta siapa pun.
 *
 * Semua ikon mewarisi `currentColor` sehingga bisa ditint oleh induknya.
 */

export type PaymentIconName =
  | 'tunai'
  | 'qris'
  | 'transfer'
  | 'edc'
  | 'online'
  | 'shield'
  | 'check'
  | 'alert'
  | 'x'
  | 'clock'
  | 'salin'
  | 'tautan'
  | 'sunting'
  | 'unggah'
  | 'info'
  | 'putar';

const dasar = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const satisfies SVGProps<SVGSVGElement>;

const JALUR: Record<PaymentIconName, JSX.Element> = {
  // Lembar uang.
  tunai: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  // Kode QR.
  qris: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" />
    </>
  ),
  // Gedung bank.
  transfer: (
    <>
      <path d="M3 10h18L12 4 3 10Z" />
      <path d="M5 10v8M10 10v8M14 10v8M19 10v8" />
      <path d="M3 20h18" />
    </>
  ),
  // Kartu + garis magnetik.
  edc: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  // Bola dunia — pembayaran online.
  online: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18-2.5-2.7-2.5-15.3 0-18Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4 3 7.4 7 9 4-1.6 7-5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  alert: (
    <>
      <path d="M12 4 2.7 20h18.6L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  salin: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  tautan: (
    <>
      <path d="M10 13a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7L11.5 6" />
      <path d="M14 11a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7L12.5 18" />
    </>
  ),
  sunting: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </>
  ),
  unggah: (
    <>
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  putar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v5h-5" />
    </>
  ),
};

interface PaymentIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: PaymentIconName;
  size?: number;
}

export default function PaymentIcon({ name, size = 20, ...rest }: PaymentIconProps) {
  return (
    <svg
      {...dasar}
      width={size}
      height={size}
      // Ikon di sini selalu menemani teks yang menyebutkan hal yang sama, jadi
      // menyembunyikannya dari pembaca layar mencegah label terbaca dua kali.
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {JALUR[name]}
    </svg>
  );
}
