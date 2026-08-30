import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Menjalankan migrasi Prisma di atas PGlite — PostgreSQL yang dikompilasi ke
 * WebAssembly, hidup di dalam proses Node tanpa server.
 *
 * Kenapa ini ada. Konvensi uji backend CafeOS adalah "tidak ada uji yang
 * menuntut koneksi database", dan alasannya tertulis di `vitest.config.ts`:
 * rangkaian uji yang butuh database cepat atau lambat akan dijalankan seseorang
 * terhadap database sungguhan. Aturan itu tetap berlaku — PGlite tidak
 * melanggarnya, justru menegakkannya. Tidak ada server yang dihubungi, tidak
 * ada `DATABASE_URL` yang dibaca, tidak ada port yang dibuka. Databasenya lahir
 * kosong di memori setiap berkas uji dan mati bersamanya.
 *
 * Yang didapat sebagai gantinya: SQL migrasi benar-benar DIJALANKAN PostgreSQL.
 * Foreign key, CHECK constraint, partial unique index, dan blok `DO $$` diuji
 * oleh mesin yang sama dengan yang kelak menjalankannya di produksi — bukan
 * dibaca sekilas lalu diharapkan benar.
 */

const DIR_MIGRASI = path.join(__dirname, '..', '..', 'prisma', 'migrations');

/** Nama seluruh folder migrasi, terurut sesuai penamaan timestamp Prisma. */
export async function daftarMigrasi(): Promise<string[]> {
  const isi = await readdir(DIR_MIGRASI, { withFileTypes: true });
  return isi
    .filter((entri) => entri.isDirectory())
    .map((entri) => entri.name)
    .sort();
}

/** Isi `migration.sql` sebuah migrasi. */
export async function bacaMigrasi(nama: string): Promise<string> {
  return readFile(path.join(DIR_MIGRASI, nama, 'migration.sql'), 'utf8');
}

/** Isi `migration.down.sql` — naskah rollback yang ditulis tangan. */
export async function bacaRollback(nama: string): Promise<string> {
  return readFile(path.join(DIR_MIGRASI, nama, 'migration.down.sql'), 'utf8');
}

export interface OpsiJalan {
  /**
   * Berhenti SEBELUM migrasi ini dijalankan.
   *
   * Inilah yang membuat uji "migrasi di atas data lama" mungkin: skema lama
   * dibangun dulu, data ditanam di atasnya, baru migrasi barunya dijalankan —
   * persis urutan yang terjadi di server sungguhan.
   */
  berhentiSebelum?: string;
  /** Mulai DARI migrasi ini (inklusif). Pasangan `berhentiSebelum`. */
  mulaiDari?: string;
}

/**
 * Jalankan migrasi berurutan pada koneksi yang diberikan.
 * Mengembalikan nama migrasi yang benar-benar dijalankan.
 */
export async function jalankanMigrasi(
  db: PGlite,
  opsi: OpsiJalan = {},
): Promise<string[]> {
  const semua = await daftarMigrasi();
  const dijalankan: string[] = [];
  let sudahMulai = opsi.mulaiDari === undefined;

  for (const nama of semua) {
    if (!sudahMulai) {
      if (nama !== opsi.mulaiDari) continue;
      sudahMulai = true;
    }
    if (opsi.berhentiSebelum !== undefined && nama === opsi.berhentiSebelum) break;

    const sql = await bacaMigrasi(nama);
    try {
      // `exec` memakai simple query protocol: satu berkas berisi banyak
      // pernyataan — termasuk blok dollar-quoted `DO $$ … $$` — dijalankan apa
      // adanya, sama seperti `psql -f`.
      await db.exec(sql);
    } catch (galat) {
      const pesan = galat instanceof Error ? galat.message : String(galat);
      throw new Error(`Migrasi ${nama} gagal: ${pesan}`);
    }
    dijalankan.push(nama);
  }

  return dijalankan;
}

/** Database kosong baru, di memori, untuk satu berkas uji. */
export async function databaseUji(): Promise<PGlite> {
  return PGlite.create();
}

/** Nama seluruh tabel di schema `public`. */
export async function daftarTabel(db: PGlite): Promise<string[]> {
  const hasil = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  return hasil.rows.map((b) => b.table_name);
}

/** Nama kolom sebuah tabel, terurut. */
export async function daftarKolom(db: PGlite, tabel: string): Promise<string[]> {
  const hasil = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY column_name`,
    [tabel],
  );
  return hasil.rows.map((b) => b.column_name);
}

/** Nama index sebuah tabel — dipakai memastikan unique index memang terpasang. */
export async function daftarIndex(db: PGlite, tabel: string): Promise<string[]> {
  const hasil = await db.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [tabel],
  );
  return hasil.rows.map((b) => b.indexname);
}

/** Definisi sebuah index — untuk memastikan bagian `WHERE`-nya benar-benar ada. */
export async function definisiIndex(
  db: PGlite,
  nama: string,
): Promise<string | null> {
  const hasil = await db.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [nama],
  );
  return hasil.rows[0]?.indexdef ?? null;
}

/** Nama CHECK constraint sebuah tabel. */
export async function daftarCheck(db: PGlite, tabel: string): Promise<string[]> {
  const hasil = await db.query<{ conname: string }>(
    `SELECT c.conname
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = $1 AND c.contype = 'c'
      ORDER BY c.conname`,
    [tabel],
  );
  return hasil.rows.map((b) => b.conname);
}

/** Tipe data sebuah kolom, mis. `bigint` / `numeric` / `uuid`. */
export async function tipeKolom(
  db: PGlite,
  tabel: string,
  kolom: string,
): Promise<string | null> {
  const hasil = await db.query<{ data_type: string }>(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [tabel, kolom],
  );
  return hasil.rows[0]?.data_type ?? null;
}

/**
 * Jalankan sesuatu dan kembalikan pesan galatnya — `null` bila justru berhasil.
 *
 * Dipakai untuk uji yang MENGHARAPKAN penolakan database. Bentuk ini dipilih
 * daripada `expect(...).rejects` supaya pesan galatnya bisa ikut diperiksa:
 * yang penting bukan sekadar "gagal", melainkan gagal karena constraint YANG
 * DIMAKSUD — bukan karena salah ketik nama kolom di ujinya sendiri.
 */
export async function galatDari(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (galat) {
    return galat instanceof Error ? galat.message : String(galat);
  }
}
