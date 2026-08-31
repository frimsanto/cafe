import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KameraAbsensi from './KameraAbsensi';

/**
 * Kamera absensi.
 *
 * Yang diuji adalah KEADAAN GAGALNYA, bukan jalur bahagianya saja. Kamera di
 * tablet kasir gagal karena tiga sebab yang berbeda — izin ditolak, tidak ada
 * kamera, sedang dipakai aplikasi lain — dan ketiganya menuntut tindakan yang
 * berbeda dari orang yang berdiri di depannya. "Gagal membuka kamera" tidak
 * memberi tahu siapa pun apa yang harus dilakukan berikutnya.
 */

/** Track palsu supaya komponen bisa mematikan aliran seperti biasa. */
function streamPalsu() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

/** Pasang `getUserMedia` yang berhasil / melempar galat bernama tertentu. */
function pasangKamera(hasil: MediaStream | Error) {
  const getUserMedia = vi.fn(async () => {
    if (hasil instanceof Error) throw hasil;
    return hasil;
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return getUserMedia;
}

function galatBernama(nama: string): Error {
  const e = new Error(nama);
  e.name = nama;
  return e;
}

beforeEach(() => {
  // jsdom tidak memutar video; `play()` dipanggil komponen dan harus ada.
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);

  // `toBlob` tidak ada di jsdom — inilah yang menghasilkan JPEG-nya.
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));
  } as HTMLCanvasElement['toBlob'];

  URL.createObjectURL = vi.fn(() => 'blob:pratinjau');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('kamera berhasil', () => {
  it('menyalakan kamera depan tanpa audio', async () => {
    const { stream } = streamPalsu();
    const getUserMedia = pasangKamera(stream);

    render(<KameraAbsensi onSiap={vi.fn()} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'user' }),
        audio: false,
      }),
    );
  });

  /**
   * Alur lengkap: ambil → pratinjau → konfirmasi.
   *
   * Pratinjau bukan hiasan — ia satu-satunya kesempatan orangnya melihat bahwa
   * wajahnya memang terekam sebelum foto itu menjadi bukti kehadiran.
   */
  it('mengambil foto, menampilkan pratinjau, lalu menyerahkan JPEG', async () => {
    const { stream } = streamPalsu();
    pasangKamera(stream);
    const onSiap = vi.fn();

    render(<KameraAbsensi onSiap={onSiap} labelAmbil="Ambil Foto Masuk" />);

    const tombol = await screen.findByRole('button', { name: /Ambil Foto Masuk/i });
    await waitFor(() => expect(tombol).toBeEnabled());
    await userEvent.click(tombol);

    // Pratinjau muncul, foto BELUM dikirim.
    expect(await screen.findByAltText(/Pratinjau foto absensi/i)).toBeInTheDocument();
    expect(onSiap).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Pakai Foto Ini/i }));

    expect(onSiap).toHaveBeenCalledTimes(1);
    const hasil = onSiap.mock.calls[0][0];
    expect(hasil.blob.type).toBe('image/jpeg');
    expect(hasil.diambilPada).toBeInstanceOf(Date);
  });

  // Lampu kamera yang menyala terus saat orang membaca konfirmasi membuat
  // siapa pun tidak nyaman.
  it('mematikan kamera setelah foto diambil', async () => {
    const { stream, stop } = streamPalsu();
    pasangKamera(stream);

    render(<KameraAbsensi onSiap={vi.fn()} />);
    const tombol = await screen.findByRole('button', { name: /Ambil Foto/i });
    await waitFor(() => expect(tombol).toBeEnabled());
    await userEvent.click(tombol);

    await screen.findByAltText(/Pratinjau/i);
    expect(stop).toHaveBeenCalled();
  });

  it('bisa mengambil ulang dan menyalakan kamera lagi', async () => {
    const { stream } = streamPalsu();
    const getUserMedia = pasangKamera(stream);

    render(<KameraAbsensi onSiap={vi.fn()} />);
    const tombol = await screen.findByRole('button', { name: /Ambil Foto/i });
    await waitFor(() => expect(tombol).toBeEnabled());
    await userEvent.click(tombol);

    await screen.findByAltText(/Pratinjau/i);
    await userEvent.click(screen.getByRole('button', { name: /Ambil Ulang/i }));

    // Pratinjaunya hilang dan kameranya dinyalakan lagi.
    expect(screen.queryByAltText(/Pratinjau/i)).toBeNull();
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pratinjau');
  });
});

describe('kamera gagal', () => {
  it('menjelaskan izin yang ditolak, dengan langkah memperbaikinya', async () => {
    pasangKamera(galatBernama('NotAllowedError'));
    render(<KameraAbsensi onSiap={vi.fn()} />);

    const peringatan = await screen.findByRole('alert');
    expect(peringatan).toHaveTextContent(/Izin kamera ditolak/i);
    expect(peringatan).toHaveTextContent(/pengaturan situs/i);
  });

  it('membedakan "tidak ada kamera" dari izin ditolak', async () => {
    pasangKamera(galatBernama('NotFoundError'));
    render(<KameraAbsensi onSiap={vi.fn()} onPengecualian={vi.fn()} />);

    const peringatan = await screen.findByRole('alert');
    expect(peringatan).toHaveTextContent(/Tidak ada kamera/i);
    // Perangkat tanpa kamera diarahkan ke pengecualian, bukan disuruh mencoba
    // mengubah izin yang tidak ada.
    expect(peringatan).toHaveTextContent(/pengecualian foto/i);
  });

  it('mengenali kamera yang sedang dipakai aplikasi lain', async () => {
    pasangKamera(galatBernama('NotReadableError'));
    render(<KameraAbsensi onSiap={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/sedang dipakai/i);
  });

  /**
   * `mediaDevices` tidak ada sama sekali pada konteks non-secure — http:// di
   * luar localhost. Itu keadaan yang berbeda dari izin ditolak, dan sarannya
   * pun berbeda: yang harus diperbaiki adalah alamat terminalnya.
   */
  it('menjelaskan peramban/konteks yang tidak mendukung kamera', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    render(<KameraAbsensi onSiap={vi.fn()} />);
    const peringatan = await screen.findByRole('alert');
    expect(peringatan).toHaveTextContent(/tidak mendukung kamera/i);
    expect(peringatan).toHaveTextContent(/HTTPS/i);
  });

  it('bisa mencoba lagi setelah gagal', async () => {
    const getUserMedia = pasangKamera(galatBernama('NotAllowedError'));
    render(<KameraAbsensi onSiap={vi.fn()} />);

    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: /Coba Lagi/i }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  });

  it('menawarkan jalur pengecualian saat kamera bermasalah', async () => {
    pasangKamera(galatBernama('NotAllowedError'));
    const onPengecualian = vi.fn();
    render(<KameraAbsensi onSiap={vi.fn()} onPengecualian={onPengecualian} />);

    await screen.findByRole('alert');
    await userEvent.click(
      screen.getByRole('button', { name: /Absen tanpa foto/i }),
    );
    expect(onPengecualian).toHaveBeenCalledWith('IZIN_DITOLAK');
  });

  // Tanpa `onPengecualian`, jalur itu tidak boleh ditawarkan sama sekali —
  // tombol yang tidak melakukan apa-apa lebih buruk daripada tidak ada tombol.
  it('tidak menawarkan pengecualian bila pemanggil tidak menyediakannya', async () => {
    pasangKamera(galatBernama('NotAllowedError'));
    render(<KameraAbsensi onSiap={vi.fn()} />);

    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: /tanpa foto/i })).toBeNull();
  });
});
