import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface DecryptedTextProps {
  /** Teks final yang akan terungkap. */
  text: string;
  /** Jeda antar-langkah pengungkapan (ms). */
  speed?: number;
  /** Kumpulan karakter untuk efek acak sebelum huruf terungkap. */
  characters?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Efek "decrypt" ala ReactBits: huruf terungkap dari kiri ke kanan, sementara
 * sisa huruf yang belum terungkap ditampilkan sebagai karakter acak. Berjalan
 * sekali saat komponen mount.
 *
 * Panjang string yang ditampilkan selalu sama dengan teks final sehingga tidak
 * menimbulkan pergeseran layout, dan `aria-label` memastikan pembaca layar
 * tetap membaca teks aslinya, bukan karakter acak.
 */
export default function DecryptedText({
  text,
  speed = 50,
  characters = 'abcdefghijklmnopqrstuvwxyz',
  className,
  style,
}: DecryptedTextProps) {
  const [display, setDisplay] = useState(text);
  const revealed = useRef(0);

  useEffect(() => {
    revealed.current = 0;

    const scramble = () => {
      const next = text
        .split('')
        .map((ch, i) => {
          if (ch === ' ') return ' ';
          if (i < revealed.current) return ch;
          return characters[Math.floor(Math.random() * characters.length)];
        })
        .join('');
      setDisplay(next);
    };

    scramble();
    const id = window.setInterval(() => {
      revealed.current += 1;
      if (revealed.current >= text.length) {
        window.clearInterval(id);
        setDisplay(text);
        return;
      }
      scramble();
    }, speed);

    return () => window.clearInterval(id);
  }, [text, speed, characters]);

  return (
    <span className={className} style={style} aria-label={text}>
      {display}
    </span>
  );
}
