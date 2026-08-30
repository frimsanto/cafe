import { describe, expect, it } from 'vitest';
import type { KondisiPin } from './pin';
import {
  KEBIJAKAN,
  cocokkanPin,
  hashPin,
  sedangTerkunci,
  setelahBerhasil,
  setelahGagal,
  sisaKunciDetik,
  validasiPin,
} from './pin';

describe('validasiPin', () => {
  it('menerima PIN 4-6 digit yang tidak berpola', () => {
    expect(validasiPin('4837').valid).toBe(true);
    expect(validasiPin('90218').valid).toBe(true);
    expect(validasiPin('529174').valid).toBe(true);
  });

  it('menolak panjang di luar 4-6 digit', () => {
    expect(validasiPin('123').valid).toBe(false);
    expect(validasiPin('1029384').valid).toBe(false);
    expect(validasiPin('').valid).toBe(false);
  });

  it('menolak PIN yang memuat selain angka', () => {
    expect(validasiPin('12a4').valid).toBe(false);
    expect(validasiPin('48 37').valid).toBe(false);
    expect(validasiPin('-483').valid).toBe(false);
  });

  // Bukan karena lebih lemah secara matematis, tapi karena inilah yang dicoba
  // penebak pada percobaan pertamanya — jauh sebelum penguncian bekerja.
  it('menolak pola yang paling sering dicoba', () => {
    expect(validasiPin('0000').valid).toBe(false);
    expect(validasiPin('1234').valid).toBe(false);
    expect(validasiPin('123456').valid).toBe(false);
    expect(validasiPin('654321').valid).toBe(false);
  });

  it('tidak pernah memuat PIN di dalam pesan galatnya', () => {
    const hasil = validasiPin('1234');
    expect(hasil.pesan).toBeDefined();
    expect(hasil.pesan).not.toContain('1234');
  });
});

describe('hash & cocokkan', () => {
  // Bagian P nomor 6: PIN tidak pernah tersimpan mentah.
  it('menghasilkan hash yang tidak memuat PIN aslinya', async () => {
    const hash = await hashPin('4837');
    expect(hash).not.toContain('4837');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('menghasilkan hash berbeda untuk PIN yang sama (salt acak)', async () => {
    const a = await hashPin('4837');
    const b = await hashPin('4837');
    expect(a).not.toBe(b);
    expect(await cocokkanPin('4837', a)).toBe(true);
    expect(await cocokkanPin('4837', b)).toBe(true);
  });

  it('menolak PIN yang salah', async () => {
    const hash = await hashPin('4837');
    expect(await cocokkanPin('4838', hash)).toBe(false);
    expect(await cocokkanPin('', hash)).toBe(false);
  });

  // Staf yang belum punya PIN ditolak seperti staf yang salah PIN — bukan
  // dengan galat yang membocorkan bahwa akun itu memang belum bisa dipakai.
  it('menolak (bukan melempar) saat hash kosong atau rusak', async () => {
    expect(await cocokkanPin('4837', null)).toBe(false);
    expect(await cocokkanPin('4837', '')).toBe(false);
    expect(await cocokkanPin('4837', 'bukan-hash-bcrypt')).toBe(false);
  });
});

describe('kebijakan penguncian', () => {
  const sekarang = new Date('2026-03-05T10:00:00Z');
  const bersih: KondisiPin = { pinGagal: 0, pinTerkunciSampai: null };

  it('menghitung percobaan gagal tanpa mengunci sebelum ambang', () => {
    let kondisi: KondisiPin = bersih;
    for (let i = 1; i < KEBIJAKAN.maksPercobaan; i += 1) {
      const hasil = setelahGagal(kondisi, sekarang);
      expect(hasil.pinTerkunciSampai).toBeNull();
      expect(hasil.sisaPercobaan).toBe(KEBIJAKAN.maksPercobaan - i);
      kondisi = { pinGagal: hasil.pinGagal, pinTerkunciSampai: hasil.pinTerkunciSampai };
    }
  });

  // Bagian P nomor 8.
  it('mengunci tepat pada percobaan gagal ke-5', () => {
    const hasil = setelahGagal(
      { pinGagal: KEBIJAKAN.maksPercobaan - 1, pinTerkunciSampai: null },
      sekarang,
    );
    expect(hasil.pinGagal).toBe(KEBIJAKAN.maksPercobaan);
    expect(hasil.pinTerkunciSampai).not.toBeNull();
    expect(hasil.sisaPercobaan).toBe(0);
    // Penguncian pertama: satu menit.
    expect(hasil.pinTerkunciSampai!.getTime() - sekarang.getTime()).toBe(60_000);
  });

  // Bertingkat, bukan tetap: kasir yang lupa cukup menunggu semenit, skrip
  // penebak segera menghadapi jeda satu jam.
  it('memperpanjang penguncian pada setiap kelipatan ambang berikutnya', () => {
    const menitKe = (gagalSebelumnya: number): number => {
      const h = setelahGagal({ pinGagal: gagalSebelumnya, pinTerkunciSampai: null }, sekarang);
      return (h.pinTerkunciSampai!.getTime() - sekarang.getTime()) / 60_000;
    };
    expect(menitKe(4)).toBe(1); // gagal ke-5
    expect(menitKe(9)).toBe(5); // gagal ke-10
    expect(menitKe(14)).toBe(15); // gagal ke-15
    expect(menitKe(19)).toBe(60); // gagal ke-20
    // Tidak tumbuh tanpa batas — bertahan di durasi terpanjang.
    expect(menitKe(24)).toBe(60);
    expect(menitKe(99)).toBe(60);
  });

  it('mengenali kondisi terkunci dan sisa waktunya', () => {
    const terkunci = {
      pinGagal: 5,
      pinTerkunciSampai: new Date(sekarang.getTime() + 90_000),
    };
    expect(sedangTerkunci(terkunci, sekarang)).toBe(true);
    expect(sisaKunciDetik(terkunci, sekarang)).toBe(90);
  });

  // Penguncian yang berakhir tepat detik ini sudah selesai — menahannya lagi
  // hanya membuat kasir menekan tombol dua kali.
  it('menganggap penguncian yang sudah lewat sebagai selesai', () => {
    const lewat = { pinGagal: 5, pinTerkunciSampai: new Date(sekarang.getTime() - 1) };
    expect(sedangTerkunci(lewat, sekarang)).toBe(false);
    expect(sisaKunciDetik(lewat, sekarang)).toBe(0);

    const persis = { pinGagal: 5, pinTerkunciSampai: new Date(sekarang.getTime()) };
    expect(sedangTerkunci(persis, sekarang)).toBe(false);
  });

  it('menganggap kondisi tanpa penguncian sebagai tidak terkunci', () => {
    expect(sedangTerkunci(bersih, sekarang)).toBe(false);
    expect(sisaKunciDetik(bersih, sekarang)).toBe(0);
  });

  // Kasir yang salah ketik empat kali lalu berhasil tidak boleh memulai besok
  // pagi dengan satu percobaan tersisa.
  it('membersihkan penghitung sepenuhnya setelah PIN benar', () => {
    const hasil = setelahBerhasil();
    expect(hasil.pinGagal).toBe(0);
    expect(hasil.pinTerkunciSampai).toBeNull();
    expect(hasil.sisaPercobaan).toBe(KEBIJAKAN.maksPercobaan);
  });
});
