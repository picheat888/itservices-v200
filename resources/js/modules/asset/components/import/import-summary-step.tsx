// Last step before the import: one lead sentence, the contract line and small tables by model, warehouse and vendor.
// The Import button sits in the dialog footer (ImportRunButton); a refusal is shown by the dialog above this step.
import { useT } from '@/lang';
import { SaveButton } from '@/shared/components/save-button';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { useMemo } from 'react';
import type { CheckedRow, ImportKind, ImportOptions } from '../../api/assetImportApi';
import { foldAt, summaryGroups, type SummaryEntry } from '../../lib/import-rows';

const FOLD_AT = 5;

interface Props {
    kind: ImportKind;
    fileName: string;
    rows: CheckedRow[];
    options: ImportOptions;
    /** Code of the chosen contract, or null when the assets are left waiting. */
    contractCode: string | null;
    running: boolean;
    onChangeContract: () => void;
}

/** The footer button that runs the import; ignores a second press while the request is out. */
export function ImportRunButton({ running, onRun }: { running: boolean; onRun: () => void }) {
    const t = useT();
    return (
        <SaveButton type="button" loading={running} loadingLabel={t('asset_import_run')} onClick={() => !running && onRun()}>
            {t('asset_import_run')}
        </SaveButton>
    );
}

interface TableSpec {
    key: string;
    head: string;
    entries: SummaryEntry[];
    values: boolean;
}

export function ImportSummaryStep({ kind, fileName, rows, options, contractCode, running, onChangeContract }: Props) {
    const t = useT();
    const fmtN = useNumberFormat();
    const groups = useMemo(() => summaryGroups(rows, options, kind), [rows, options, kind]);
    const total = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.values.value) || 0), 0), [rows]);
    const money = (value: number) => fmtN(value, { decimals: 2 });

    const purchased = kind === 'purchased';
    const oneWarehouse = groups.byWarehouse.length === 1 ? groups.byWarehouse[0][0] : null;
    // Warehouse table only when the rows go to more than one; vendor table only for purchases with values
    const tables: TableSpec[] = [{ key: 'model', head: t('asset_import_by_model'), entries: groups.byModel, values: purchased }];
    if (oneWarehouse === null) tables.push({ key: 'warehouse', head: t('asset_import_by_warehouse'), entries: groups.byWarehouse, values: false });
    if (purchased && groups.byVendor && groups.byVendor.length > 0)
        tables.push({ key: 'vendor', head: t('asset_import_by_vendor'), entries: groups.byVendor, values: true });

    // The lead sentence with the count in bold and the file name kept as written
    const lead = t('asset_import_summary_lead')
        .split(/(\{title\}|\{count\}|\{file\})/)
        .map((part, i) => {
            if (part === '{title}') return t(`asset_import_title_${kind}`);
            if (part === '{count}')
                return (
                    <span key={i} className="font-bold tabular-nums">
                        {fmtN(rows.length)}
                    </span>
                );
            if (part === '{file}')
                return (
                    <span key={i} className="font-medium" translate="no">
                        {fileName}
                    </span>
                );
            return part;
        });

    return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
            <h3 tabIndex={-1} className="text-lg font-bold tracking-tight text-balance">
                {t('asset_import_summary_heading')}
            </h3>

            {/* Lead sentence and warehouse line */}
            <div className="space-y-1">
                <p className="text-base">{lead}</p>
                <p className="text-muted-foreground text-sm">
                    {oneWarehouse !== null
                        ? t('asset_import_summary_one_wh').replace('{warehouse}', oneWarehouse)
                        : t('asset_import_summary_many_wh')}
                </p>
            </div>

            {/* Contract line for rentals, total value for purchases */}
            <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-3 text-sm">
                {kind === 'rented' ? (
                    <>
                        <span className="text-muted-foreground">{t('asset_import_summary_contract')}</span>
                        <span className="font-semibold" translate={contractCode === null ? undefined : 'no'}>
                            {contractCode ?? t('asset_import_summary_contract_none')}
                        </span>
                        <button
                            type="button"
                            onClick={onChangeContract}
                            disabled={running}
                            className="text-brand focus-visible:ring-ring inline-flex min-h-8 items-center rounded px-1 text-sm font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-hidden disabled:opacity-50"
                        >
                            {t('asset_import_summary_change')}
                        </button>
                    </>
                ) : (
                    <span className="font-semibold tabular-nums">{t('asset_import_summary_value').replace('{value}', money(total))}</span>
                )}
            </div>

            {/* Small tables, two columns on wide screens; an odd last one spans the row */}
            <div className="grid gap-3 sm:grid-cols-2">
                {tables.map((table, i) => (
                    <SummaryTable
                        key={table.key}
                        head={table.head}
                        entries={table.entries}
                        values={table.values}
                        money={money}
                        wide={tables.length % 2 === 1 && i === tables.length - 1}
                    />
                ))}
            </div>
        </div>
    );
}

interface TableProps {
    head: string;
    entries: SummaryEntry[];
    values: boolean;
    money: (value: number) => string;
    wide: boolean;
}

// One group table: the first five rows, the rest folded, and a total row when there is more than one
function SummaryTable({ head, entries, values, money, wide }: TableProps) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { shown, rest } = foldAt(entries, FOLD_AT);
    const count = entries.reduce((sum, entry) => sum + entry[1], 0);
    const sum = entries.reduce((acc, entry) => acc + entry[2], 0);

    const line = ([label, n, value]: SummaryEntry) => (
        <tr key={label} className="border-border border-b last:border-0">
            <td className="px-3 py-2">
                <span className="block max-w-[22rem] truncate" title={label}>
                    {label}
                </span>
            </td>
            <td className="w-24 px-3 py-2 text-right tabular-nums">{fmtN(n)}</td>
            {values && <td className="w-32 px-3 py-2 text-right tabular-nums">{money(value)}</td>}
        </tr>
    );

    return (
        <div className={cn('border-border overflow-hidden rounded-lg border', wide && 'sm:col-span-2')}>
            <table className="w-full table-fixed text-sm">
                <caption className="sr-only">{head}</caption>
                <thead>
                    <tr className="dark:bg-muted/50 border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                        <th scope="col" className="px-3 py-2">
                            {head}
                        </th>
                        <th scope="col" className="w-24 px-3 py-2 text-right">
                            {t('asset_import_count')}
                        </th>
                        {values && (
                            <th scope="col" className="w-32 px-3 py-2 text-right">
                                {t('asset_import_value')}
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody>{shown.map(line)}</tbody>
                {rest.length > 0 && (
                    <tbody>
                        <tr>
                            <td colSpan={values ? 3 : 2} className="p-0">
                                {/* Folded rows */}
                                <details>
                                    <summary className="text-brand focus-visible:ring-ring hover:bg-accent flex min-h-9 cursor-pointer items-center px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-hidden">
                                        {t('asset_import_more').replace('{count}', fmtN(rest.length))}
                                    </summary>
                                    <table className="w-full table-fixed text-sm">
                                        <tbody>{rest.map(line)}</tbody>
                                    </table>
                                </details>
                            </td>
                        </tr>
                    </tbody>
                )}
                {entries.length > 1 && (
                    <tfoot>
                        <tr className="border-border bg-muted/40 border-t font-semibold">
                            <td className="px-3 py-2">{t('asset_import_total')}</td>
                            <td className="w-24 px-3 py-2 text-right tabular-nums">{fmtN(count)}</td>
                            {values && <td className="w-32 px-3 py-2 text-right tabular-nums">{money(sum)}</td>}
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}
