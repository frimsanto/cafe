/**
 * Pemeriksaan & pembersihan JPEG — tanpa dependensi pengolah gambar.
 *
 * ── Kenapa tidak memakai pustaka ──
 *
 * Yang dibutuhkan modul absensi hanya dua hal: memastikan byte yang masuk
 * benar-benar JPEG, dan membuang metadata dari dalamnya. Keduanya bisa
 * dikerjakan dengan membaca struktur segmen JPEG, yang sederhana dan stabil
 * sejak 1992. Memasang `sharp` untuk ini berarti menambahkan dependensi biner
 * native ke VPS — yang harus dikompilasi ulang setiap kali versi Node berubah,
 * dan menjadi satu lagi hal yang bisa menggagalkan penggelaran pada malam yang
 * salah.
 *
 * Yang TIDAK dikerjakan di sini: mengubah ukuran gambar. Itu dilakukan di
 * PERAMBAN, sebelum diunggah — lihat catatan di `services/fotoAbsensi.service`.
 *
 * ── Struktur JPEG, seperlunya ──
 *
 * Sebuah berkas JPEG adalah rangkaian segmen:
 *
 *     FFD8                        SOI, penanda awal berkas
 *     FF xx LL LL <data>          segmen dengan panjang (LL LL termasuk dirinya)
 *     ...
 *     FFDA LL LL <data> <entropi> SOS, sesudahnya data gambar terkompresi
 *     FFD9                        EOI
 *
 * EXIF hidup di segmen APP1 (FFE1). Segmen APPn lain (FFE0-FFEF) memuat profil
 * warna, thumbnail, dan data pembuat — termasuk, pada foto dari ponsel,
 * koordinat GPS. Semuanya dibuang.
 */

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const APP0 = 0xe0;
const APP15 = 0xef;
const COM = 0xfe;

/** Apakah byte-nya benar-benar diawali penanda JPEG. */
export function adalahJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === SOI;
}

/** Penanda berkas gambar lain — dipakai memberi pesan yang tepat. */
export function tebakFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'lainnya' {
  if (adalahJpeg(buffer)) return 'jpeg';
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  if (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return 'lainnya';
}

export interface HasilBersih {
  /** Byte JPEG tanpa segmen metadata. */
  buffer: Buffer;
  /** Berapa segmen metadata yang dibuang — dicatat, bukan dirahasiakan. */
  segmenDibuang: number;
  /** Lebar & tinggi dari segmen SOF, bila terbaca. */
  lebar: number | null;
  tinggi: number | null;
}

/**
 * Buang seluruh segmen APPn dan komentar dari sebuah JPEG.
 *
 * Melempar bila strukturnya tidak masuk akal. Itu disengaja: berkas yang
 * mengaku JPEG tetapi tidak bisa ditelusuri segmennya adalah berkas yang tidak
 * kita pahami, dan menyimpan sesuatu yang tidak dipahami ke disk server —
 * lalu menyajikannya kembali ke peramban pemilik — adalah cara yang bagus untuk
 * menemukan kerentanan orang lain dengan cara yang sulit.
 */
export function bersihkanJpeg(buffer: Buffer): HasilBersih {
  if (!adalahJpeg(buffer)) {
    throw new Error('Berkas ini bukan JPEG');
  }

  const potongan: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  let i = 2;
  let segmenDibuang = 0;
  let lebar: number | null = null;
  let tinggi: number | null = null;

  while (i < buffer.length) {
    // Setiap segmen diawali 0xFF. Byte pengisi (0xFF berulang) sah dan
    // dilewati.
    if (buffer[i] !== 0xff) {
      throw new Error('Struktur JPEG rusak: penanda segmen tidak ditemukan');
    }
    let penanda = buffer[i + 1];
    let j = i + 1;
    while (penanda === 0xff && j + 1 < buffer.length) {
      j += 1;
      penanda = buffer[j];
    }

    if (penanda === EOI) {
      potongan.push(buffer.subarray(j - 1, j + 1));
      break;
    }

    // SOS: sesudah header segmennya ada data entropi yang TIDAK berpanjang.
    // Sisa berkas disalin apa adanya — di dalamnya tidak ada metadata.
    if (penanda === SOS) {
      potongan.push(buffer.subarray(j - 1));
      break;
    }

    const awalPanjang = j + 1;
    if (awalPanjang + 1 >= buffer.length) {
      throw new Error('Struktur JPEG rusak: segmen terpotong');
    }
    const panjang = buffer.readUInt16BE(awalPanjang);
    if (panjang < 2) {
      throw new Error('Struktur JPEG rusak: panjang segmen tidak masuk akal');
    }

    const akhir = awalPanjang + panjang;
    if (akhir > buffer.length) {
      throw new Error('Struktur JPEG rusak: segmen melampaui akhir berkas');
    }

    // SOF0-SOF15 (kecuali DHT/JPG/DAC) membawa dimensi gambar. Dibaca sekilas
    // untuk validasi ukuran, tidak diubah.
    if (
      penanda >= 0xc0 &&
      penanda <= 0xcf &&
      penanda !== 0xc4 &&
      penanda !== 0xc8 &&
      penanda !== 0xcc
    ) {
      tinggi = buffer.readUInt16BE(awalPanjang + 3);
      lebar = buffer.readUInt16BE(awalPanjang + 5);
    }

    const metadata = (penanda >= APP0 && penanda <= APP15) || penanda === COM;
    if (metadata) {
      segmenDibuang += 1;
    } else {
      potongan.push(buffer.subarray(j - 1, akhir));
    }

    i = akhir;
  }

  return { buffer: Buffer.concat(potongan), segmenDibuang, lebar, tinggi };
}
