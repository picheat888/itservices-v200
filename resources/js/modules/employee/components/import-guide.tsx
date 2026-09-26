import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { AlertTriangle, Check, ChevronDown, Copy, ListChecks, Search, TableProperties } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { usePositions } from '../hooks/use-positions';
import { useSections } from '../hooks/use-sections';

/**
 * The two things the employee import dialog has to say before anybody opens Excel:
 * what each column wants, and which spellings the free-text columns actually accept.
 *
 * Both are collapsed by default — somebody importing their fifth file does not need
 * to scroll past them — and both read from the live master data, so a department
 * added this morning is on the list this afternoon.
 */

/**
 * The import creates no login. Said up front and left on screen for the whole
 * dialog — including after a successful run, which is exactly when somebody has to
 * go and do something about it.
 */
export function ImportAccountNotice() {
    const t = useT();

    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <div>
                <div className="font-semibold">{t('import_no_account_title')}</div>
                <div className="mt-0.5 leading-relaxed opacity-90">{t('import_no_account_desc')}</div>
            </div>
        </div>
    );
}

/** One collapsible block with a heading row that toggles it. */
function Foldout({ icon: Icon, label, children }: { icon: typeof ListChecks; label: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="border-border overflow-hidden rounded-lg border">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="hover:bg-accent/60 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold"
            >
                <Icon className="text-brand h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                <ChevronDown className={cn('text-muted-foreground h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
            </button>
            {open && <div className="border-border/70 border-t">{children}</div>}
        </div>
    );
}

/** What every column of the template wants, in place of one long sentence. */
function ColumnTable() {
    const t = useT();

    // Keyed rather than written out twice: the lang file holds the sentence, this
    // holds the shape of the table.
    const rows: { column: string; required: 'yes' | 'no' | 'org'; noteKey: Parameters<typeof t>[0] }[] = [
        { column: 'employee_code', required: 'no', noteKey: 'import_col_help_code' },
        { column: 'first_name / last_name', required: 'yes', noteKey: 'import_col_help_name' },
        { column: 'first_name_th / last_name_th', required: 'no', noteKey: 'import_col_help_name_th' },
        { column: 'email', required: 'no', noteKey: 'import_col_help_email' },
        { column: 'phone', required: 'no', noteKey: 'import_col_help_phone' },
        { column: 'department', required: 'org', noteKey: 'import_col_help_department' },
        { column: 'section', required: 'org', noteKey: 'import_col_help_section' },
        { column: 'position', required: 'yes', noteKey: 'import_col_help_position' },
        { column: 'joined_at', required: 'no', noteKey: 'import_col_help_joined' },
        { column: 'report_to_employee_code', required: 'org', noteKey: 'import_col_help_report_to' },
    ];

    return (
        <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs">
                <tbody className="divide-border/60 divide-y">
                    {rows.map((row) => (
                        <tr key={row.column} className="align-top">
                            <td className="px-3 py-1.5 font-mono text-[11px] font-medium whitespace-nowrap">{row.column}</td>
                            <td className="px-1 py-1.5 whitespace-nowrap">
                                {row.required === 'yes' && <span className="text-destructive font-bold">*</span>}
                                {row.required === 'org' && <span className="text-amber-600 dark:text-amber-400">*</span>}
                            </td>
                            <td className="text-muted-foreground px-3 py-1.5 leading-relaxed">{t(row.noteKey)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-muted-foreground border-border/70 border-t px-3 py-2 text-[11px] leading-relaxed">
                <span className="text-destructive font-bold">*</span> {t('import_required_always')}
                {' · '}
                <span className="font-bold text-amber-600 dark:text-amber-400">*</span> {t('import_required_org')}
            </p>
        </div>
    );
}

/** One row of the valid-values list: the value, where it lives, and its aliases. */
interface ValueRow {
    key: string;
    value: string;
    where: string | null;
    aliases: string[];
}

/** The spellings the free-text columns accept, straight from the master data. */
function ValidValues() {
    const t = useT();
    const [tab, setTab] = useState<'department' | 'section' | 'position'>('department');
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    const { data: departments } = useDepartments();
    const { data: sections } = useSections();
    const { data: positions } = usePositions();

    const departmentName = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments]);

    const rows: ValueRow[] = useMemo(() => {
        if (tab === 'department') {
            return (departments ?? []).map((d) => ({
                key: `d${d.id}`,
                value: d.name,
                where: null,
                aliases: [d.tag, d.code, d.name_th].filter((a): a is string => !!a && a !== d.name),
            }));
        }
        if (tab === 'section') {
            return (sections ?? []).map((s) => ({
                key: `s${s.id}`,
                // A section only resolves inside its own department, so the department
                // is part of the answer rather than a footnote.
                value: s.name,
                where: s.department ?? departmentName.get(s.department_id) ?? null,
                aliases: [s.code, s.name_th].filter((a): a is string => !!a && a !== s.name),
            }));
        }
        return (positions ?? []).map((p) => ({
            key: `p${p.id}`,
            value: p.title,
            where: null,
            aliases: [p.code].filter((a): a is string => !!a),
        }));
    }, [tab, departments, sections, positions, departmentName]);

    const term = search.trim().toLowerCase();
    const shown = term ? rows.filter((row) => [row.value, row.where ?? '', ...row.aliases].some((text) => text.toLowerCase().includes(term))) : rows;

    const copy = (row: ValueRow) => {
        void navigator.clipboard?.writeText(row.value);
        setCopied(row.key);
        setTimeout(() => setCopied((current) => (current === row.key ? null : current)), 1200);
    };

    const tabs = [
        { key: 'department' as const, label: t('department'), count: departments?.length ?? 0 },
        { key: 'section' as const, label: t('emp_section'), count: sections?.length ?? 0 },
        { key: 'position' as const, label: t('position'), count: positions?.length ?? 0 },
    ];

    return (
        <div>
            <div className="border-border/70 flex items-center gap-1 border-b px-2 py-1.5">
                {tabs.map((one) => (
                    <button
                        key={one.key}
                        type="button"
                        onClick={() => setTab(one.key)}
                        className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                            tab === one.key ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-accent',
                        )}
                    >
                        {one.label}
                        <span className="ml-1 opacity-70">{one.count}</span>
                    </button>
                ))}
            </div>

            <div className="px-2 py-2">
                <div className="relative">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('search_placeholder_short')}
                        className="h-8 pl-8 text-xs"
                    />
                </div>
            </div>

            <div className="max-h-56 overflow-y-auto px-2 pb-2">
                {shown.length === 0 ? (
                    <p className="text-muted-foreground px-1 py-3 text-center text-xs">{t('import_values_none')}</p>
                ) : (
                    shown.map((row) => (
                        <button
                            key={row.key}
                            type="button"
                            onClick={() => copy(row)}
                            title={t('import_copy_value')}
                            className="hover:bg-accent group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">{row.value}</span>
                                <span className="text-muted-foreground block truncate text-[11px]">
                                    {row.where && <span className="mr-1.5">↳ {row.where}</span>}
                                    {row.aliases.length > 0 && <span className="font-mono">{row.aliases.join(' · ')}</span>}
                                </span>
                            </span>
                            {copied === row.key ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : (
                                <Copy className="text-muted-foreground h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100" />
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

/** Both foldouts, as the import dialog's `guide` slot. */
export function ImportEmployeeGuide() {
    const t = useT();

    return (
        <div className="space-y-2">
            <Foldout icon={TableProperties} label={t('import_guide_columns')}>
                <ColumnTable />
            </Foldout>
            <Foldout icon={ListChecks} label={t('import_guide_values')}>
                <ValidValues />
            </Foldout>
        </div>
    );
}
