import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bacaRollback,
  daftarCheck,
  daftarIndex,
  daftarKolom,
  daftarMigrasi,
  daftarTabel,
  databaseUji,
  definisiIndex,
  galatDari,
  jalankanMigrasi,
  tipeKolom,
} from './dbMigrasi';

/**
 * Uji migrasi `20260901000000_staf_shift_absensi` — dijalankan SUNGGUHAN oleh
 * PostgreSQL (PGlite/WASM, di dalam proses, tanpa server dan tanpa menyentuh
 * database mana pun yang sudah ada).
 *
 * Yang dijaga di sini adalah janji-janji yang ditulis di kepala migrasinya, dan
 * setiap janji itu diperiksa dengan cara yang sama: dengan mencoba
 * melanggarnya.
 *
 *   1. Migrasi jalan bersih di atas database kosong.
 *   2. Migrasi jalan di atas database yang SUDAH BERISI penjualan lama, dan
 *      data itu keluar utuh di sisi lain.
 *   3. CHECK constraint, foreign key, dan partial unique index benar-benar
 *      ditegakkan PostgreSQL — bukan cuma diharapkan oleh kode aplikasi.
 *   4. Satu kasir dan satu terminal tidak akan pernah punya dua shift aktif,
 *      berapa pun permintaan yang datang bersamaan.
 *   5. Migrasi yang gagal di tengah tidak meninggalkan apa pun.
 *   6. Naskah rollback mengembalikan skema lama tanpa merusak penjualan.
 */

const MIGRASI = '20260901000000_staf_shift_absensi';

const TABEL_BARU = [
  'shift_templates',
  'shift_schedules',
  'cashier_devices',
  'attendance_records',
  'attendance_photos',
  'cashier_shifts',
  'cash_movements',
  'shift_replacements',
];

const TABEL_LAMA = [
  'cafes',
  'users',
  'tables',
  'menu_categories',
  'menu_items',
  'orders',
  'order_items',
  'payments',
  'pembayaran_manual',
  'metode_pembayaran_kafe',
  'midtrans_credentials',
  'payment_audit_logs',
  'gateway_webhook_events',
  'dashboard_preferences',
  'push_subscriptions',
  'tenant_registrations',
];

// Id tetap supaya kegagalan uji menyebut baris yang sama setiap kali.
const CAFE = '11111111-1111-4111-8111-111111111111';
const CAFE_LAIN = '22222222-2222-4222-8222-222222222222';
const KASIR_A = '33333333-3333-4333-8333-333333333333';
const KASIR_B = '44444444-4444-4444-8444-444444444444';
const MEJA = '55555555-5555-4555-8555-555555555555';
const KATEGORI = '66666666-6666-4666-8666-666666666666';
const MENU = '77777777-7777-4777-8777-777777777777';
const PESANAN = '88888888-8888-4888-8888-888888888888';
const TERMINAL_1 = '99999999-9999-4999-8999-999999999999';
const TERMINAL_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEMPLATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * Penjualan lama — ditanam di atas SKEMA LAMA, sebelum migrasi dijalankan.
 *
 * Inilah yang membuat uji ini berbeda dari sekadar "migrasi jalan di database
 * kosong": yang berisiko rusak oleh sebuah migrasi bukan tabel yang masih
 * kosong, melainkan baris yang sudah ada isinya.
 */
async function tanamDataLama(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO cafes (id, name, created_at, updated_at)
    VALUES ('${CAFE}', 'Kopi Senja', now(), now()),
           ('${CAFE_LAIN}', 'Kafe Tetangga', now(), now());

    INSERT INTO users (id, cafe_id, name, email, password_hash, role, created_at, updated_at)
    VALUES ('${KASIR_A}', '${CAFE}', 'Budi', 'budi@kopisenja.id', 'hash-palsu', 'KASIR', now(), now()),
           ('${KASIR_B}', '${CAFE}', 'Sari', 'sari@kopisenja.id', 'hash-palsu', 'KASIR', now(), now());

    INSERT INTO tables (id, cafe_id, table_name, qr_code, created_at, updated_at)
    VALUES ('${MEJA}', '${CAFE}', 'Meja 1', 'qr-meja-1', now(), now());

    INSERT INTO menu_categories (id, cafe_id, name, order_position, created_at, updated_at)
    VALUES ('${KATEGORI}', '${CAFE}', 'Kopi', 0, now(), now());

    INSERT INTO menu_items (id, cafe_id, category_id, name, price, created_at, updated_at)
    VALUES ('${MENU}', '${CAFE}', '${KATEGORI}', 'Kopi Susu', 18000.00, now(), now());

    INSERT INTO orders (id, cafe_id, table_id, status, total_amount, created_at, updated_at)
    VALUES ('${PESANAN}', '${CAFE}', '${MEJA}', 'SELESAI', 36000.00, now(), now());

    INSERT INTO order_items (id, order_id, menu_item_id, name, price, quantity, created_at, updated_at)
    VALUES (gen_random_uuid(), '${PESANAN}', '${MENU}', 'Kopi Susu', 18000.00, 2, now(), now());

    INSERT INTO payments (id, order_id, method, status, amount, created_at, updated_at)
    VALUES (gen_random_uuid(), '${PESANAN}', 'CASH', 'SUCCESS', 36000.00, now(), now());

    INSERT INTO pembayaran_manual (id, order_id, metode, nominal, created_at, updated_at)
    VALUES ('cuid-lama-0001', '${PESANAN}', 'TUNAI', 50000.00, now(), now());

    INSERT INTO payment_audit_logs (id, cafe_id, aksi, created_at)
    VALUES (gen_random_uuid(), '${CAFE}', 'pembayaran.manual.diterima', now());
  `);
}

/** Perkakas menyiapkan shift — dipakai uji constraint & konkurensi. */
async function siapkanTerminal(db: PGlite): Promise<void> {
  await db.exec(`
    INSERT INTO cashier_devices (id, cafe_id, label, token_hash, created_at, updated_at)
    VALUES ('${TERMINAL_1}', '${CAFE}', 'Kasir Depan', 'hash-token-1', now(), now()),
           ('${TERMINAL_2}', '${CAFE}', 'Kasir Belakang', 'hash-token-2', now(), now());
  `);
}

function sqlBukaShift(opsi: {
  id: string;
  user: string;
  device?: string | null;
  status?: string;
}): string {
  const device = opsi.device ? `'${opsi.device}'` : 'NULL';
  return `INSERT INTO cashier_shifts
            (id, cafe_id, user_id, device_id, nama_shift, status, modal_awal, dibuka_pada, created_at, updated_at)
          VALUES
            ('${opsi.id}', '${CAFE}', '${opsi.user}', ${device}, 'Pagi', '${opsi.status ?? 'AKTIF'}', 100000, now(), now(), now())`;
}

// ═══════════════════════════════════════════════════════════════════════════

describe('migrasi di atas database kosong', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await databaseUji();
    await jalankanMigrasi(db);
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('menjalankan seluruh migrasi tanpa galat, dengan migrasi ini di urutan terakhir', async () => {
    const semua = await daftarMigrasi();
    expect(semua).toContain(MIGRASI);
    // Kalau kelak ada migrasi baru sesudahnya, uji ini mengingatkan supaya
    // urutan & anggapan di berkas ini ditinjau ulang.
    expect(semua.at(-1)).toBe(MIGRASI);
  });

  it('membuat kedelapan tabel baru', async () => {
    const tabel = await daftarTabel(db);
    for (const nama of TABEL_BARU) {
      expect(tabel, `tabel ${nama} harus ada`).toContain(nama);
    }
  });

  it('tidak menghapus satu pun tabel lama', async () => {
    const tabel = await daftarTabel(db);
    for (const nama of TABEL_LAMA) {
      expect(tabel, `tabel lama ${nama} tidak boleh hilang`).toContain(nama);
    }
  });

  it('menambahkan kolom pengaturan operasional ke cafes', async () => {
    const kolom = await daftarKolom(db, 'cafes');
    for (const nama of [
      'timezone',
      'awal_hari_operasional',
      'awal_minggu',
      'retensi_foto_hari',
      'kasir_lihat_riwayat',
      'pengganti_boleh_langsung',
    ]) {
      expect(kolom, `cafes.${nama}`).toContain(nama);
    }
    // Kolom lama tetap ada — pengaturan pembayaran tidak ikut tergusur.
    expect(kolom).toContain('metode_diterima');
    expect(kolom).toContain('midtrans_production');
  });

  it('menambahkan kolom PIN ke users tanpa menyentuh kolom sandi', async () => {
    const kolom = await daftarKolom(db, 'users');
    for (const nama of [
      'phone',
      'aktif',
      'pin_hash',
      'pin_gagal',
      'pin_terkunci_sampai',
      'pin_diperbarui_pada',
    ]) {
      expect(kolom, `users.${nama}`).toContain(nama);
    }
    expect(kolom).toContain('password_hash');
  });

  it('menautkan orders dan pembayaran_manual ke shift & terminal', async () => {
    expect(await daftarKolom(db, 'orders')).toEqual(
      expect.arrayContaining(['cashier_shift_id', 'device_id']),
    );
    expect(await daftarKolom(db, 'pembayaran_manual')).toEqual(
      expect.arrayContaining(['cashier_shift_id', 'device_id']),
    );
  });

  it('memperluas payment_audit_logs menjadi jejak audit umum', async () => {
    const kolom = await daftarKolom(db, 'payment_audit_logs');
    for (const nama of [
      'entity_type',
      'entity_id',
      'alasan',
      'device_id',
      'correlation_id',
    ]) {
      expect(kolom, `payment_audit_logs.${nama}`).toContain(nama);
    }
    // Kolom lama tetap utuh — baris audit lama harus tetap terbaca.
    expect(kolom).toEqual(
      expect.arrayContaining(['aksi', 'nilai_lama', 'nilai_baru', 'order_id']),
    );
  });

  // Keputusan tipe uang: BIGINT di tabel baru, Decimal di tabel lama.
  it('memakai BIGINT untuk uang di tabel kas, dan tidak mengubah tipe tabel lama', async () => {
    expect(await tipeKolom(db, 'cashier_shifts', 'modal_awal')).toBe('bigint');
    expect(await tipeKolom(db, 'cashier_shifts', 'kas_aktual')).toBe('bigint');
    expect(await tipeKolom(db, 'cashier_shifts', 'selisih')).toBe('bigint');
    expect(await tipeKolom(db, 'cash_movements', 'nominal')).toBe('bigint');

    // Yang lama TIDAK ikut berubah — inilah yang membuat migrasi ini tidak
    // perlu mengunci tabel penjualan.
    expect(await tipeKolom(db, 'orders', 'total_amount')).toBe('numeric');
    expect(await tipeKolom(db, 'payments', 'amount')).toBe('numeric');
  });

  it('memasang partial unique index yang benar-benar parsial', async () => {
    const index = await daftarIndex(db, 'cashier_shifts');
    expect(index).toContain('cashier_shifts_satu_aktif_per_kasir');
    expect(index).toContain('cashier_shifts_satu_aktif_per_terminal');

    // Bagian `WHERE`-nya yang menentukan. Tanpa itu, index ini akan melarang
    // kasir membuka shift KEDUA besok pagi — melarang pekerjaan sehari-hari,
    // bukan melarang kesalahan.
    const perKasir = await definisiIndex(db, 'cashier_shifts_satu_aktif_per_kasir');
    expect(perKasir).toMatch(/UNIQUE/i);
    expect(perKasir).toMatch(/WHERE .*status = 'AKTIF'/i);

    const perTerminal = await definisiIndex(db, 'cashier_shifts_satu_aktif_per_terminal');
    expect(perTerminal).toMatch(/UNIQUE/i);
    expect(perTerminal).toMatch(/WHERE .*status = 'AKTIF'/i);
  });

  it('memasang seluruh CHECK constraint yang dijanjikan', async () => {
    expect(await daftarCheck(db, 'shift_templates')).toContain(
      'shift_templates_menit_valid',
    );
    expect(await daftarCheck(db, 'cafes')).toEqual(
      expect.arrayContaining(['cafes_awal_hari_valid', 'cafes_awal_minggu_valid']),
    );
    expect(await daftarCheck(db, 'cashier_shifts')).toContain(
      'cashier_shifts_modal_tidak_negatif',
    );
    expect(await daftarCheck(db, 'cash_movements')).toContain(
      'cash_movements_nominal_positif',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('migrasi di atas penjualan lama', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await databaseUji();
    // Bangun SKEMA LAMA saja, lalu tanam data, baru jalankan migrasi ini —
    // persis urutan yang terjadi di server sungguhan.
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);
    await jalankanMigrasi(db, { mulaiDari: MIGRASI });
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('tidak kehilangan satu baris pun', async () => {
    const hitung = async (tabel: string): Promise<number> => {
      const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabel}`);
      return r.rows[0].n;
    };
    expect(await hitung('cafes')).toBe(2);
    expect(await hitung('users')).toBe(2);
    expect(await hitung('orders')).toBe(1);
    expect(await hitung('order_items')).toBe(1);
    expect(await hitung('payments')).toBe(1);
    expect(await hitung('pembayaran_manual')).toBe(1);
    expect(await hitung('payment_audit_logs')).toBe(1);
  });

  it('tidak mengubah nilai penjualan lama', async () => {
    const r = await db.query<{ total_amount: string; status: string }>(
      `SELECT total_amount::text, status FROM orders WHERE id = $1`,
      [PESANAN],
    );
    expect(r.rows[0].total_amount).toBe('36000.00');
    expect(r.rows[0].status).toBe('SELESAI');

    const p = await db.query<{ amount: string; status: string }>(
      `SELECT amount::text, status FROM payments WHERE order_id = $1`,
      [PESANAN],
    );
    expect(p.rows[0].amount).toBe('36000.00');
    expect(p.rows[0].status).toBe('SUCCESS');
  });

  it('memberi kafe lama pengaturan waktu bawaan yang masuk akal', async () => {
    const r = await db.query<{
      timezone: string;
      awal_hari_operasional: number;
      awal_minggu: number;
      retensi_foto_hari: number;
      kasir_lihat_riwayat: boolean;
    }>(
      `SELECT timezone, awal_hari_operasional, awal_minggu, retensi_foto_hari, kasir_lihat_riwayat
         FROM cafes WHERE id = $1`,
      [CAFE],
    );
    expect(r.rows[0]).toEqual({
      timezone: 'Asia/Jakarta',
      awal_hari_operasional: 0,
      awal_minggu: 1,
      retensi_foto_hari: 90,
      kasir_lihat_riwayat: true,
    });
  });

  it('menganggap staf lama aktif dan belum punya PIN', async () => {
    const r = await db.query<{ aktif: boolean; pin_hash: string | null; pin_gagal: number }>(
      `SELECT aktif, pin_hash, pin_gagal FROM users WHERE id = $1`,
      [KASIR_A],
    );
    // Staf lama harus tetap bisa bekerja setelah migrasi — bukan tiba-tiba
    // nonaktif karena kolomnya baru ditambahkan.
    expect(r.rows[0].aktif).toBe(true);
    // Belum punya PIN: pemilik yang menetapkannya nanti, bukan migrasi yang
    // mengarang satu.
    expect(r.rows[0].pin_hash).toBeNull();
    expect(r.rows[0].pin_gagal).toBe(0);
  });

  // Tidak ada backfill yang mengarang shift untuk penjualan yang sudah lewat:
  // itu berarti menuliskan bahwa seseorang memegang laci pada jam yang tidak
  // pernah ia buka.
  it('meninggalkan pesanan lama tanpa shift — "Data lama", bukan shift karangan', async () => {
    const r = await db.query<{ cashier_shift_id: string | null; device_id: string | null }>(
      `SELECT cashier_shift_id, device_id FROM orders WHERE id = $1`,
      [PESANAN],
    );
    expect(r.rows[0].cashier_shift_id).toBeNull();
    expect(r.rows[0].device_id).toBeNull();
  });

  it('membiarkan audit log lama terbaca dengan kolom barunya kosong', async () => {
    const r = await db.query<{ aksi: string; entity_type: string | null }>(
      `SELECT aksi, entity_type FROM payment_audit_logs`,
    );
    expect(r.rows[0].aksi).toBe('pembayaran.manual.diterima');
    expect(r.rows[0].entity_type).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('CHECK constraint ditegakkan database', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await databaseUji();
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);
    await jalankanMigrasi(db, { mulaiDari: MIGRASI });
    await siapkanTerminal(db);
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('menolak jam shift di luar 0-1439', async () => {
    const galat = await galatDari(() =>
      db.exec(`INSERT INTO shift_templates (id, cafe_id, nama, menit_mulai, menit_selesai, created_at, updated_at)
               VALUES (gen_random_uuid(), '${CAFE}', 'Rusak', 1500, 600, now(), now())`),
    );
    expect(galat).toMatch(/shift_templates_menit_valid/);
  });

  it('menerima jam shift di kedua ujung rentang yang sah', async () => {
    const galat = await galatDari(() =>
      db.exec(`INSERT INTO shift_templates (id, cafe_id, nama, menit_mulai, menit_selesai, created_at, updated_at)
               VALUES ('${TEMPLATE}', '${CAFE}', 'Nonstop', 0, 1439, now(), now())`),
    );
    expect(galat).toBeNull();
  });

  it('menolak awal hari operasional dan awal minggu yang mustahil', async () => {
    expect(
      await galatDari(() =>
        db.exec(`UPDATE cafes SET awal_hari_operasional = 1500 WHERE id = '${CAFE}'`),
      ),
    ).toMatch(/cafes_awal_hari_valid/);

    expect(
      await galatDari(() => db.exec(`UPDATE cafes SET awal_minggu = 0 WHERE id = '${CAFE}'`)),
    ).toMatch(/cafes_awal_minggu_valid/);

    expect(
      await galatDari(() => db.exec(`UPDATE cafes SET awal_minggu = 8 WHERE id = '${CAFE}'`)),
    ).toMatch(/cafes_awal_minggu_valid/);
  });

  it('menolak modal awal dan kas aktual yang negatif', async () => {
    expect(
      await galatDari(() =>
        db.exec(`INSERT INTO cashier_shifts
                   (id, cafe_id, user_id, nama_shift, modal_awal, dibuka_pada, created_at, updated_at)
                 VALUES (gen_random_uuid(), '${CAFE}', '${KASIR_A}', 'Pagi', -1, now(), now(), now())`),
      ),
    ).toMatch(/cashier_shifts_modal_tidak_negatif/);
  });

  // Pergerakan kas nol tidak menyatakan apa pun, dan yang negatif hanyalah cara
  // lain menulis arah yang sudah punya kolomnya sendiri (`jenis`).
  it('menolak pergerakan kas bernilai nol atau negatif', async () => {
    await db.exec(sqlBukaShift({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user: KASIR_A }));

    for (const nominal of [0, -5000]) {
      const galat = await galatDari(() =>
        db.exec(`INSERT INTO cash_movements (id, cafe_id, shift_id, jenis, nominal, alasan, created_at)
                 VALUES (gen_random_uuid(), '${CAFE}', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                         'KELUAR', ${nominal}, 'uji', now())`),
      );
      expect(galat, `nominal ${nominal} harus ditolak`).toMatch(
        /cash_movements_nominal_positif/,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('foreign key ditegakkan database', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await databaseUji();
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);
    await jalankanMigrasi(db, { mulaiDari: MIGRASI });
    await siapkanTerminal(db);
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('menolak shift milik kafe yang tidak ada', async () => {
    const galat = await galatDari(() =>
      db.exec(`INSERT INTO cashier_shifts
                 (id, cafe_id, user_id, nama_shift, modal_awal, dibuka_pada, created_at, updated_at)
               VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000000',
                       '${KASIR_A}', 'Pagi', 0, now(), now(), now())`),
    );
    expect(galat).toMatch(/foreign key|violates/i);
  });

  it('ikut menghapus pergerakan kas saat shiftnya dihapus', async () => {
    const shift = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await db.exec(sqlBukaShift({ id: shift, user: KASIR_A, status: 'DITUTUP' }));
    await db.exec(`INSERT INTO cash_movements (id, cafe_id, shift_id, jenis, nominal, alasan, created_at)
                   VALUES (gen_random_uuid(), '${CAFE}', '${shift}', 'MASUK', 25000, 'setoran', now())`);

    await db.exec(`DELETE FROM cashier_shifts WHERE id = '${shift}'`);
    const sisa = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cash_movements WHERE shift_id = $1`,
      [shift],
    );
    expect(sisa.rows[0].n).toBe(0);
  });

  // Menghapus kasir tidak boleh ikut menghapus jejak siapa yang memegang laci.
  it('menolak penghapusan kasir yang masih punya shift', async () => {
    const shift = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await db.exec(sqlBukaShift({ id: shift, user: KASIR_B, status: 'DITUTUP' }));

    const galat = await galatDari(() =>
      db.exec(`DELETE FROM users WHERE id = '${KASIR_B}'`),
    );
    expect(galat).toMatch(/foreign key|violates/i);
  });

  // Pesanan adalah riwayat penjualan: ia tidak boleh ikut hilang bersama shift,
  // hanya kehilangan penunjuknya.
  it('mengosongkan penunjuk shift pada pesanan saat shiftnya dihapus, tanpa menghapus pesanannya', async () => {
    const shift = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await db.exec(sqlBukaShift({ id: shift, user: KASIR_A, status: 'DITUTUP' }));
    await db.exec(`UPDATE orders SET cashier_shift_id = '${shift}' WHERE id = '${PESANAN}'`);

    await db.exec(`DELETE FROM cashier_shifts WHERE id = '${shift}'`);

    const r = await db.query<{ n: number; cashier_shift_id: string | null }>(
      `SELECT count(*)::int AS n, max(cashier_shift_id::text) AS cashier_shift_id
         FROM orders WHERE id = $1 GROUP BY id`,
      [PESANAN],
    );
    expect(r.rows[0].n).toBe(1);
    expect(r.rows[0].cashier_shift_id).toBeNull();
  });

  it('ikut menghapus foto saat catatan absensinya dihapus', async () => {
    const absen = '12121212-1212-4121-8121-121212121212';
    await db.exec(`
      INSERT INTO attendance_records (id, cafe_id, user_id, status, created_at, updated_at)
      VALUES ('${absen}', '${CAFE}', '${KASIR_A}', 'PRESENT', now(), now());
      INSERT INTO attendance_photos
        (id, cafe_id, attendance_id, jenis, nama_berkas, mime_type, ukuran_byte, created_at)
      VALUES (gen_random_uuid(), '${CAFE}', '${absen}', 'MASUK', 'acak.jpg', 'image/jpeg', 1024, now());
    `);

    await db.exec(`DELETE FROM attendance_records WHERE id = '${absen}'`);
    const sisa = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM attendance_photos WHERE attendance_id = $1`,
      [absen],
    );
    expect(sisa.rows[0].n).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Satu shift aktif per kasir dan per terminal.
 *
 * Ini aturan yang paling mahal kalau salah: dua laci yang sama-sama mengklaim
 * uang yang sama membuat rekap penutupan tidak bisa dipercaya, dan tidak ada
 * cara memperbaikinya keesokan harinya selain menghitung ulang manual.
 *
 * ── Catatan tentang "konkurensi" ──
 *
 * PGlite melayani satu query pada satu waktu di dalam satu proses, jadi balapan
 * wall-clock antara dua koneksi tidak bisa dipentaskan di sini. Yang justru
 * penting: balapan semacam itu TIDAK PERLU dipentaskan, karena yang menjaga
 * aturan ini bukan urutan eksekusi melainkan partial unique index. Berapa pun
 * permintaan yang tiba dan bagaimanapun mereka berselang-seling, PostgreSQL
 * hanya mengizinkan SATU baris aktif per kasir — yang kedua kalah di database,
 * bukan di pemeriksaan aplikasi yang bisa didahului.
 *
 * Yang diuji di bawah adalah persis itu: perilaku indexnya, termasuk saat dua
 * permintaan dikirim tanpa menunggu satu sama lain.
 */
describe('satu shift aktif per kasir dan per terminal', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await databaseUji();
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);
    await jalankanMigrasi(db, { mulaiDari: MIGRASI });
    await siapkanTerminal(db);
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('menolak shift aktif KEDUA untuk kasir yang sama', async () => {
    await db.exec(sqlBukaShift({ id: '10000000-0000-4000-8000-000000000001', user: KASIR_A }));

    const galat = await galatDari(() =>
      db.exec(sqlBukaShift({ id: '10000000-0000-4000-8000-000000000002', user: KASIR_A })),
    );
    expect(galat).toMatch(/cashier_shifts_satu_aktif_per_kasir/);
  });

  it('mengizinkan kasir lain membuka shiftnya sendiri di saat yang sama', async () => {
    const galat = await galatDari(() =>
      db.exec(
        sqlBukaShift({
          id: '10000000-0000-4000-8000-000000000003',
          user: KASIR_B,
          device: TERMINAL_2,
        }),
      ),
    );
    expect(galat).toBeNull();
  });

  // Justru inilah yang membuat index harus PARSIAL: kasir yang sama membuka
  // shift lagi besok pagi adalah pekerjaan sehari-hari, bukan kesalahan.
  it('mengizinkan kasir membuka shift baru setelah yang lama ditutup', async () => {
    await db.exec(
      `UPDATE cashier_shifts SET status = 'DITUTUP', ditutup_pada = now()
        WHERE id = '10000000-0000-4000-8000-000000000001'`,
    );

    const galat = await galatDari(() =>
      db.exec(sqlBukaShift({ id: '10000000-0000-4000-8000-000000000004', user: KASIR_A })),
    );
    expect(galat).toBeNull();
  });

  it('mengizinkan seorang kasir menumpuk banyak shift yang sudah ditutup', async () => {
    for (let i = 5; i <= 8; i += 1) {
      const galat = await galatDari(() =>
        db.exec(
          sqlBukaShift({
            id: `10000000-0000-4000-8000-00000000000${i}`,
            user: KASIR_A,
            status: 'DITUTUP',
          }),
        ),
      );
      expect(galat, `shift tertutup ke-${i}`).toBeNull();
    }
  });

  it('menolak shift aktif KEDUA pada terminal yang sama, meski kasirnya berbeda', async () => {
    // Bersihkan dulu supaya yang diuji benar-benar terminalnya, bukan kasirnya.
    await db.exec(`UPDATE cashier_shifts SET status = 'DITUTUP', ditutup_pada = now()`);
    await db.exec(
      sqlBukaShift({
        id: '20000000-0000-4000-8000-000000000001',
        user: KASIR_A,
        device: TERMINAL_1,
      }),
    );

    const galat = await galatDari(() =>
      db.exec(
        sqlBukaShift({
          id: '20000000-0000-4000-8000-000000000002',
          user: KASIR_B,
          device: TERMINAL_1,
        }),
      ),
    );
    expect(galat).toMatch(/cashier_shifts_satu_aktif_per_terminal/);
  });

  it('mengizinkan dua terminal berjalan bersamaan di kafe yang sama', async () => {
    const galat = await galatDari(() =>
      db.exec(
        sqlBukaShift({
          id: '20000000-0000-4000-8000-000000000003',
          user: KASIR_B,
          device: TERMINAL_2,
        }),
      ),
    );
    expect(galat).toBeNull();
  });

  // NULL dianggap berbeda satu sama lain oleh PostgreSQL — shift yang dibuka
  // tanpa terminal terdaftar tidak boleh saling menghalangi.
  it('tidak menghalangi shift tanpa terminal satu sama lain', async () => {
    await db.exec(`UPDATE cashier_shifts SET status = 'DITUTUP', ditutup_pada = now()`);
    await db.exec(`
      INSERT INTO users (id, cafe_id, name, email, password_hash, role, created_at, updated_at)
      VALUES ('30000000-0000-4000-8000-000000000001', '${CAFE}', 'Cici', 'cici@kopisenja.id', 'h', 'KASIR', now(), now())
    `);

    await db.exec(
      sqlBukaShift({ id: '20000000-0000-4000-8000-000000000004', user: KASIR_A, device: null }),
    );
    const galat = await galatDari(() =>
      db.exec(
        sqlBukaShift({
          id: '20000000-0000-4000-8000-000000000005',
          user: '30000000-0000-4000-8000-000000000001',
          device: null,
        }),
      ),
    );
    expect(galat).toBeNull();
  });

  /**
   * Dua permintaan "Buka Shift" yang dikirim tanpa menunggu satu sama lain.
   *
   * Inilah bentuk paling dekat dengan kejadian nyata yang bisa dipentaskan di
   * sini: kasir menekan tombol dua kali, atau dua tab terbuka sekaligus. Kedua
   * INSERT dilepas bersamaan tanpa `await` di antaranya; yang dijaga adalah
   * hasil akhirnya — TEPAT SATU yang berhasil, dan yang kalah kalah karena
   * indexnya, bukan karena kebetulan.
   */
  it('hanya meloloskan satu dari dua permintaan yang dilepas bersamaan', async () => {
    await db.exec(`UPDATE cashier_shifts SET status = 'DITUTUP', ditutup_pada = now()`);

    const hasil = await Promise.allSettled([
      db.exec(sqlBukaShift({ id: '40000000-0000-4000-8000-000000000001', user: KASIR_A })),
      db.exec(sqlBukaShift({ id: '40000000-0000-4000-8000-000000000002', user: KASIR_A })),
    ]);

    const berhasil = hasil.filter((h) => h.status === 'fulfilled');
    const gagal = hasil.filter((h) => h.status === 'rejected');
    expect(berhasil).toHaveLength(1);
    expect(gagal).toHaveLength(1);
    expect(String((gagal[0] as PromiseRejectedResult).reason)).toMatch(
      /cashier_shifts_satu_aktif_per_kasir/,
    );

    // Dan yang tersisa di database memang tepat satu.
    const aktif = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cashier_shifts WHERE user_id = $1 AND status = 'AKTIF'`,
      [KASIR_A],
    );
    expect(aktif.rows[0].n).toBe(1);
  });

  it('tetap menyisakan satu shift aktif setelah lima permintaan beruntun', async () => {
    await db.exec(`UPDATE cashier_shifts SET status = 'DITUTUP', ditutup_pada = now()`);

    const hasil = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((i) =>
        db.exec(
          sqlBukaShift({
            id: `5000000${i}-0000-4000-8000-000000000001`,
            user: KASIR_A,
            device: TERMINAL_1,
          }),
        ),
      ),
    );

    expect(hasil.filter((h) => h.status === 'fulfilled')).toHaveLength(1);

    const aktif = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cashier_shifts WHERE status = 'AKTIF'`,
    );
    expect(aktif.rows[0].n).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('migrasi gagal secara atomik', () => {
  /**
   * `prisma migrate deploy` menjalankan setiap berkas migrasi di dalam SATU
   * transaksi. Uji ini memastikan janji itu benar-benar berlaku untuk migrasi
   * ini: DDL PostgreSQL bersifat transaksional, jadi kegagalan di tengah harus
   * mengembalikan database ke keadaan semula — tanpa menyisakan setengah tabel
   * baru yang membuat percobaan berikutnya gagal dengan "already exists".
   */
  it('tidak meninggalkan satu tabel pun ketika ada pernyataan yang gagal', async () => {
    const db = await databaseUji();
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);

    const sebelum = await daftarTabel(db);
    expect(sebelum).not.toContain('cashier_shifts');

    const { bacaMigrasi } = await import('./dbMigrasi');
    const sql = await bacaMigrasi(MIGRASI);

    // Migrasi utuh + satu pernyataan yang pasti gagal di ujungnya, semuanya di
    // dalam satu transaksi.
    const galat = await galatDari(() =>
      db.exec(`BEGIN;
${sql}
INSERT INTO cashier_shifts (id, cafe_id, user_id, nama_shift, modal_awal, dibuka_pada, created_at, updated_at)
VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000000', '${KASIR_A}', 'X', 0, now(), now(), now());
COMMIT;`),
    );
    expect(galat).toMatch(/foreign key|violates/i);

    // PGlite tidak selalu menutup transaksi yang gagal sendiri — dituntaskan
    // di sini supaya pemeriksaan sesudahnya berjalan di luar transaksi.
    await galatDari(() => db.exec('ROLLBACK'));

    const sesudah = await daftarTabel(db);
    for (const nama of TABEL_BARU) {
      expect(sesudah, `${nama} tidak boleh tersisa setelah rollback`).not.toContain(nama);
    }
    // Kolom pada tabel lama juga tidak boleh tertinggal separuh jadi.
    expect(await daftarKolom(db, 'cafes')).not.toContain('timezone');
    expect(await daftarKolom(db, 'orders')).not.toContain('cashier_shift_id');

    // Dan penjualan lamanya tetap utuh.
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM orders`);
    expect(r.rows[0].n).toBe(1);

    await db.close();
  }, 120_000);

  it('bisa dijalankan ulang dengan bersih setelah kegagalan', async () => {
    const db = await databaseUji();
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);

    const { bacaMigrasi } = await import('./dbMigrasi');
    const sql = await bacaMigrasi(MIGRASI);

    await galatDari(() => db.exec(`BEGIN;\n${sql}\nSELECT 1/0;\nCOMMIT;`));
    await galatDari(() => db.exec('ROLLBACK'));

    // Percobaan kedua harus berhasil — inilah gunanya atomicity: kegagalan
    // tidak meninggalkan puing yang menghalangi percobaan berikutnya.
    const galat = await galatDari(() => jalankanMigrasi(db, { mulaiDari: MIGRASI }));
    expect(galat).toBeNull();
    expect(await daftarTabel(db)).toContain('cashier_shifts');

    await db.close();
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════

describe('rollback (migration.down.sql)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await databaseUji();
    await jalankanMigrasi(db, { berhentiSebelum: MIGRASI });
    await tanamDataLama(db);
    await jalankanMigrasi(db, { mulaiDari: MIGRASI });
    // Data operasional yang akan hilang — memang itu yang diperingatkan naskah
    // rollback-nya, dan uji ini memastikan peringatan itu jujur.
    await siapkanTerminal(db);
    await db.exec(sqlBukaShift({ id: '60000000-0000-4000-8000-000000000001', user: KASIR_A }));

    await db.exec(await bacaRollback(MIGRASI));
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('menghapus kedelapan tabel baru', async () => {
    const tabel = await daftarTabel(db);
    for (const nama of TABEL_BARU) {
      expect(tabel, `${nama} harus hilang setelah rollback`).not.toContain(nama);
    }
  });

  it('mengembalikan tabel lama ke bentuk semula', async () => {
    expect(await daftarKolom(db, 'cafes')).not.toContain('timezone');
    expect(await daftarKolom(db, 'users')).not.toContain('pin_hash');
    expect(await daftarKolom(db, 'orders')).not.toContain('cashier_shift_id');
    expect(await daftarKolom(db, 'payment_audit_logs')).not.toContain('entity_type');
  });

  it('tidak menghapus satu pun tabel lama', async () => {
    const tabel = await daftarTabel(db);
    for (const nama of TABEL_LAMA) {
      expect(tabel, `tabel lama ${nama} tidak boleh ikut hilang`).toContain(nama);
    }
  });

  // Yang paling penting dari sebuah rollback: penjualan selamat.
  it('menyelamatkan seluruh penjualan dan pembayaran', async () => {
    const o = await db.query<{ n: number; total_amount: string }>(
      `SELECT count(*)::int AS n, max(total_amount)::text AS total_amount FROM orders`,
    );
    expect(o.rows[0].n).toBe(1);
    expect(o.rows[0].total_amount).toBe('36000.00');

    const p = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM payments`);
    expect(p.rows[0].n).toBe(1);

    const a = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payment_audit_logs`,
    );
    expect(a.rows[0].n).toBe(1);

    const u = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
    expect(u.rows[0].n).toBe(2);
  });

  it('bisa dimigrasikan ulang setelah rollback', async () => {
    const galat = await galatDari(() => jalankanMigrasi(db, { mulaiDari: MIGRASI }));
    expect(galat).toBeNull();
    expect(await daftarTabel(db)).toContain('cashier_shifts');
  });
});
