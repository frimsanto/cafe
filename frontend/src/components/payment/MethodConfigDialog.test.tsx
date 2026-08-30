import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MetodePembayaranDTO } from '../../types/api';
import MethodConfigDialog from './MethodConfigDialog';

function metode(kode: string, ubah: Record<string, unknown> = {}): MetodePembayaranDTO {
  return {
    metode: kode,
    aktif: false,
    tersediaDiKasir: true,
    tersediaDiCheckout: false,
    bolehDiCheckout: kode === 'QRIS_STATIS' || kode === 'TRANSFER',
    wajibVerifikasiKasir: true,
    instruksi: null,
    batasWaktuMenit: null,
    qrisImageUrl: null,
    qrisMerchantName: null,
    qrisNmid: null,
    bankNama: null,
    bankNomorRekening: null,
    bankAtasNama: null,
    edcProvider: null,
    edcTerminalLabel: null,
    konfigurasiLengkap: false,
    ...ubah,
  } as MetodePembayaranDTO;
}

function pasang(m: MetodePembayaranDTO, onSimpan = vi.fn()) {
  render(
    <MethodConfigDialog
      metode={m}
      busy={false}
      error={null}
      onUnggahQris={vi.fn(async () => ({ url: 'https://x/qr.png', publicId: 'p' }))}
      onSimpan={onSimpan}
      onTutup={vi.fn()}
    />,
  );
  return onSimpan;
}

describe('MethodConfigDialog — isian per metode', () => {
  it('QRIS statis meminta gambar dan nama merchant', () => {
    pasang(metode('QRIS_STATIS'));
    expect(screen.getByText(/Gambar QRIS/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nama merchant/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nomor rekening/i)).not.toBeInTheDocument();
  });

  it('transfer bank meminta rekening dan batas waktu', () => {
    pasang(metode('TRANSFER'));
    expect(screen.getByLabelText(/Nama bank/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nomor rekening/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Atas nama/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Batas waktu pembayaran/i)).toBeInTheDocument();
  });

  it('EDC hanya meminta provider dan label terminal', () => {
    pasang(metode('EDC'));
    expect(screen.getByLabelText(/provider EDC/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nomor rekening/i)).not.toBeInTheDocument();
  });
});

describe('MethodConfigDialog — kanal', () => {
  // Aturan domain: tunai & EDC menuntut kasir yang hadir.
  it('mengunci sakelar checkout untuk metode yang tidak boleh ke sana', () => {
    pasang(metode('EDC'));
    const sakelar = screen.getByRole('switch', { name: /Tersedia di checkout pelanggan/i });
    expect(sakelar).toBeDisabled();
    expect(screen.getByText(/butuh kasir yang hadir/i)).toBeInTheDocument();
  });

  // Kombinasi "tamu bayar sendiri, langsung lunas, tanpa ada yang memeriksa"
  // tidak boleh pernah bisa dipilih.
  it('memaksa verifikasi kasir menyala saat checkout dinyalakan', async () => {
    const user = userEvent.setup();
    pasang(metode('TRANSFER', { wajibVerifikasiKasir: false }));

    const verifikasi = screen.getByRole('switch', { name: /Wajib verifikasi kasir/i });
    expect(verifikasi).not.toBeChecked();

    await user.click(screen.getByRole('switch', { name: /Tersedia di checkout pelanggan/i }));

    expect(verifikasi).toBeChecked();
    expect(verifikasi).toBeDisabled();
    expect(screen.getByText(/Terkunci menyala/i)).toBeInTheDocument();
  });

  it('mengirim wajibVerifikasiKasir = true untuk metode checkout', async () => {
    const user = userEvent.setup();
    const onSimpan = pasang(metode('TRANSFER', { wajibVerifikasiKasir: false }));

    await user.click(screen.getByRole('switch', { name: /Tersedia di checkout pelanggan/i }));
    await user.click(screen.getByRole('button', { name: /Simpan Pengaturan/i }));

    expect(onSimpan).toHaveBeenCalledWith(
      expect.objectContaining({ tersediaDiCheckout: true, wajibVerifikasiKasir: true }),
    );
  });
});

describe('MethodConfigDialog — menyimpan', () => {
  it('mengirim hanya field milik metodenya', async () => {
    const user = userEvent.setup();
    const onSimpan = pasang(metode('EDC'));

    await user.type(screen.getByLabelText(/provider EDC/i), 'BCA');
    await user.click(screen.getByRole('button', { name: /Simpan Pengaturan/i }));

    const kirim = onSimpan.mock.calls[0][0] as Record<string, unknown>;
    expect(kirim.edcProvider).toBe('BCA');
    expect(kirim).not.toHaveProperty('bankNomorRekening');
    expect(kirim).not.toHaveProperty('qrisImageUrl');
  });

  it('mengubah isian kosong menjadi null, bukan string kosong', async () => {
    const user = userEvent.setup();
    const onSimpan = pasang(metode('EDC'));

    await user.click(screen.getByRole('button', { name: /Simpan Pengaturan/i }));
    expect(onSimpan).toHaveBeenCalledWith(
      expect.objectContaining({ edcProvider: null, instruksi: null }),
    );
  });

  it('bisa ditutup dengan Escape', async () => {
    const onTutup = vi.fn();
    const user = userEvent.setup();
    render(
      <MethodConfigDialog
        metode={metode('EDC')}
        busy={false}
        error={null}
        onUnggahQris={vi.fn()}
        onSimpan={vi.fn()}
        onTutup={onTutup}
      />,
    );

    await user.keyboard('{Escape}');
    expect(onTutup).toHaveBeenCalled();
  });
});
