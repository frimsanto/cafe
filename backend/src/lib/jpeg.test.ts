import { describe, expect, it } from 'vitest';
import { adalahJpeg, bersihkanJpeg, tebakFormat } from './jpeg';

/**
 * Perkakas menyusun JPEG buatan.
 *
 * Ujinya memakai berkas yang dirakit sendiri, bukan gambar sungguhan yang
 * disimpan sebagai fixture: dengan begitu setiap byte di dalamnya diketahui,
 * dan uji "EXIF-nya benar-benar hilang" bisa memeriksa isinya alih-alih
 * mempercayai bahwa fixture-nya memang mengandung EXIF.
 */
function segmen(penanda: number, isi: Buffer): Buffer {
  const panjang = Buffer.alloc(2);
  panjang.writeUInt16BE(isi.length + 2);
  return Buffer.concat([Buffer.from([0xff, penanda]), panjang, isi]);
}

/** SOF0 dengan dimensi tertentu. */
function sof0(lebar: number, tinggi: number): Buffer {
  const isi = Buffer.alloc(15);
  isi.writeUInt8(8, 0); // presisi
  isi.writeUInt16BE(tinggi, 1);
  isi.writeUInt16BE(lebar, 3);
  isi.writeUInt8(3, 5); // jumlah komponen
  return segmen(0xc0, isi);
}

const EXIF = segmen(
  0xe1,
  Buffer.concat([
    Buffer.from('Exif\0\0', 'ascii'),
    // Isi EXIF palsu yang bisa dicari kembali sesudah pembersihan.
    Buffer.from('GPSLatitude=-6.2088;GPSLongitude=106.8456', 'ascii'),
  ]),
);

const JFIF = segmen(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'ascii'));
const KOMENTAR = segmen(0xfe, Buffer.from('dibuat oleh kamera anu', 'ascii'));
const SOS = segmen(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
const DATA_GAMBAR = Buffer.from([0x12, 0x34, 0x56, 0x78]);
const EOI = Buffer.from([0xff, 0xd9]);
const SOI = Buffer.from([0xff, 0xd8]);

function jpegLengkap(lebar = 640, tinggi = 480): Buffer {
  return Buffer.concat([
    SOI,
    JFIF,
    EXIF,
    KOMENTAR,
    sof0(lebar, tinggi),
    SOS,
    DATA_GAMBAR,
    EOI,
  ]);
}

describe('pengenalan format', () => {
  it('mengenali JPEG dari byte awalnya', () => {
    expect(adalahJpeg(jpegLengkap())).toBe(true);
    expect(tebakFormat(jpegLengkap())).toBe('jpeg');
  });

  // Yang menentukan adalah ISI berkasnya, bukan Content-Type kiriman klien.
  it('mengenali PNG dan WEBP supaya pesannya bisa tepat', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    expect(tebakFormat(png)).toBe('png');
    expect(adalahJpeg(png)).toBe(false);

    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.alloc(4),
      Buffer.from('WEBP', 'ascii'),
      Buffer.alloc(8),
    ]);
    expect(tebakFormat(webp)).toBe('webp');
  });

  it('menolak berkas yang bukan gambar sama sekali', () => {
    const skrip = Buffer.from('<?php system($_GET["c"]); ?>', 'ascii');
    expect(adalahJpeg(skrip)).toBe(false);
    expect(tebakFormat(skrip)).toBe('lainnya');
  });

  // Ekstensi ganda tidak menolong siapa pun bila isinya diperiksa.
  it('tidak tertipu berkas bernama .jpg yang isinya bukan JPEG', () => {
    const palsu = Buffer.from('GIF89a------------', 'ascii');
    expect(adalahJpeg(palsu)).toBe(false);
  });
});

describe('pembersihan metadata', () => {
  it('membuang EXIF, JFIF, dan komentar', () => {
    const asli = jpegLengkap();
    // Prasyarat: berkas ujinya memang mengandung koordinat GPS.
    expect(asli.includes(Buffer.from('GPSLatitude', 'ascii'))).toBe(true);

    const hasil = bersihkanJpeg(asli);

    expect(hasil.segmenDibuang).toBe(3); // JFIF + EXIF + komentar
    expect(hasil.buffer.includes(Buffer.from('GPSLatitude', 'ascii'))).toBe(false);
    expect(hasil.buffer.includes(Buffer.from('Exif', 'ascii'))).toBe(false);
    expect(hasil.buffer.includes(Buffer.from('dibuat oleh kamera', 'ascii'))).toBe(false);
  });

  it('tetap menghasilkan JPEG yang sah', () => {
    const hasil = bersihkanJpeg(jpegLengkap());
    expect(adalahJpeg(hasil.buffer)).toBe(true);
    // Data gambarnya utuh — yang dibuang hanya metadata.
    expect(hasil.buffer.includes(DATA_GAMBAR)).toBe(true);
    expect(hasil.buffer.subarray(-2)).toEqual(EOI);
  });

  it('membaca dimensi dari SOF untuk pemeriksaan ukuran', () => {
    const hasil = bersihkanJpeg(jpegLengkap(1280, 720));
    expect(hasil.lebar).toBe(1280);
    expect(hasil.tinggi).toBe(720);
  });

  it('tidak mengubah apa pun pada JPEG yang memang tanpa metadata', () => {
    const bersih = Buffer.concat([SOI, sof0(100, 100), SOS, DATA_GAMBAR, EOI]);
    const hasil = bersihkanJpeg(bersih);
    expect(hasil.segmenDibuang).toBe(0);
    expect(hasil.buffer).toEqual(bersih);
  });

  /**
   * Berkas yang mengaku JPEG tetapi tidak bisa ditelusuri segmennya adalah
   * berkas yang tidak kita pahami — dan menyimpan sesuatu yang tidak dipahami
   * lalu menyajikannya kembali ke peramban pemilik adalah cara yang bagus untuk
   * menemukan kerentanan orang lain dengan cara yang sulit.
   */
  it('menolak berkas yang strukturnya rusak', () => {
    expect(() => bersihkanJpeg(Buffer.from([0xff, 0xd8, 0x00, 0x01]))).toThrow(
      /rusak/i,
    );

    // Panjang segmen yang melampaui akhir berkas.
    const panjangBohong = Buffer.concat([
      SOI,
      Buffer.from([0xff, 0xe1, 0xff, 0xfe]),
      Buffer.from([0x00, 0x01]),
    ]);
    expect(() => bersihkanJpeg(panjangBohong)).toThrow(/rusak/i);
  });

  it('menolak berkas yang bukan JPEG', () => {
    expect(() => bersihkanJpeg(Buffer.from('bukan gambar', 'ascii'))).toThrow(
      /bukan JPEG/i,
    );
  });

  // Data entropi sesudah SOS bisa memuat byte apa pun, termasuk yang menyerupai
  // penanda segmen — ia disalin apa adanya, bukan ditelusuri.
  it('menyalin data setelah SOS apa adanya', () => {
    const entropiAneh = Buffer.from([0xff, 0x00, 0x12, 0xff, 0x00, 0x34]);
    const jpeg = Buffer.concat([SOI, EXIF, sof0(10, 10), SOS, entropiAneh, EOI]);
    const hasil = bersihkanJpeg(jpeg);
    expect(hasil.buffer.includes(entropiAneh)).toBe(true);
    expect(hasil.segmenDibuang).toBe(1);
  });
});
