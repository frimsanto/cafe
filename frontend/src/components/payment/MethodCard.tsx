import { useId } from 'react';
import type { MetodePembayaranDTO } from '../../types/api';
import { akibatMetode, metodeInfo } from '../../data/paymentMethods';
import Switch from '../common/Switch';
import PaymentIcon from './PaymentIcon';
import StatusBadge from './StatusBadge';

interface MethodCardProps {
  metode: MetodePembayaranDTO;
  onToggle: (aktif: boolean) => void;
  onAtur: () => void;
  disabled?: boolean;
}

/**
 * Satu metode pembayaran di kasir: nama, penjelasan, badge Manual, sakelar,
 * dan tombol Atur.
 *
 * Bentuknya sengaja berbeda dari halaman lama, yang memberi SETIAP metode aktif
 * cincin oranye tebal. Ketika keempatnya menyala, keempat kartu berteriak
 * sama kerasnya dan tidak ada satu pun yang menonjol — cincin itu berhenti
 * menyampaikan apa pun. Di sini yang aktif cukup ditandai latar kertas dan
 * sakelar hijau; yang perlu perhatian (konfigurasi belum lengkap) yang
 * mendapat aksen amber.
 */
export default function MethodCard({
  metode,
  onToggle,
  onAtur,
  disabled = false,
}: MethodCardProps) {
  const info = metodeInfo(metode.metode);
  const idBantuan = useId();

  const perluDilengkapi = !metode.konfigurasiLengkap;
  const butuhPengaturan = metode.metode === 'QRIS_STATIS' || metode.metode === 'TRANSFER';

  return (
    <article
      className={`rounded-2xl p-4 ring-1 transition ${
        perluDilengkapi
          ? 'bg-amber-50/60 ring-amber-200'
          : metode.aktif
            ? 'bg-warm-paper ring-warm-line'
            : 'bg-warm-cream/60 ring-warm-line'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
            metode.aktif
              ? 'bg-warm-amber/15 text-warm-subtle'
              : 'bg-warm-espresso/5 text-warm-muted'
          }`}
        >
          <PaymentIcon name={info?.icon ?? 'tunai'} size={22} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-bold text-warm-espresso">{info?.name ?? metode.metode}</h3>
            <StatusBadge nada="abu" ikon={null} size="sm">
              Manual
            </StatusBadge>
            {metode.tersediaDiCheckout && (
              <StatusBadge nada="kuning" ikon="info" size="sm">
                Juga di checkout
              </StatusBadge>
            )}
          </div>

          <p id={idBantuan} className="mt-0.5 text-sm text-warm-muted">
            {info?.description}
          </p>
          <p className="mt-1 text-xs text-warm-muted">
            {akibatMetode(metode.metode, metode.wajibVerifikasiKasir)}
          </p>

          {perluDilengkapi && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-800">
              <PaymentIcon name="alert" size={14} className="mt-px shrink-0" />
              {metode.metode === 'QRIS_STATIS'
                ? 'Unggah gambar QRIS dan isi nama merchant sebelum mengaktifkan.'
                : 'Isi nama bank, nomor rekening, dan atas nama sebelum mengaktifkan.'}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Switch
            checked={metode.aktif}
            onChange={onToggle}
            // Metode yang belum lengkap tidak bisa dinyalakan, tapi TETAP bisa
            // dimatikan — kalau tidak, metode yang telanjur aktif lalu
            // konfigurasinya dikosongkan akan terkunci menyala selamanya.
            disabled={disabled || (perluDilengkapi && !metode.aktif)}
            label={`Aktifkan ${info?.name ?? metode.metode}`}
            describedBy={idBantuan}
          />
          {butuhPengaturan || metode.metode === 'EDC' ? (
            <button
              type="button"
              onClick={onAtur}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-warm-subtle underline-offset-2 transition hover:bg-warm-espresso/5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber"
            >
              <PaymentIcon name="sunting" size={13} />
              Atur
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
