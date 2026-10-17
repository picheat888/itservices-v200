// "ประกันใกล้หมดอายุ" report page (/reports/assets-warranty-expiring): shared tabular body + WarrantyCards + its own list cells.
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { TabularReportView } from '../components/tabular-report-view';
import { WarrantyCards, WarrantyStateSegments } from '../components/warranty-cards';

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

/** The model column reads with its brand ("Dell Latitude 5440"). */
function ModelCell({ row }: { row: Row }) {
    const text = [str(row.brand), str(row.model)].filter(Boolean).join(' ');
    return text ? (
        <span className="block max-w-[16rem] truncate" title={text} translate="no">
            {text}
        </span>
    ) : (
        <span className="text-muted-foreground">—</span>
    );
}

/** The holder's name, with their employee code and department under it, as on the transfer report. */
function HolderCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const holder = str(row.holder);
    if (!holder || holder === '—') return <span className="text-muted-foreground">—</span>;
    // "Name (CODE)" for an employee; a shared-use label has no code
    const [, name = holder, code = null] = holder.match(/^(.*) \(([^()]+)\)$/) ?? [];
    const department = row.department as { name?: string; name_th?: string | null } | null;
    const sub = [code, department ? localPair(department.name, department.name_th, lang) : null].filter((s): s is string => Boolean(s));

    return (
        <div className="min-w-0">
            <div className={cn('max-w-[14rem] truncate', code && 'font-medium')} title={name}>
                {name}
            </div>
            {sub.length > 0 && (
                <div className="text-muted-foreground flex max-w-[14rem] gap-x-3 text-xs" title={sub.join('\n')}>
                    {sub.map((part) => (
                        <span key={part} className="truncate">
                            {part}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function warrantyCell(key: string, row: Row) {
    if (key === 'model') return <ModelCell row={row} />;
    if (key === 'holder') return <HolderCell row={row} />;
    return undefined;
}

export default function AssetsWarrantyExpiringReportPage() {
    return (
        <TabularReportView
            reportKey="assets.warranty_expiring"
            extras={{
                tiles: 5,
                // The soon / expired switch narrows only the list, so it sits on the rows card.
                hiddenFilters: ['state'],
                innerColumns: ['brand', 'department'],
                rowsLead: ({ filters, patch }) => <WarrantyStateSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters, patch }) => <WarrantyCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_wty_rows_title',
                renderCell: warrantyCell,
            }}
        />
    );
}
