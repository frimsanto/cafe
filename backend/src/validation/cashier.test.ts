import { describe, expect, it } from 'vitest';
import {
  parseBatalPesananInput,
  parseBuatPesananKasirInput,
  parseFilterPesananKasir,
} from './cashier.validation';

const MENU_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const MEJA_ID = '11111111-2222-4333-8444-555555555555';

const body = {
  fulfillmentType: 'DINE_IN',
  tableId: MEJA_ID,
  items: [{ menuItemId: MENU_ID, quantity: 1, notes: '' }],
  pembayaran: { metode: 'TUNAI', nominal: 50000 },
  idempotencyKey: 'kasir-keranjang-0001',
};

describe('body pesanan kasir', () => {
  it('menerima pesanan makan di tempat yang lengkap', () => {
    const hasil = parseBuatPesananKasirInput(body);
    expect(hasil.tableId).toBe(MEJA_ID);
    expect(hasil.pembayaran.metode).toBe('TUNAI');
  });

  it('menolak pesanan makan di tempat tanpa meja', () => {
    expect(() => parseBuatPesananKasirInput({ ...body, tableId: null })).toThrow(
      /wajib memilih meja/i,
    );
  });

  it('membuang meja yang tertinggal pada pesanan bawa pulang', () => {
    // Layar kasir yang berpindah dari "makan di tempat" ke "bawa pulang" tidak
    // boleh gagal hanya karena pilihan lamanya masih ada di state.
    const hasil = parseBuatPesananKasirInput({
      ...body,
      fulfillmentType: 'TAKEAWAY',
    });
    expect(hasil.tableId).toBeNull();
  });

  it('mewajibkan kunci anti-kirim-ganda', () => {
    expect(() =>
      parseBuatPesananKasirInput({ ...body, idempotencyKey: undefined }),
    ).toThrow(/idempotencyKey/);
    expect(() => parseBuatPesananKasirInput({ ...body, idempotencyKey: 'abc' })).toThrow(
      /minimal 8/,
    );
  });

  it('tidak pernah membaca harga atau total dari klien', () => {
    const hasil = parseBuatPesananKasirInput({
      ...body,
      totalAmount: 1,
      items: [{ menuItemId: MENU_ID, quantity: 1, notes: '', price: 1 }],
    });
    // Yang lolos hanya id menu, jumlah, dan catatan.
    expect(Object.keys(hasil.items[0]).sort()).toEqual([
      'menuItemId',
      'notes',
      'quantity',
    ]);
    expect(hasil).not.toHaveProperty('totalAmount');
  });

  it('menolak metode pembayaran yang tidak dikenal', () => {
    expect(() =>
      parseBuatPesananKasirInput({
        ...body,
        pembayaran: { metode: 'BITCOIN', nominal: 1000 },
      }),
    ).toThrow(/metode/i);
  });

  it('menolak nominal nol, negatif, atau berdesimal ganjil', () => {
    for (const nominal of [0, -1, 1000.005]) {
      expect(() =>
        parseBuatPesananKasirInput({ ...body, pembayaran: { metode: 'TUNAI', nominal } }),
      ).toThrow();
    }
  });

  it('menolak keranjang kosong', () => {
    expect(() => parseBuatPesananKasirInput({ ...body, items: [] })).toThrow(
      /minimal satu item/i,
    );
  });
});

describe('body pembatalan', () => {
  it('mewajibkan alasan minimal 3 karakter', () => {
    expect(() => parseBatalPesananInput({})).toThrow(/wajib/i);
    expect(() => parseBatalPesananInput({ alasan: 'ok' })).toThrow(/minimal 3/i);
    expect(parseBatalPesananInput({ alasan: '  tamu batal  ' })).toEqual({
      alasan: 'tamu batal',
    });
  });
});

describe('penyaring daftar pesanan', () => {
  it('jatuh ke tab "Perlu Konfirmasi" bila tidak disebutkan', () => {
    expect(parseFilterPesananKasir({}).tab).toBe('PERLU_KONFIRMASI');
  });

  it('menolak nama tab yang tidak dikenal', () => {
    expect(() => parseFilterPesananKasir({ tab: 'ARSIP' })).toThrow(/tab/i);
  });

  it('membatasi jumlah baris yang boleh diminta sekaligus', () => {
    expect(parseFilterPesananKasir({ limit: '5000' }).limit).toBe(200);
    expect(() => parseFilterPesananKasir({ limit: 'banyak' })).toThrow();
  });

  it('menolak filter jenis/sumber yang tidak dikenal', () => {
    expect(() => parseFilterPesananKasir({ fulfillmentType: 'DELIVERY' })).toThrow();
    expect(() => parseFilterPesananKasir({ orderSource: 'WHATSAPP' })).toThrow();
  });
});
