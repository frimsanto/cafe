import type { CafeInfo, TableInfo } from '../../types/menu';

interface MenuHeaderProps {
  cafe: CafeInfo;
  table: TableInfo;
}

/**
 * Header menu digital: nama kafe, tagline, dan meja asal (dari QR code).
 */
export default function MenuHeader({ cafe, table }: MenuHeaderProps) {
  return (
    <header className="bg-gradient-to-br from-brand-700 to-brand-900 px-4 pb-6 pt-8 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{cafe.name}</h1>
          <p className="mt-1 text-sm text-brand-100">{cafe.tagline}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold backdrop-blur">
          {table.tableName}
        </span>
      </div>
    </header>
  );
}
