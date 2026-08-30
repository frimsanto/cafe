import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PinModal from './PinModal';

/**
 * Modal PIN.
 *
 * Yang diuji adalah PERILAKU yang menentukan keamanan, bukan markupnya: PIN
 * lemah ditolak sebelum menyentuh jaringan, salah ketik tertangkap di sini
 * alih-alih nanti saat staf berdiri di depan terminal dan gagal masuk, dan
 * layar ini tidak pernah menjanjikan sesuatu yang tidak ada ("lihat PIN lama").
 */
function pasang(sudahPunyaPin = false) {
  const onSimpan = vi.fn();
  const onTutup = vi.fn();
  render(
    <PinModal
      nama="Budi"
      sudahPunyaPin={sudahPunyaPin}
      busy={false}
      onTutup={onTutup}
      onSimpan={onSimpan}
    />,
  );
  return { onSimpan, onTutup };
}

async function isi(pin: string, ulang: string) {
  const kolom = screen.getAllByLabelText(/PIN baru|Ketik ulang/i);
  await userEvent.type(kolom[0], pin);
  await userEvent.type(kolom[1], ulang);
  await userEvent.click(screen.getByRole('button', { name: /Simpan PIN/i }));
}

describe('PinModal', () => {
  it('mengirim PIN yang sah', async () => {
    const { onSimpan } = pasang();
    await isi('4837', '4837');
    expect(onSimpan).toHaveBeenCalledWith('4837');
  });

  // Salah ketik baru ketahuan saat staf gagal masuk di terminal — jauh dari
  // orang yang bisa memperbaikinya.
  it('menolak bila dua ketikan berbeda', async () => {
    const { onSimpan } = pasang();
    await isi('4837', '4838');
    expect(onSimpan).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/berbeda/i);
  });

  it('menolak PIN yang terlalu mudah ditebak, tanpa memanggil server', async () => {
    const { onSimpan } = pasang();
    await isi('1234', '1234');
    expect(onSimpan).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/mudah ditebak/i);
  });

  it('menolak PIN yang terlalu pendek', async () => {
    const { onSimpan } = pasang();
    await isi('12', '12');
    expect(onSimpan).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/4-6 angka/i);
  });

  it('membuang karakter selain angka saat diketik', async () => {
    const { onSimpan } = pasang();
    const kolom = screen.getAllByLabelText(/PIN baru|Ketik ulang/i);
    await userEvent.type(kolom[0], '4a8b3c7');
    await userEvent.type(kolom[1], '4837');
    await userEvent.click(screen.getByRole('button', { name: /Simpan PIN/i }));
    expect(onSimpan).toHaveBeenCalledWith('4837');
  });

  // Tidak ada tempat di sistem ini yang bisa membaca PIN lama — layarnya
  // mengatakan itu terus terang alih-alih membiarkan pemilik mencari tombol
  // yang memang tidak akan pernah ada.
  it('mengatakan bahwa PIN lama tidak bisa dibaca saat mereset', () => {
    pasang(true);
    expect(screen.getByText(/tidak bisa dibaca siapa pun/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lihat PIN/i })).toBeNull();
  });

  it('mengingatkan bahwa PIN harus disampaikan langsung', () => {
    pasang();
    expect(screen.getByText(/Sampaikan PIN ini langsung kepada Budi/i)).toBeInTheDocument();
  });
});
