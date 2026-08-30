import { describe, expect, it } from 'vitest';
import { ROLE_LABEL, landingPathFor, type UserRole } from './auth';

/**
 * Halaman tujuan setelah login.
 *
 * Uji ini menjaga satu bug yang pernah membuat setiap kasir mendarat di
 * halaman 403 setiap kali ia masuk: `landingPathFor('KASIR')` memulangkan
 * `/dasbor`, sementara rute itu dijaga `allow={['OWNER']}`. Yang diperiksa di
 * sini bukan sekadar nilai barunya, melainkan aturan yang lebih besar — setiap
 * peran dipulangkan ke halaman yang memang boleh dibukanya.
 */
describe('landingPathFor', () => {
  it('memulangkan kasir ke layar kasir, bukan ke dasbor pemilik', () => {
    expect(landingPathFor('KASIR')).toBe('/kasir');
  });

  it('memulangkan pemilik ke dasbor', () => {
    expect(landingPathFor('OWNER')).toBe('/dasbor');
  });

  it('memulangkan dapur ke layar dapur', () => {
    expect(landingPathFor('DAPUR')).toBe('/dapur');
  });

  // Rute yang boleh dibuka tiap peran, disalin dari `App.tsx`. Kalau penjaga
  // rute di sana berubah, daftar ini harus ikut berubah — dan itu memang
  // maksudnya: keduanya adalah satu keputusan yang ditulis di dua tempat.
  it('tidak pernah memulangkan peran ke halaman yang ditolak penjaganya', () => {
    const bolehDibuka: Record<UserRole, string[]> = {
      OWNER: ['/dasbor', '/kasir', '/dapur'],
      KASIR: ['/kasir'],
      DAPUR: ['/dapur'],
    };

    for (const peran of Object.keys(bolehDibuka) as UserRole[]) {
      expect(bolehDibuka[peran]).toContain(landingPathFor(peran));
    }
  });

  it('memberi setiap peran label bahasa Indonesia', () => {
    expect(ROLE_LABEL.OWNER).toBe('Pemilik');
    expect(ROLE_LABEL.KASIR).toBe('Kasir');
    expect(ROLE_LABEL.DAPUR).toBe('Dapur');
  });
});
