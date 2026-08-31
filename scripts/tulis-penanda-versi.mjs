#!/usr/bin/env node
/**
 * Tulis penanda versi ke dalam sebuah folder `dist`.
 *
 * ── Kenapa ini perlu ada ──
 *
 * Penggelaran CafeOS memindahkan `dist` lewat `scp`, bukan lewat `git pull`.
 * Akibatnya server tidak pernah tahu kode versi mana yang sedang dijalankannya:
 * `/var/www/cafe-backend/.git` yang ada di sana adalah repo kosong yang nyasar
 * (branch `master`, nol commit), jadi ia justru MENYESATKAN — ia terlihat
 * seperti jawaban padahal bukan.
 *
 * Sebuah berkas kecil yang ikut di dalam `dist` menutup itu: ia bepergian
 * bersama artefak yang benar-benar berjalan, dan tidak bisa menyimpang darinya
 * seperti sebuah tag yang ditempel di repo lokal bisa.
 *
 * Pemakaian:
 *   node scripts/tulis-penanda-versi.mjs --dir dist            (saat build)
 *   node scripts/tulis-penanda-versi.mjs --dir dist --digelar  (saat deploy)
 *
 * `--digelar` hanya menambahkan cap waktu penggelaran ke penanda yang sudah
 * ada; hash commitnya tidak pernah ditulis ulang di server, karena di sanalah
 * ia paling mudah menjadi karangan.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function opsi(nama, bawaan = null) {
  const i = args.indexOf(nama);
  return i === -1 ? bawaan : (args[i + 1] ?? bawaan);
}

const dir = path.resolve(opsi('--dir', 'dist'));
const berkas = path.join(dir, 'VERSION.json');
const stempelSaja = args.includes('--digelar');

if (stempelSaja) {
  const isi = JSON.parse(readFileSync(berkas, 'utf8'));
  isi.digelarPada = new Date().toISOString();
  writeFileSync(berkas, `${JSON.stringify(isi, null, 2)}\n`);
  console.log(`penanda versi distempel: ${berkas} (${isi.commit})`);
  process.exit(0);
}

/** Baca dari git; kosong bila dijalankan di luar worktree. */
function git(perintah) {
  try {
    return execSync(`git ${perintah}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const kotor = git('status --porcelain') !== '';
const penanda = {
  commit: git('rev-parse HEAD') || 'tidak-diketahui',
  commitPendek: git('rev-parse --short HEAD') || 'tidak-diketahui',
  branch: git('rev-parse --abbrev-ref HEAD') || 'tidak-diketahui',
  // Ditandai terang-terangan: artefak yang dibangun dari worktree yang belum
  // bersih TIDAK bisa ditelusuri ke satu commit, dan itu harus terlihat saat
  // seseorang menanyakan versi berapa yang terpasang — bukan disembunyikan.
  worktreeKotor: kotor,
  dibangunPada: new Date().toISOString(),
  digelarPada: null,
};

writeFileSync(berkas, `${JSON.stringify(penanda, null, 2)}\n`);
console.log(
  `penanda versi ditulis: ${berkas} (${penanda.commitPendek}${kotor ? ', worktree KOTOR' : ''})`,
);
