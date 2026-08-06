import { useT } from '@/lang';
import { AlertCircle } from 'lucide-react';
import { Fragment } from 'react';
import type { ImportPreviewRow } from '../api/employeeApi';

/**
 * The dry-run of an employee CSV import, row by row: what each free-text column
 * resolved to in the master data, and — under the row itself — why a row cannot be
 * saved. Rows are shown in file order so a number here matches a line in Excel.
 */
export function ImportPreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
    const t = useT();

    return (
        <div className="border-border max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground sticky top-0">
                    <tr>
                        <th className="px-2 py-1.5 font-semibold">{t('import_row')}</th>
                        <th className="px-2 py-1.5 font-semibold">{t('import_col_code')}</th>
                        <th className="px-2 py-1.5 font-semibold">{t('import_col_name')}</th>
                        <th className="px-2 py-1.5 font-semibold">{t('department')}</th>
                        <th className="px-2 py-1.5 font-semibold">{t('emp_section')}</th>
                        <th className="px-2 py-1.5 font-semibold">{t('position')}</th>
                        <th className="px-2 py-1.5 font-semibold">{t('emp_manager')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const failed = row.errors.length > 0;
                        return (
                            <Fragment key={row.row}>
                                <tr className={failed ? 'bg-destructive/5' : undefined}>
                                    <td className="text-muted-foreground px-2 py-1 font-mono">{row.row}</td>
                                    <td className="px-2 py-1 font-mono">{row.employee_code ?? '—'}</td>
                                    <td className="px-2 py-1 font-medium">{row.name || '—'}</td>
                                    <td className="px-2 py-1">{row.department ?? '—'}</td>
                                    <td className="px-2 py-1">{row.section ?? '—'}</td>
                                    <td className="px-2 py-1">{row.position ?? '—'}</td>
                                    <td className="px-2 py-1 font-mono">{row.report_to ?? '—'}</td>
                                </tr>
                                {failed && (
                                    <tr className="bg-destructive/5">
                                        <td />
                                        <td colSpan={6} className="text-destructive px-2 pb-1.5">
                                            <span className="flex items-start gap-1">
                                                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                                <span>{row.errors.join(', ')}</span>
                                            </span>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
