import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { matchesAllWords } from '@/shared/lib/search-words';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { AlertTriangle, Check, ChevronDown, Copy, ListChecks, Search, TableProperties } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { usePositions } from '../hooks/use-positions';
import { useSections } from '../hooks/use-sections';

// Employee import guide: the no-account notice, the column table and the valid-values list (live master data).

/** The import creates no login; stays on screen for the whole dialog. */
export function ImportAccountNotice() {
    const t = useT();

    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <div>
                <div className="font-semibold">{t('import_no_account_title')}</div>
                <div className="mt-0.5 leading-relaxed">{t('import_no_account_desc')}</div>
            </div>
        </div>
    );
}

/** One collapsible block with a heading row that toggles it. */
function Foldout({ icon: Icon, label, children }: { icon: typeof ListChecks; label: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    return (
        <div className="border-border overflow-hidden rounded-lg border">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={panelId}
                className="hover:bg-accent/60 focus-visible:ring-ring flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
            >
                <Icon className="text-brand h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{label}</span>
                <ChevronDown className={cn('text-muted-foreground h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {open && (
                <div id={panelId} className="border-border/70 border-t">
                    {children}
                </div>
            )}
        </div>
    );
}

/** Text tag telling "always required" from "required for a normal position". */
function RequiredTag({ kind }: { kind: 'yes' | 'org' }) {
    const t = useT();

    return (
        <span
            className={cn(
                'inline-block rounded px-1.5 py-px text-[10.5px] leading-4 font-semibold whitespace-nowrap',
                kind === 'yes' ? 'bg-destructive/10 dark:text-destructive text-red-700' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            )}
        >
            {kind === 'yes' ? t('import_req_tag_always') : t('import_req_tag_org')}
        </span>
    );
}

/** What every column of the template wants, in place of one long sentence. */
function ColumnTable() {
    const t = useT();

    // The lang file holds the sentence, this holds the shape of the table
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
                            <td className="px-3 py-1.5 text-[11px] font-medium whitespace-nowrap">{row.column}</td>
                            <td className="px-1 py-1.5 whitespace-nowrap">{row.required !== 'no' && <RequiredTag kind={row.required} />}</td>
                            <td className="text-muted-foreground px-3 py-1.5 leading-relaxed">{t(row.noteKey)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="text-muted-foreground border-border/70 space-y-1 border-t px-3 py-2 text-[11px] leading-relaxed">
                <p>
                    <RequiredTag kind="yes" /> {t('import_required_always')}
                </p>
                <p>
                    <RequiredTag kind="org" /> {t('import_required_org')}
                </p>
            </div>
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
    const fmtN = useNumberFormat();
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
                // A section only resolves inside its own department
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

    const shown = rows.filter((row) => matchesAllWords([row.value, row.where ?? '', ...row.aliases].join(' '), search));

    const copy = async (row: ValueRow) => {
        try {
            await navigator.clipboard.writeText(row.value);
        } catch {
            return;
        }
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
            <div role="group" aria-label={t('import_guide_values')} className="border-border/70 flex items-center gap-1 border-b px-2 py-1.5">
                {tabs.map((one) => (
                    <button
                        key={one.key}
                        type="button"
                        onClick={() => setTab(one.key)}
                        aria-pressed={tab === one.key}
                        className={cn(
                            'focus-visible:ring-ring rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                            tab === one.key ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:bg-accent',
                        )}
                    >
                        {one.label}
                        <span className="ml-1 font-semibold tabular-nums">{fmtN(one.count)}</span>
                    </button>
                ))}
            </div>

            <div className="px-2 py-2">
                <div className="relative">
                    <Search
                        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                        aria-hidden
                    />
                    <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label={t('import_values_search')}
                        placeholder={t('search_placeholder_short')}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-8 pl-8 text-xs"
                    />
                </div>
            </div>

            <div className="max-h-56 overflow-y-auto px-2 pb-2">
                {shown.length === 0 ? (
                    <EmptyState
                        kind="search"
                        title={t('emp_empty_import_values')}
                        hint={t('emp_empty_import_values_hint')}
                        className="min-h-0 py-4"
                    />
                ) : (
                    shown.map((row) => (
                        <button
                            key={row.key}
                            type="button"
                            onClick={() => void copy(row)}
                            title={t('import_copy_value')}
                            className="hover:bg-accent focus-visible:ring-ring group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-hidden"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">{row.value}</span>
                                <span className="text-muted-foreground block truncate text-[11px]">
                                    {row.where && <span className="mr-1.5">↳ {row.where}</span>}
                                    {row.aliases.length > 0 && <span>{row.aliases.join(', ')}</span>}
                                </span>
                            </span>
                            {copied === row.key ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
                            ) : (
                                <Copy
                                    className="text-muted-foreground h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                                    aria-hidden
                                />
                            )}
                        </button>
                    ))
                )}
            </div>

            {/* Announces a successful copy */}
            <span className="sr-only" aria-live="polite">
                {copied ? t('cred_copied') : ''}
            </span>
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
