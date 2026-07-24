import { useState } from 'react';

interface MenuItemImageProps {
  src: string;
  alt: string;
  className?: string;
}

// Palet gradient untuk placeholder — dipilih deterministik dari nama item
// supaya konsisten antar render.
const GRADIENTS = [
  'from-amber-200 to-orange-300',
  'from-teal-200 to-emerald-300',
  'from-rose-200 to-pink-300',
  'from-sky-200 to-indigo-300',
  'from-lime-200 to-green-300',
  'from-violet-200 to-purple-300',
];

function gradientFor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash + text.charCodeAt(i)) % GRADIENTS.length;
  }
  return GRADIENTS[hash];
}

/**
 * Menampilkan foto menu. Jika `src` kosong atau gagal dimuat, jatuh ke
 * placeholder gradient berinisial nama item — agar tata letak tetap rapi.
 */
export default function MenuItemImage({ src, alt, className = '' }: MenuItemImageProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  if (showFallback) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br ${gradientFor(
          alt,
        )} ${className}`}
        aria-label={alt}
        role="img"
      >
        <span className="text-2xl font-bold text-white/80 drop-shadow-sm">
          {alt.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
