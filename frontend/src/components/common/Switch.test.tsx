import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Switch from './Switch';

describe('Switch', () => {
  it('mengumumkan dirinya sebagai sakelar bernama', () => {
    render(<Switch checked={false} onChange={vi.fn()} label="Aktifkan Tunai" />);

    const sakelar = screen.getByRole('switch', { name: 'Aktifkan Tunai' });
    expect(sakelar).toBeInTheDocument();
    expect(sakelar).not.toBeChecked();
  });

  it('meneruskan keadaan baru saat diklik', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} onChange={onChange} label="Aktifkan Tunai" />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  // Dibangun di atas <input type="checkbox">, jadi papan ketik bekerja tanpa
  // penanganan tombol sendiri. Uji ini yang menjaga agar tidak ada yang
  // menggantinya dengan <div role="switch"> di kemudian hari.
  it('bisa dioperasikan dengan papan ketik', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} onChange={onChange} label="Aktifkan Tunai" />);

    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('tidak bereaksi saat dinonaktifkan', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} onChange={onChange} label="Aktifkan QRIS" disabled />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('menyembunyikan label secara visual bila diminta, tapi tetap dibacakan', () => {
    const { rerender } = render(
      <Switch checked onChange={vi.fn()} label="Aktifkan EDC" />,
    );
    expect(screen.getByText('Aktifkan EDC')).toHaveClass('sr-only');

    rerender(<Switch checked onChange={vi.fn()} label="Aktifkan EDC" showLabel />);
    expect(screen.getByText('Aktifkan EDC')).not.toHaveClass('sr-only');
  });
});
