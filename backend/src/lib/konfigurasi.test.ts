import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  daftarOriginDiizinkan,
  keOrigin,
  originDiizinkan,
  siapkanDirektoriFoto,
  trustProxy,
} from './konfigurasi';

/**
 * Konfigurasi boot.
 *
 * Kedua hal yang diuji di sini punya sifat yang sama: kalau salah, gejalanya
 * muncul jauh dari penyebabnya. Direktori foto yang menunjuk ke dalam repository
 * baru ketahuan saat wajah karyawan ikut ter-commit; daftar origin yang salah
 * baru ketahuan saat kasir tidak bisa masuk pada pagi tersibuk.
 */

const NODE_ENV_ASLI = process.env.NODE_ENV;
let sementara: string;

beforeEach(() => {
  sementara = mkdtempSync(path.join(tmpdir(), 'cafeos-uji-'));
});

afterEach(() => {
  process.env.NODE_ENV = NODE_ENV_ASLI;
  rmSync(sementara, { recursive: true, force: true });
});

describe('direktori foto absensi', () => {
  it('membuat direktori yang belum ada, dengan izin terbatas', () => {
    const tujuan = path.join(sementara, 'absensi');
    expect(existsSync(tujuan)).toBe(false);

    const hasil = siapkanDirektoriFoto({ ATTENDANCE_PHOTO_DIR: tujuan } as never, sementara);

    expect(hasil.direktori).toBe(path.resolve(tujuan));
    expect(hasil.dariEnv).toBe(true);
    expect(statSync(tujuan).isDirectory()).toBe(true);
  });

  it('jatuh ke folder bawaan pengembangan bila env kosong', () => {
    const hasil = siapkanDirektoriFoto({} as never, sementara);
    expect(hasil.dariEnv).toBe(false);
    expect(hasil.direktori).toBe(path.resolve(sementara, 'penyimpanan', 'absensi'));
  });

  describe('di produksi', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    // Server yang menolak menyala jauh lebih murah daripada penemuan sebulan
    // kemudian bahwa foto menumpuk di tempat yang tidak seorang pun kira.
    it('menolak menyala tanpa ATTENDANCE_PHOTO_DIR', () => {
      expect(() => siapkanDirektoriFoto({} as never, sementara)).toThrow(
        /wajib diisi di produksi/i,
      );
    });

    /** Worktree palsu: `<sementara>/repo` berisi `.git`, cwd di `repo/backend`. */
    function worktreePalsu(): { repo: string; cwd: string } {
      const repo = path.join(sementara, 'repo');
      mkdirSync(path.join(repo, '.git'), { recursive: true });
      const cwd = path.join(repo, 'backend');
      mkdirSync(cwd, { recursive: true });
      return { repo, cwd };
    }

    it('menolak jalur di dalam repository', () => {
      const { repo, cwd } = worktreePalsu();

      expect(() =>
        siapkanDirektoriFoto(
          { ATTENDANCE_PHOTO_DIR: path.join(repo, 'backend', 'penyimpanan') } as never,
          cwd,
        ),
      ).toThrow(/di dalam folder aplikasi/i);
    });

    // Penggelaran produksi sering menyalin `dist/` TANPA `.git` — direktori
    // aplikasinya tetap tempat yang salah untuk menyimpan wajah karyawan.
    it('menolak jalur di dalam direktori kerja meski tanpa .git', () => {
      const kerja = path.join(sementara, 'app-tanpa-git');
      mkdirSync(kerja, { recursive: true });

      expect(() =>
        siapkanDirektoriFoto(
          { ATTENDANCE_PHOTO_DIR: path.join(kerja, 'penyimpanan') } as never,
          kerja,
        ),
      ).toThrow(/di dalam folder aplikasi/i);
    });

    it('menerima jalur privat di luar repository', () => {
      const { cwd } = worktreePalsu();
      const privat = path.join(sementara, 'var-lib-cafeos');

      const hasil = siapkanDirektoriFoto({ ATTENDANCE_PHOTO_DIR: privat } as never, cwd);
      expect(hasil.direktori).toBe(path.resolve(privat));
    });

    /**
     * Direktori home yang dikelola sebagai repo dotfiles adalah kebiasaan yang
     * umum. Pencarian `.git` yang naik sampai akar disk akan menemukannya, lalu
     * menyimpulkan bahwa seluruh isi home berada "di dalam aplikasi" — menolak
     * `/home/cafeos/data` dengan pesan yang menuduh hal yang salah.
     */
    it('tidak salah mengira repo jauh di atas sebagai folder aplikasi', () => {
      const repoJauh = path.join(sementara, 'home');
      mkdirSync(path.join(repoJauh, '.git'), { recursive: true });
      // cwd lima tingkat di bawahnya — di luar jangkauan pencarian.
      const cwd = path.join(repoJauh, 'a', 'b', 'c', 'd', 'app');
      mkdirSync(cwd, { recursive: true });

      const privat = path.join(repoJauh, 'data-cafeos');
      const hasil = siapkanDirektoriFoto({ ATTENDANCE_PHOTO_DIR: privat } as never, cwd);
      expect(hasil.direktori).toBe(path.resolve(privat));
    });

    it('menolak jalur yang induknya ternyata sebuah berkas', () => {
      const berkas = path.join(sementara, 'bukan-folder');
      writeFileSync(berkas, 'x');

      expect(() =>
        siapkanDirektoriFoto(
          { ATTENDANCE_PHOTO_DIR: path.join(berkas, 'anak') } as never,
          path.join(sementara, 'app'),
        ),
      ).toThrow(/Tidak bisa membuat direktori/i);
    });
  });
});

describe('normalisasi origin', () => {
  it('membuang jalur & garis miring di ujung', () => {
    expect(keOrigin('https://cafe.example.com/')).toBe('https://cafe.example.com');
    expect(keOrigin('https://cafe.example.com/api/')).toBe('https://cafe.example.com');
    expect(keOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('mengembalikan null untuk nilai yang bukan URL', () => {
    expect(keOrigin('')).toBeNull();
    expect(keOrigin('   ')).toBeNull();
    expect(keOrigin('bukan-url')).toBeNull();
    expect(keOrigin(undefined)).toBeNull();
  });
});

describe('daftar origin ber-cookie', () => {
  it('menggabungkan CORS_ORIGINS, PUBLIC_APP_URL, dan PUBLIC_API_URL', () => {
    const daftar = daftarOriginDiizinkan({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
      PUBLIC_APP_URL: 'https://cafe.example.com/',
      PUBLIC_API_URL: 'https://api.example.com',
    } as never);

    expect(daftar).toEqual(
      expect.arrayContaining([
        'https://a.example.com',
        'https://b.example.com',
        'https://cafe.example.com',
        'https://api.example.com',
      ]),
    );
  });

  // Origin pengembangan tidak boleh ikut terbawa ke produksi.
  it('tidak menyertakan localhost di produksi', () => {
    const daftar = daftarOriginDiizinkan({
      NODE_ENV: 'production',
      PUBLIC_APP_URL: 'https://cafe.example.com',
    } as never);
    expect(daftar).toEqual(['https://cafe.example.com']);
  });

  it('menyertakan origin pengembangan di luar produksi', () => {
    const daftar = daftarOriginDiizinkan({ NODE_ENV: 'development' } as never);
    expect(daftar).toContain('http://localhost:5173');
  });

  it('membuang entri kosong dan yang bukan URL', () => {
    const daftar = daftarOriginDiizinkan({
      NODE_ENV: 'production',
      CORS_ORIGINS: ' , bukan-url , https://sah.example.com ,',
    } as never);
    expect(daftar).toEqual(['https://sah.example.com']);
  });
});

describe('originDiizinkan', () => {
  const daftar = ['https://cafe.example.com'];

  it('menerima origin yang terdaftar', () => {
    expect(originDiizinkan('https://cafe.example.com', daftar)).toBe(true);
  });

  it('menolak origin lain, termasuk yang mirip', () => {
    expect(originDiizinkan('https://cafe.example.com.jahat.id', daftar)).toBe(false);
    expect(originDiizinkan('http://cafe.example.com', daftar)).toBe(false); // skema beda
    expect(originDiizinkan('https://cafe.example.com:8443', daftar)).toBe(false); // port beda
    expect(originDiizinkan('null', daftar)).toBe(false); // sandboxed iframe
  });

  /**
   * Permintaan tanpa Origin BUKAN lintas-situs dari peramban: itu webhook
   * gateway, health check, dan curl — yang tidak pernah membawa cookie siapa
   * pun. Menolaknya akan mematikan notifikasi pembayaran Midtrans/DOKU.
   */
  it('menerima permintaan tanpa header Origin', () => {
    expect(originDiizinkan(undefined, daftar)).toBe(true);
    expect(originDiizinkan('', daftar)).toBe(true);
  });
});

/**
 * `trust proxy` menentukan apakah Express boleh memercayai `X-Forwarded-For`.
 *
 * Bawaannya MATI, dan itu bukan kelalaian. Header itu teks biasa: selama Nginx
 * belum dikonfigurasi menambahkan alamat peer sungguhan ke ujung rantai, nilai
 * yang sampai ke backend adalah nilai yang diketik klien — dan pembatas laju
 * yang memercayainya bisa dilewati seumur hidup hanya dengan mengarang IP baru
 * pada tiap permintaan.
 */
describe('trustProxy', () => {
  it('MATI bila tidak dikonfigurasi', () => {
    expect(trustProxy({})).toBe(false);
    expect(trustProxy({ TRUST_PROXY: '' })).toBe(false);
    expect(trustProxy({ TRUST_PROXY: '   ' })).toBe(false);
  });

  it('bisa dimatikan secara eksplisit', () => {
    expect(trustProxy({ TRUST_PROXY: 'false' })).toBe(false);
    expect(trustProxy({ TRUST_PROXY: 'FALSE' })).toBe(false);
    expect(trustProxy({ TRUST_PROXY: '0' })).toBe(false);
  });

  it('menerima jumlah hop sebagai angka, bukan teks', () => {
    // Express membedakan keduanya: angka = hitungan hop, teks = daftar alamat.
    expect(trustProxy({ TRUST_PROXY: '1' })).toBe(1);
    expect(trustProxy({ TRUST_PROXY: '2' })).toBe(2);
  });

  it('meneruskan nama & CIDR apa adanya untuk Express', () => {
    expect(trustProxy({ TRUST_PROXY: 'loopback' })).toBe('loopback');
    expect(trustProxy({ TRUST_PROXY: ' 127.0.0.1/8 ' })).toBe('127.0.0.1/8');
  });
});
