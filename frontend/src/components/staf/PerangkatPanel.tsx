import { useEffect, useState } from 'react';
import type { PerangkatBaruDTO, PerangkatDTO } from '../../types/staf';
import { describeApiError } from '../../lib/apiClient';

interface Props {
  perangkat: PerangkatDTO[];
  loading: boolean;
  sibuk: boolean;
  onDaftarkan: (label: string) => Promise<PerangkatBaruDTO>;
  onTerbitkanKode: (p: PerangkatDTO) => Promise<PerangkatBaruDTO>;
  onCabut: (p: PerangkatDTO) => void;
}

/**
 * Daftar terminal POS milik kafe.
 *
 * ── Apa yang berubah, dan kenapa ──
 *
 * Panel ini dulu menampilkan TOKEN perangkat: 64 karakter heksadesimal yang
 * harus dibawa pemilik ke tablet kasir. Yang terjadi di produksi persis yang
 * bisa ditebak — tokennya tertempel ke kolom nama, tiga terminal lahir bernama
 * `0b41506b3ca29a87…`, `budiman@gmail.com`, dan `123123`, lalu ketiganya
 * dicabut dalam dua setengah menit tanpa satu pun pernah terpasang.
 *
 * Sekarang yang muncul adalah KODE PEMASANGAN: pendek, bisa dibaca dengan
 * suara, bisa diketik dari seberang ruangan. Tokennya tidak pernah lagi
 * terlihat siapa pun.
 *
 * ── Dua daftar, bukan satu ──
 *
 * Terminal yang dicabut pindah ke Riwayat. Sebelumnya ia tetap duduk di daftar
 * utama dengan opacity 60% — cukup untuk membuat layar yang isinya lima
 * terminal mati terlihat seperti kafe yang punya lima terminal, padahal yang
 * aktif nol.
 */
export default function PerangkatPanel({
  perangkat,
  loading,
  sibuk,
  onDaftarkan,
  onTerbitkanKode,
  onCabut,
}: Props) {
  const [label, setLabel] = useState('');
  const [kodeBaru, setKodeBaru] = useState<PerangkatBaruDTO | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [mendaftar, setMendaftar] = useState(false);

  const aktif = perangkat.filter((p) => p.aktif);
  const riwayat = perangkat.filter((p) => !p.aktif);

  const daftarkan = async () => {
    const bersih = label.trim();
    if (bersih === '') return setGalat('Nama terminal wajib diisi.');

    setMendaftar(true);
    setGalat(null);
    try {
      setKodeBaru(await onDaftarkan(bersih));
      setLabel('');
    } catch (err) {
      setGalat(describeApiError(err, 'Gagal mendaftarkan terminal.'));
    } finally {
      setMendaftar(false);
    }
  };

  const terbitkanUlang = async (p: PerangkatDTO) => {
    setGalat(null);
    try {
      setKodeBaru(await onTerbitkanKode(p));
    } catch (err) {
      setGalat(describeApiError(err, 'Gagal menerbitkan kode baru.'));
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-muted">
        Terminal POS
      </h2>
      <p className="mt-1 text-sm text-warm-muted">
        Perangkat yang dipercaya menagih di kafe ini. Kasir cukup memasukkan PIN
        di terminal terdaftar — tanpa mengetik email dan kata sandi tiap
        pergantian.
      </p>

      {kodeBaru && <KartuKode data={kodeBaru} onTutup={() => setKodeBaru(null)} />}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="mis. Kasir Depan"
          aria-label="Nama terminal"
          className="min-w-0 flex-1 rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        />
        <button
          type="button"
          onClick={() => void daftarkan()}
          disabled={mendaftar || sibuk}
          className="rounded-xl border border-warm-line px-4 py-2 text-sm font-medium text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-50"
        >
          {mendaftar ? 'Mendaftarkan…' : 'Daftarkan Terminal'}
        </button>
      </div>
      {galat && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-warm-danger">
          {galat}
        </p>
      )}

      {loading ? (
        <div className="mt-3 skeleton-warm h-16 rounded-2xl" />
      ) : aktif.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-warm-line px-4 py-6 text-center text-sm text-warm-muted">
          Belum ada terminal aktif. Daftarkan satu di atas, lalu masukkan kodenya
          di layar <code className="font-mono">/kasir</code> pada tablet kasir.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {aktif.map((p) => (
            <BarisTerminal
              key={p.id}
              p={p}
              sibuk={sibuk}
              onCabut={onCabut}
              onTerbitkanKode={() => void terbitkanUlang(p)}
            />
          ))}
        </ul>
      )}

      {riwayat.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-warm-muted">
            Riwayat — {riwayat.length} terminal dicabut
          </summary>
          <ul className="mt-2 space-y-1.5">
            {riwayat.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warm-line/60 px-3 py-2 text-xs text-warm-muted"
              >
                <span className="font-medium">{p.label}</span>
                <span>
                  Dicabut{' '}
                  {p.dicabutPada
                    ? new Date(p.dicabutPada).toLocaleDateString('id-ID')
                    : '—'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * Satu terminal aktif.
 *
 * Tiga keadaan yang harus bisa dibedakan sekilas, karena tindakannya berbeda:
 * MENUNGGU (kode masih hidup — bawa ke tablet), KODE HABIS (terbitkan ulang),
 * TERPASANG (tidak perlu apa-apa).
 */
function BarisTerminal({
  p,
  sibuk,
  onCabut,
  onTerbitkanKode,
}: {
  p: PerangkatDTO;
  sibuk: boolean;
  onCabut: (p: PerangkatDTO) => void;
  onTerbitkanKode: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warm-line bg-warm-paper/60 px-3.5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-warm-espresso">{p.label}</span>

          {p.terpasang ? (
            <span className="rounded-md bg-warm-success/15 px-1.5 py-0.5 text-xs font-medium text-warm-success">
              Terpasang
            </span>
          ) : p.kodeBerlaku ? (
            <span className="rounded-md bg-warm-amber/20 px-1.5 py-0.5 text-xs font-medium text-warm-espresso">
              Menunggu pemasangan
            </span>
          ) : (
            <span className="rounded-md bg-warm-line/50 px-1.5 py-0.5 text-xs text-warm-muted">
              Kode kedaluwarsa
            </span>
          )}

          {p.shiftAktif && (
            <span className="rounded-md bg-warm-success/15 px-1.5 py-0.5 text-xs font-medium text-warm-success">
              {p.shiftAktif.kasir} sedang bertugas
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-warm-muted">
          {p.terpasang
            ? p.terakhirDipakai
              ? `Terakhir dipakai ${new Date(p.terakhirDipakai).toLocaleString('id-ID')}`
              : 'Terpasang, belum dipakai menagih'
            : 'Belum pernah dipasangkan ke perangkat mana pun'}
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        {!p.terpasang && (
          <button
            type="button"
            disabled={sibuk}
            onClick={onTerbitkanKode}
            className="rounded-lg border border-warm-line px-2.5 py-1.5 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-50"
          >
            {p.kodeBerlaku ? 'Lihat kode baru' : 'Terbitkan kode'}
          </button>
        )}
        <button
          type="button"
          disabled={sibuk}
          onClick={() => onCabut(p)}
          className="rounded-lg border border-warm-line px-2.5 py-1.5 text-xs font-medium text-warm-muted transition hover:bg-warm-line/30 disabled:opacity-50"
        >
          Cabut
        </button>
      </div>
    </li>
  );
}

/**
 * Kartu kode pemasangan — yang dibaca pemilik lalu diketik di tablet.
 *
 * Kodenya besar dan berjarak karena ia memang untuk DIBACA, kerap dengan suara
 * ke seseorang di seberang ruangan. Hitung mundurnya ada supaya "kenapa kodenya
 * ditolak" terjawab sebelum ditanyakan.
 */
function KartuKode({
  data,
  onTutup,
}: {
  data: PerangkatBaruDTO;
  onTutup: () => void;
}) {
  const [tersalin, setTersalin] = useState(false);
  const [sisa, setSisa] = useState(() => sisaDetik(data.perangkat.kodeBerlakuHingga));

  useEffect(() => {
    setSisa(sisaDetik(data.perangkat.kodeBerlakuHingga));
    const id = setInterval(
      () => setSisa(sisaDetik(data.perangkat.kodeBerlakuHingga)),
      1000,
    );
    return () => clearInterval(id);
  }, [data.perangkat.kodeBerlakuHingga]);

  const habis = sisa <= 0;

  return (
    <div className="mt-3 rounded-2xl border border-warm-amber/40 bg-warm-amber/5 p-4">
      <h3 className="text-sm font-semibold text-warm-espresso">
        Kode pemasangan untuk &ldquo;{data.perangkat.label}&rdquo;
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          className="flex-1 rounded-xl bg-white px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.2em] text-warm-espresso"
          aria-label={`Kode pemasangan ${data.kode}`}
        >
          {data.kode}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(data.kode).then(
              () => setTersalin(true),
              () => setTersalin(false),
            );
          }}
          className="shrink-0 rounded-xl border border-warm-line bg-white px-4 py-3 text-sm font-medium text-warm-espresso transition hover:bg-warm-line/30"
        >
          {tersalin ? 'Tersalin' : 'Salin Kode'}
        </button>
      </div>

      <p className={`mt-2 text-xs ${habis ? 'text-warm-danger' : 'text-warm-muted'}`}>
        {habis
          ? 'Kode ini sudah kedaluwarsa. Tekan "Terbitkan kode" pada terminalnya untuk membuat yang baru.'
          : `Berlaku ${formatSisa(sisa)} lagi, dan hanya bisa dipakai sekali.`}
      </p>

      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-warm-muted">
        <li>
          Buka <code className="font-mono text-warm-espresso">/kasir</code> di tablet
          yang akan dipakai menagih.
        </li>
        <li>Masukkan kode di atas pada layar Pasang Terminal.</li>
        <li>Sesudah itu tablet itu dikenali selamanya — kode tidak diminta lagi.</li>
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/kasir"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-warm-line bg-white px-3 py-2 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30"
        >
          Buka Layar Kasir
        </a>
        <button
          type="button"
          onClick={onTutup}
          className="rounded-lg px-3 py-2 text-xs font-medium text-warm-muted underline"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}

/** Sisa umur kode dalam detik; 0 bila sudah lewat atau tidak diketahui. */
function sisaDetik(berlakuHingga: string | null): number {
  if (!berlakuHingga) return 0;
  const selisih = new Date(berlakuHingga).getTime() - Date.now();
  return selisih > 0 ? Math.floor(selisih / 1000) : 0;
}

function formatSisa(detik: number): string {
  const m = Math.floor(detik / 60);
  const d = detik % 60;
  return m > 0 ? `${m} menit ${d} detik` : `${d} detik`;
}
