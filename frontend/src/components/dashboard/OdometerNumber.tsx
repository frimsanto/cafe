import { useEffect, type CSSProperties } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

interface OdometerNumberProps {
  /** Nilai akhir yang dituju animasi. */
  value: number;
  /** Pemformat angka menjadi teks (mis. Rupiah atau pemisah ribuan). */
  format: (n: number) => string;
  /** Durasi animasi (detik). */
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Angka ber-animasi ala odometer: menghitung naik dari nilai sebelumnya ke
 * nilai baru dengan easing lembut (framer-motion). Saat pertama render, mulai
 * dari 0; pada pembaruan berikutnya beranimasi dari nilai lama ke nilai baru
 * sehingga perubahan realtime terasa mulus, bukan meloncat balik ke 0.
 */
export default function OdometerNumber({
  value,
  format,
  duration = 1.4,
  className,
  style,
}: OdometerNumberProps) {
  const motionValue = useMotionValue(0);
  const text = useTransform(motionValue, (latest) => format(Math.round(latest)));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return controls.stop;
  }, [value, duration, motionValue]);

  return (
    <motion.span className={className} style={style}>
      {text}
    </motion.span>
  );
}
