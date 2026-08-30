import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Hidden below the `sm` breakpoint to keep mobile tables readable. */
  hideOnMobile?: boolean;
}

interface Props<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}

export default function Table<T>({ columns, rows, rowKey, empty }: Props<T>) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink-600 px-4 py-6 text-center text-xs text-mist-400">
        {empty ?? 'Nothing to show.'}
      </p>
    );
  }

  return (
    // Wide tables scroll inside their own container rather than pushing the
    // page sideways on a phone.
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-ink-700 text-[10px] uppercase tracking-wider text-mist-400">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`pb-2 pr-3 font-semibold ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-ink-800 last:border-b-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-2.5 pr-3 text-mist-200 ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
