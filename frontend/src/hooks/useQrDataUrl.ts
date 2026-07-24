import { useEffect, useState } from 'react';
import { qrDataUrl } from '../lib/tableQr';

/**
 * Membuat QR code sebagai data URL. Pembuatannya asinkron, jadi hook ini
 * mengembalikan `null` selama proses dan mengabaikan hasil yang datang setelah
 * komponen dilepas atau teksnya berganti.
 */
export function useQrDataUrl(text: string, size = 240): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);

    qrDataUrl(text, size)
      .then((result) => {
        if (!cancelled) setDataUrl(result);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [text, size]);

  return dataUrl;
}
