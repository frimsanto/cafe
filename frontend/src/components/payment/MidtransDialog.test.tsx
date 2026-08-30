import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PengaturanPembayaranDTO } from '../../types/api';
import MidtransDialog from './MidtransDialog';

/**
 * Baris kredensial untuk uji.
 *
 * `serverKeyTersimpan` dan `statusKredensial` sengaja diturunkan bersama:
 * keduanya menjawab pertanyaan yang sama ("kunci ini bisa dipakai?"), dan
 * membiarkannya bisa berselisih di fixture berarti menguji keadaan yang tidak
 * pernah bisa dikirim server.
 */
function kredensial(mode: 'SANDBOX' | 'PRODUCTION', ubah: Record<string, unknown> = {}) {
  const tersimpan = 'serverKeyTersimpan' in ubah ? Boolean(ubah.serverKeyTersimpan) : false;
  return {
    mode,
    clientKey: null,
    serverKeyTersimpan: false,
    serverKeyPetunjuk: null,
    statusKredensial: tersimpan ? 'TERSIMPAN' : 'BELUM_DIKONFIGURASI',
    perluDimasukkanUlang: false,
    masalahKonfigurasiServer: false,
    statusKoneksi: 'BELUM_DIUJI',
    koneksiDiperiksa: null,
    koneksiPesan: null,
    statusWebhook: 'BELUM_DIPERIKSA',
    webhookDiperiksa: null,
    lengkap: false,
    ...ubah,
  };
}

function pengaturan(midtrans: Record<string, unknown> = {}): PengaturanPembayaranDTO {
  return {
    cafeId: 'kafe-a',
    metode: [],
    midtrans: {
      modeAktif: 'SANDBOX',
      kredensial: [kredensial('SANDBOX'), kredensial('PRODUCTION')],
      statusIntegrasi: 'BELUM_DIKONFIGURASI',
      bisaTransaksi: false,
      penghalangProduction: ['Server Key Production belum diisi'],
      webhookUrl: 'https://cafe.contoh.test/api/pembayaran/notifikasi/kafe-a',
      ...midtrans,
    },
    jumlahMetodeAktif: 1,
  } as PengaturanPembayaranDTO;
}

const noop = {
  onSimpanKredensial: vi.fn(),
  onTesKoneksi: vi.fn(),
  onPeriksaWebhook: vi.fn(),
  onGantiMode: vi.fn(),
  onPutuskan: vi.fn(),
  onTutup: vi.fn(),
};

function pasang(data = pengaturan(), props: Partial<typeof noop> = {}) {
  return render(
    <MidtransDialog
      pengaturan={data}
      busy={false}
      error={null}
      info={null}
      {...noop}
      {...props}
    />,
  );
}

describe('MidtransDialog — kerahasiaan Server Key', () => {
  // Kolomnya selalu kosong saat dialog dibuka; mengisinya = mengganti.
  it('tidak pernah mengisi kolom Server Key dengan nilai tersimpan', () => {
    pasang(
      pengaturan({
        kredensial: [
          kredensial('SANDBOX', { serverKeyTersimpan: true, serverKeyPetunjuk: 'a1b2' }),
          kredensial('PRODUCTION'),
        ],
      }),
    );

    const kolom = screen.getByLabelText(/Server Key/i);
    expect(kolom).toHaveValue('');
    expect(kolom).toHaveAttribute('type', 'password');
  });

  it('menampilkan petunjuk 4 karakter, bukan kuncinya', () => {
    pasang(
      pengaturan({
        kredensial: [
          kredensial('SANDBOX', { serverKeyTersimpan: true, serverKeyPetunjuk: 'a1b2' }),
          kredensial('PRODUCTION'),
        ],
      }),
    );

    expect(screen.getByText(/····a1b2/)).toBeInTheDocument();
  });
});

describe('MidtransDialog — pemisahan mode', () => {
  it('membuka tab mode yang sedang aktif', () => {
    pasang(pengaturan({ modeAktif: 'PRODUCTION' }));
    expect(screen.getByRole('tab', { name: /Production/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  // Kunci yang telanjur diketik untuk Sandbox tidak boleh terbawa ke slot
  // Production — itu persis kekeliruan yang paling mahal di layar ini.
  it('mengosongkan kolom saat berpindah tab', async () => {
    const user = userEvent.setup();
    pasang();

    await user.type(screen.getByLabelText(/Server Key/i), 'SB-Mid-server-abc');
    expect(screen.getByLabelText(/Server Key/i)).toHaveValue('SB-Mid-server-abc');

    await user.click(screen.getByRole('tab', { name: /Production/i }));
    expect(screen.getByLabelText(/Server Key/i)).toHaveValue('');
  });

  it('menandai mode mana yang sedang aktif', () => {
    pasang();
    const tabSandbox = screen.getByRole('tab', { name: /Sandbox/i });
    expect(tabSandbox).toHaveTextContent('AKTIF');
  });
});

describe('MidtransDialog — mengaktifkan Production', () => {
  const siapProduction = pengaturan({
    penghalangProduction: [],
    kredensial: [
      kredensial('SANDBOX', { serverKeyTersimpan: true }),
      kredensial('PRODUCTION', {
        serverKeyTersimpan: true,
        clientKey: 'Mid-client-abc',
        statusKoneksi: 'BERHASIL',
        lengkap: true,
      }),
    ],
  });

  it('menyebutkan syarat yang belum terpenuhi, bukan sekadar mematikan tombol', () => {
    pasang();
    expect(screen.getByText(/Belum bisa mengaktifkan pembayaran Production/i)).toBeInTheDocument();
    expect(screen.getByText('Server Key Production belum diisi')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Aktifkan Pembayaran Production/i }),
    ).not.toBeInTheDocument();
  });

  // Uang sungguhan tidak boleh berpindah karena satu klik yang tidak sengaja.
  it('MENUNTUT konfirmasi sebelum mengganti mode', async () => {
    const onGantiMode = vi.fn();
    const user = userEvent.setup();
    pasang(siapProduction, { onGantiMode });

    await user.click(screen.getByRole('button', { name: /Aktifkan Pembayaran Production/i }));

    expect(onGantiMode).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Aktifkan pembayaran dengan uang sungguhan\?/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/memotong saldo rekening atau kartu mereka betulan/i))
      .toBeInTheDocument();
  });

  it('mengganti mode hanya setelah konfirmasi ditekan', async () => {
    const onGantiMode = vi.fn();
    const user = userEvent.setup();
    pasang(siapProduction, { onGantiMode });

    await user.click(screen.getByRole('button', { name: /Aktifkan Pembayaran Production/i }));
    await user.click(screen.getByRole('button', { name: /Ya, aktifkan Production/i }));

    expect(onGantiMode).toHaveBeenCalledWith('PRODUCTION');
  });

  it('membatalkan konfirmasi tidak mengubah apa pun', async () => {
    const onGantiMode = vi.fn();
    const user = userEvent.setup();
    pasang(siapProduction, { onGantiMode });

    await user.click(screen.getByRole('button', { name: /Aktifkan Pembayaran Production/i }));
    await user.click(screen.getByRole('button', { name: 'Batal' }));

    expect(onGantiMode).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Aktifkan pembayaran dengan uang sungguhan\?/i),
    ).not.toBeInTheDocument();
  });
});

describe('MidtransDialog — pemeriksaan', () => {
  it('mengunci Tes Koneksi sampai ada Server Key', () => {
    pasang();
    expect(screen.getByRole('button', { name: /Tes Koneksi/i })).toBeDisabled();
  });

  it('membuka Tes Koneksi begitu kredensial tersimpan', async () => {
    const onTesKoneksi = vi.fn();
    const user = userEvent.setup();
    pasang(
      pengaturan({
        kredensial: [kredensial('SANDBOX', { serverKeyTersimpan: true }), kredensial('PRODUCTION')],
      }),
      { onTesKoneksi },
    );

    await user.click(screen.getByRole('button', { name: /Tes Koneksi/i }));
    expect(onTesKoneksi).toHaveBeenCalledWith('SANDBOX');
  });

  it('menyediakan URL notifikasi lengkap dengan tombol salin', () => {
    pasang();
    expect(screen.getByLabelText(/URL Notifikasi/i)).toHaveValue(
      'https://cafe.contoh.test/api/pembayaran/notifikasi/kafe-a',
    );
    expect(screen.getByRole('button', { name: /Salin/i })).toBeInTheDocument();
  });
});

describe('MidtransDialog — memutus integrasi', () => {
  it('tidak menawarkan pemutusan bila belum ada kredensial', () => {
    pasang();
    expect(screen.queryByRole('button', { name: /Putuskan Integrasi/i })).not.toBeInTheDocument();
  });

  it('menuntut konfirmasi sebelum memutus', async () => {
    const onPutuskan = vi.fn();
    const user = userEvent.setup();
    pasang(
      pengaturan({
        kredensial: [kredensial('SANDBOX', { serverKeyTersimpan: true }), kredensial('PRODUCTION')],
      }),
      { onPutuskan },
    );

    await user.click(screen.getByRole('button', { name: /Putuskan Integrasi Sandbox/i }));
    expect(onPutuskan).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Ya, putuskan/i }));
    expect(onPutuskan).toHaveBeenCalledWith('SANDBOX');
  });
});

describe('MidtransDialog — status kredensial tidak boleh saling bertentangan', () => {
  // Gejala yang dilaporkan dari server produksi: badge hijau "Kredensial
  // tersimpan" terpampang tepat di sebelah kalimat "Kredensial tersimpan tidak
  // bisa dibaca. Masukkan ulang Server Key." Dua pernyataan itu tidak bisa
  // benar bersamaan, dan pemilik kafe tidak punya cara menebak mana yang benar.
  it('TIDAK menampilkan "Kredensial tersimpan" saat kunci perlu diisi ulang', () => {
    pasang(
      pengaturan({
        kredensial: [
          kredensial('SANDBOX', {
            serverKeyTersimpan: false,
            statusKredensial: 'PERLU_DIMASUKKAN_ULANG',
            perluDimasukkanUlang: true,
          }),
          kredensial('PRODUCTION'),
        ],
      }),
    );

    expect(screen.queryByText('Kredensial tersimpan')).not.toBeInTheDocument();
    expect(screen.getByText('Kredensial perlu dimasukkan ulang')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/tidak bisa dibaca lagi/i);
  });

  it('menyembunyikan hasil tes lama untuk kunci yang sudah tak terbaca', () => {
    pasang(
      pengaturan({
        kredensial: [
          kredensial('SANDBOX', {
            serverKeyTersimpan: false,
            statusKredensial: 'PERLU_DIMASUKKAN_ULANG',
            perluDimasukkanUlang: true,
            statusKoneksi: 'BERHASIL',
            koneksiPesan: 'Kredensial diterima Midtrans.',
          }),
          kredensial('PRODUCTION'),
        ],
      }),
    );

    // Yang diuji waktu itu adalah kunci yang sekarang tidak bisa dibuka.
    expect(screen.queryByText('Kredensial diterima Midtrans.')).not.toBeInTheDocument();
    expect(screen.queryByText('Koneksi berhasil')).not.toBeInTheDocument();
    expect(screen.getByText('Belum diuji')).toBeInTheDocument();
  });

  it('menyalahkan SERVER, bukan pemilik, saat ENCRYPTION_KEY hilang', () => {
    pasang(
      pengaturan({
        kredensial: [
          kredensial('SANDBOX', {
            serverKeyTersimpan: false,
            statusKredensial: 'KONFIGURASI_SERVER',
            masalahKonfigurasiServer: true,
          }),
          kredensial('PRODUCTION'),
        ],
      }),
    );

    expect(screen.queryByText('Kredensial tersimpan')).not.toBeInTheDocument();
    expect(screen.getByText('Server belum siap membaca kredensial')).toBeInTheDocument();
    // Mengetik ulang kunci tidak akan menolong — jangan menyuruhnya.
    expect(screen.getByRole('alert')).toHaveTextContent(/jangan masukkan ulang server key/i);
  });

  it('menampilkan keempat keadaan dengan kalimat yang berbeda', () => {
    const kasus = [
      ['BELUM_DIKONFIGURASI', 'Belum dikonfigurasi', {}],
      ['TERSIMPAN', 'Kredensial tersimpan', { serverKeyTersimpan: true }],
      [
        'PERLU_DIMASUKKAN_ULANG',
        'Kredensial perlu dimasukkan ulang',
        { perluDimasukkanUlang: true },
      ],
      [
        'KONFIGURASI_SERVER',
        'Server belum siap membaca kredensial',
        { masalahKonfigurasiServer: true },
      ],
    ] as const;

    for (const [status, teks, ekstra] of kasus) {
      const { unmount } = pasang(
        pengaturan({
          kredensial: [
            kredensial('SANDBOX', { statusKredensial: status, ...ekstra }),
            kredensial('PRODUCTION'),
          ],
        }),
      );
      // getAllByText: "Belum dikonfigurasi" wajar muncul dua kali (badge
      // kredensial DAN badge koneksi) ketika memang belum ada apa-apa.
      expect(screen.getAllByText(teks).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('tidak menawarkan Tes Koneksi untuk kunci yang tak terbaca', () => {
    pasang(
      pengaturan({
        kredensial: [
          kredensial('SANDBOX', {
            statusKredensial: 'PERLU_DIMASUKKAN_ULANG',
            perluDimasukkanUlang: true,
          }),
          kredensial('PRODUCTION'),
        ],
      }),
    );

    expect(screen.getByRole('button', { name: /Tes Koneksi/i })).toBeDisabled();
  });

  // Awalan SB- bukan lagi aturan: petunjuk di layar tidak boleh menyiratkan
  // sebaliknya, karena itulah yang membuat tenant mengira kuncinya salah.
  it('tidak menuntut awalan SB- pada placeholder tab Sandbox', () => {
    pasang();
    expect(screen.getByLabelText(/Client Key/i)).toHaveAttribute(
      'placeholder',
      'Mid-client-xxxxxxxx',
    );
    expect(screen.getByLabelText(/Server Key/i)).toHaveAttribute(
      'placeholder',
      'Mid-server-xxxxxxxx',
    );
  });
});
