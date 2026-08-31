import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan, type PrismaMock } from '../test/prismaMock';

const prisma: PrismaMock = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

// Direktori sementara dipasang SEBELUM modulnya dimuat: `direktoriFoto()`
// menghitung sekali lalu mengingatnya.
const SEMENTARA = mkdtempSync(path.join(tmpdir(), 'cafeos-foto-'));
process.env.ATTENDANCE_PHOTO_DIR = path.join(SEMENTARA, 'absensi');

const { fotoAbsensiService } = await import('./fotoAbsensi.service');

const CAFE = 'cafe-a';
const CAFE_LAIN = 'cafe-b';

/** JPEG minimal yang sah, lengkap dengan segmen EXIF untuk dibuang. */
function jpegDenganExif(): Buffer {
  const segmen = (penanda: number, isi: Buffer): Buffer => {
    const panjang = Buffer.alloc(2);
    panjang.writeUInt16BE(isi.length + 2);
    return Buffer.concat([Buffer.from([0xff, penanda]), panjang, isi]);
  };
  const sof = Buffer.alloc(15);
  sof.writeUInt8(8, 0);
  sof.writeUInt16BE(480, 1);
  sof.writeUInt16BE(640, 3);
  sof.writeUInt8(3, 5);

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segmen(0xe1, Buffer.from('Exif\0\0GPSLatitude=-6.2088', 'ascii')),
    segmen(0xc0, sof),
    segmen(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x11, 0x22, 0x33]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

beforeAll(() => {
  isiBawaan(prisma);
});

afterAll(() => {
  rmSync(SEMENTARA, { recursive: true, force: true });
});

beforeEach(() => {
  isiBawaan(prisma);
});

describe('penyimpanan foto', () => {
  it('menulis berkas ke direktori per kafe, di luar jangkauan web', async () => {
    const hasil = await fotoAbsensiService.simpan(CAFE, jpegDenganExif(), null);

    const jalur = path.join(SEMENTARA, 'absensi', CAFE, hasil.namaBerkas);
    expect(existsSync(jalur)).toBe(true);
    expect(statSync(jalur).isFile()).toBe(true);
    expect(hasil.mimeType).toBe('image/jpeg');
  });

  // Nama asli dari klien tidak pernah dipakai: tidak ada ekstensi ganda
  // (`.jpg.php`), tidak ada `..`, tidak ada teks klien yang ikut dirangkai.
  it('memberi nama acak, bukan nama kiriman klien', async () => {
    const a = await fotoAbsensiService.simpan(CAFE, jpegDenganExif(), null);
    const b = await fotoAbsensiService.simpan(CAFE, jpegDenganExif(), null);

    expect(a.namaBerkas).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(b.namaBerkas).not.toBe(a.namaBerkas);
  });

  // Yang ditulis ke disk adalah byte yang SUDAH dibersihkan — tidak ada momen
  // ketika berkas mentah dari klien tersimpan.
  it('menyimpan versi yang sudah dibuang EXIF-nya', async () => {
    const asli = jpegDenganExif();
    expect(asli.includes(Buffer.from('GPSLatitude', 'ascii'))).toBe(true);

    const hasil = await fotoAbsensiService.simpan(CAFE, asli, null);
    const isi = require('node:fs').readFileSync(
      path.join(SEMENTARA, 'absensi', CAFE, hasil.namaBerkas),
    ) as Buffer;

    expect(isi.includes(Buffer.from('GPSLatitude', 'ascii'))).toBe(false);
    expect(isi.length).toBeLessThan(asli.length);
  });

  it('memisahkan berkas tiap kafe ke foldernya sendiri', async () => {
    await fotoAbsensiService.simpan(CAFE_LAIN, jpegDenganExif(), null);
    const folder = readdirSync(path.join(SEMENTARA, 'absensi'));
    expect(folder).toEqual(expect.arrayContaining([CAFE, CAFE_LAIN]));
  });

  it('menolak berkas yang bukan JPEG', async () => {
    await expect(
      fotoAbsensiService.simpan(CAFE, Buffer.from('<?php ?>', 'ascii'), null),
    ).rejects.toThrow(/bukan foto/i);

    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(32),
    ]);
    await expect(fotoAbsensiService.simpan(CAFE, png, null)).rejects.toThrow(/PNG/i);
  });

  it('menolak berkas kosong', async () => {
    await expect(
      fotoAbsensiService.simpan(CAFE, Buffer.alloc(0), null),
    ).rejects.toThrow(/kosong/i);
  });

  // Kehadirannya nyata; yang perlu diketahui pemilik adalah buktinya datang
  // belakangan — jadi ditandai, bukan ditolak.
  it('menandai foto yang waktu tangkapnya jauh lebih tua', async () => {
    const sekarang = new Date('2026-03-05T10:00:00Z');
    const lama = new Date('2026-03-05T09:00:00Z');

    const telat = await fotoAbsensiService.simpan(CAFE, jpegDenganExif(), lama, sekarang);
    expect(telat.terlambatDiunggah).toBe(true);

    const segar = await fotoAbsensiService.simpan(
      CAFE,
      jpegDenganExif(),
      new Date('2026-03-05T09:59:00Z'),
      sekarang,
    );
    expect(segar.terlambatDiunggah).toBe(false);
  });
});

describe('membaca foto', () => {
  it('menolak foto milik kafe lain', async () => {
    // Query disaring `cafeId`, jadi baris milik kafe lain tidak ditemukan.
    prisma.attendancePhoto.findFirst.mockResolvedValue(null);

    await expect(fotoAbsensiService.baca(CAFE_LAIN, 'foto-1')).rejects.toThrow(
      /tidak ditemukan/i,
    );
    expect(prisma.attendancePhoto.findFirst).toHaveBeenCalledWith({
      where: { id: 'foto-1', cafeId: CAFE_LAIN },
    });
  });

  it('menolak foto yang sudah lewat masa simpan', async () => {
    prisma.attendancePhoto.findFirst.mockResolvedValue({
      id: 'foto-1',
      namaBerkas: 'apa.jpg',
      mimeType: 'image/jpeg',
      dihapusPada: new Date(),
    });

    await expect(fotoAbsensiService.baca(CAFE, 'foto-1')).rejects.toThrow(
      /sudah dihapus/i,
    );
  });

  // Baris ada tapi berkasnya tidak (dipindahkan di luar aplikasi) — 404 apa
  // adanya, bukan 500: yang salah bukan permintaannya.
  it('menjawab 404 bila berkasnya tidak ada lagi di disk', async () => {
    prisma.attendancePhoto.findFirst.mockResolvedValue({
      id: 'foto-1',
      namaBerkas: 'tidak-pernah-ada.jpg',
      mimeType: 'image/jpeg',
      dihapusPada: null,
    });

    await expect(fotoAbsensiService.baca(CAFE, 'foto-1')).rejects.toThrow(
      /tidak ada lagi/i,
    );
  });

  it('mengembalikan byte berkas yang benar', async () => {
    const disimpan = await fotoAbsensiService.simpan(CAFE, jpegDenganExif(), null);
    prisma.attendancePhoto.findFirst.mockResolvedValue({
      id: 'foto-1',
      namaBerkas: disimpan.namaBerkas,
      mimeType: 'image/jpeg',
      dihapusPada: null,
    });

    const { buffer, mimeType } = await fotoAbsensiService.baca(CAFE, 'foto-1');
    expect(mimeType).toBe('image/jpeg');
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });
});

describe('retensi', () => {
  /**
   * Yang dihapus adalah BERKASNYA, bukan catatan kehadirannya.
   *
   * Baris yang lenyap tidak bisa dibedakan dari absensi yang memang tidak
   * pernah berfoto — dan "Budi hadir tanggal 5" adalah fakta yang harus
   * bertahan jauh lebih lama daripada gambarnya.
   */
  it('menghapus berkas tetapi hanya MENANDAI barisnya', async () => {
    const disimpan = await fotoAbsensiService.simpan(CAFE, jpegDenganExif(), null);
    const jalur = path.join(SEMENTARA, 'absensi', CAFE, disimpan.namaBerkas);
    expect(existsSync(jalur)).toBe(true);

    prisma.cafe.findUnique.mockResolvedValue({ retensiFotoHari: 90 });
    prisma.attendancePhoto.findMany.mockResolvedValue([
      { id: 'foto-lama', namaBerkas: disimpan.namaBerkas },
    ]);

    const jumlah = await fotoAbsensiService.jalankanRetensi(CAFE);

    expect(jumlah).toBe(1);
    expect(existsSync(jalur)).toBe(false);

    // Barisnya DIPERBARUI, tidak dihapus.
    expect(prisma.attendancePhoto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'foto-lama' },
        data: expect.objectContaining({ dihapusPada: expect.any(Date) }),
      }),
    );
    expect(prisma.attendancePhoto.delete).not.toHaveBeenCalled();
    expect(prisma.attendancePhoto.deleteMany).not.toHaveBeenCalled();

    // Dan catatan absensinya sama sekali tidak disentuh.
    expect(prisma.attendanceRecord.delete).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.deleteMany).not.toHaveBeenCalled();
    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it('menyaring hanya foto milik kafe yang diminta, yang belum ditandai', async () => {
    prisma.cafe.findUnique.mockResolvedValue({ retensiFotoHari: 30 });
    prisma.attendancePhoto.findMany.mockResolvedValue([]);

    await fotoAbsensiService.jalankanRetensi(CAFE);

    const where = prisma.attendancePhoto.findMany.mock.calls[0][0].where;
    expect(where.cafeId).toBe(CAFE);
    expect(where.dihapusPada).toBeNull();
    expect(where.diterimaPada.lt).toBeInstanceOf(Date);
  });

  // Berkas yang sudah hilang tetap ditandai, supaya percobaan berikutnya tidak
  // mengulanginya selamanya.
  it('tetap menandai baris meski berkasnya sudah tidak ada', async () => {
    prisma.cafe.findUnique.mockResolvedValue({ retensiFotoHari: 90 });
    prisma.attendancePhoto.findMany.mockResolvedValue([
      { id: 'foto-hantu', namaBerkas: 'sudah-hilang.jpg' },
    ]);

    const jumlah = await fotoAbsensiService.jalankanRetensi(CAFE);

    expect(jumlah).toBe(1);
    expect(prisma.attendancePhoto.update).toHaveBeenCalled();
  });

  it('memakai masa simpan bawaan 90 hari bila kafe tidak menyetelnya', async () => {
    prisma.cafe.findUnique.mockResolvedValue(null);
    prisma.attendancePhoto.findMany.mockResolvedValue([]);

    const sekarang = new Date('2026-06-01T00:00:00Z');
    await fotoAbsensiService.jalankanRetensi(CAFE, sekarang);

    const batas = prisma.attendancePhoto.findMany.mock.calls[0][0].where.diterimaPada.lt;
    const selisihHari = (sekarang.getTime() - batas.getTime()) / 86_400_000;
    expect(selisihHari).toBe(90);
  });
});
