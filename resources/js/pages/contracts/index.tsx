import { ContractDetailDrawer } from '@/components/contracts/contract-detail-drawer';
import { ContractFormDrawer } from '@/components/contracts/contract-form-drawer';
import { ImportContractDialog } from '@/components/contracts/import-contract-dialog';
import { TableSkeleton } from '@/components/shared/skeletons';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useContract, useContracts, useContractSummary } from '@/hooks/use-contracts';
import { useCurrency } from '@/hooks/use-settings';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Contract, ContractStatus, ContractType, Role } from '@/types';
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    FileText,
    Import,
    Plus,
    Search,
    TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Tab = 'dashboard' | 'all' | 'expiring';

function StatCard({ label, value, hint, hintDanger, icon: Icon }: { label: string; value: string | number; hint?: string; hintDanger?: boolean; icon: typeof FileText }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            {hint && <div className={cn('mt-1 text-xs', hintDanger ? 'text-red-500' : 'text-muted-foreground')}>{hint}</div>}
        </Card>
    );
}

/** Days-remaining cell: gray when cancelled, blue far out, amber inside the reminder window, red once expired. */
function DaysCell({ days, inReminder, status }: { days: number; inReminder: boolean; status: ContractStatus }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (status === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (days <= 0) return <StatusBadge tone="red">{lang === 'th' ? `หมดอายุไป ${-days} วัน` : `Expired ${-days}d ago`}</StatusBadge>;
    if (inReminder)
        return (
            <StatusBadge tone="amber">
                {days} {lang === 'th' ? 'วัน' : 'days'}
            </StatusBadge>
        );
    return <StatusBadge tone="blue">{days}d</StatusBadge>;
}

const TYPE_TONE: Record<ContractType, 'blue' | 'violet' | 'amber' | 'green' | 'gray'> = {
    software: 'blue',
    hardware: 'violet',
    service: 'amber',
    connectivity: 'green',
    other: 'gray',
};

export default function ContractsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const isSuper = role === 'super';
    const canCreate = isSuper || perms.includes('contracts.create');
    const canEdit = isSuper || perms.includes('contracts.edit');
    const canImport = isSuper || perms.includes('contracts.import');

    const [tab, setTab] = useState<Tab>('dashboard');
    const [search, setSearch] = useState('');
    const ALL_TYPES = '__all__';
    const [typeFilter, setTypeFilter] = useState<ContractType | ''>('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Contract | null>(null);
    const [importOpen, setImportOpen] = useState(false);

    const { data: summary } = useContractSummary();
    const listEnabledTab = tab === 'expiring' ? 'expiring' : 'all';
    const { data: listData, isLoading } = useContracts({ page, per_page: perPage, search, tab: listEnabledTab, type: typeFilter || undefined });
    const { data: selected } = useContract(selectedId);

    // Deep-link from a notification: /contracts?view=<id> opens that contract's
    // detail dialog, then clears the param so it doesn't reopen on refresh.
    const [searchParams, setSearchParams] = useSearchParams();
    const viewId = searchParams.get('view');
    useEffect(() => {
        if (!viewId) return;
        setSelectedId(Number(viewId));
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewId]);

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (c: Contract) => {
        setSelectedId(null);
        setEditing(c);
        setFormOpen(true);
    };

    const maxVendor = summary?.top_vendors?.[0]?.amount ?? 1;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('contracts_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('contracts_sub')}</p>
                </div>
                <div className="flex gap-2">
                    {canImport && (
                        <Button variant="outline" onClick={() => setImportOpen(true)}>
                            <Import className="h-4 w-4" />
                            {t('import_contract')}
                        </Button>
                    )}
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('new_contract')}
                        </Button>
                    )}
                </div>
            </div>

            {!!summary?.expiring && (
                <Card className="border-amber-500/40 bg-amber-500/5 p-4">
                    <div className="flex items-center gap-3.5">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-5 w-5" />
                        </span>
                        <div className="flex-1">
                            <div className="font-bold">
                                {lang === 'th'
                                    ? `มีสัญญา ${summary.expiring} ฉบับใกล้หมดอายุ`
                                    : `${summary.expiring} contract${summary.expiring !== 1 ? 's' : ''} expiring soon`}
                            </div>
                            <div className="text-muted-foreground text-xs">
                                {lang === 'th'
                                    ? 'ระบบจะส่งอีเมลแจ้งเตือนตามที่กำหนดไว้ในแต่ละสัญญา ก่อนหมดอายุ'
                                    : 'Email notifications will be sent according to the reminder window set on each contract.'}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setTab('expiring');
                                setPage(1);
                            }}
                        >
                            {lang === 'th' ? 'ตรวจสอบ' : 'Review'} →
                        </Button>
                    </div>
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="border-border flex gap-1 border-b px-2">
                    {(
                        [
                            { id: 'dashboard', label: t('sub_dashboard') },
                            { id: 'all', label: t('all_contracts'), count: summary?.total },
                            { id: 'expiring', label: t('expiring_soon'), count: summary?.expiring, warn: true },
                        ] as { id: Tab; label: string; count?: number; warn?: boolean }[]
                    ).map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => {
                                setTab(tb.id);
                                setPage(1);
                                setTypeFilter('');
                            }}
                            className={cn(
                                'relative px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && (
                                <span className={cn('ml-1.5 font-mono text-xs', tb.warn ? 'text-amber-600 dark:text-amber-400' : 'opacity-60')}>
                                    {tb.count}
                                </span>
                            )}
                            {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' ? (
                    <DashboardTab summary={summary} maxVendor={maxVendor} onSelect={setSelectedId} />
                ) : (
                    <>
                        <div className="border-border flex flex-wrap items-center gap-2 border-b p-3">
                            <p className="text-muted-foreground mr-auto text-sm">{tab === 'expiring' ? t('expiring_soon_hint') : t('all_contracts_hint')}</p>
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={`${t('contract_vendor')} / ${t('contract_title')}`}
                                    className="h-9 pl-9"
                                />
                            </div>
                            <Select
                                value={typeFilter || ALL_TYPES}
                                onValueChange={(v) => {
                                    setTypeFilter(v === ALL_TYPES ? '' : (v as ContractType));
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL_TYPES}>{lang === 'th' ? 'ทุกประเภท' : 'All types'}</SelectItem>
                                    <SelectItem value="software">{t('contract_type_software')}</SelectItem>
                                    <SelectItem value="hardware">{t('contract_type_hardware')}</SelectItem>
                                    <SelectItem value="service">{t('contract_type_service')}</SelectItem>
                                    <SelectItem value="connectivity">{t('contract_type_connectivity')}</SelectItem>
                                    <SelectItem value="other">{t('contract_type_other')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {isLoading ? (
                            <div className="p-4">
                                <TableSkeleton rows={8} cols={8} />
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="text-muted-foreground px-4 py-16 text-center text-sm">{t('contract_none')}</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="px-4 py-2.5">{t('contract_code')}</th>
                                            <th className="px-4 py-2.5">{t('contract_title')}</th>
                                            <th className="px-4 py-2.5">{t('contract_vendor')}</th>
                                            <th className="px-4 py-2.5">{t('contract_type')}</th>
                                            <th className="px-4 py-2.5">{t('contract_start')}</th>
                                            <th className="px-4 py-2.5">{t('contract_end')}</th>
                                            <th className="px-4 py-2.5">{t('contract_days_remaining')}</th>
                                            <th className="px-4 py-2.5">{t('contract_value')}</th>
                                            <th className="px-4 py-2.5">{t('status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((c) => (
                                            <tr
                                                key={c.id}
                                                onClick={() => setSelectedId(c.id)}
                                                className="border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0"
                                            >
                                                <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{c.code}</td>
                                                <td className="max-w-[280px] truncate px-4 py-2.5">
                                                    {c.title || <span className="text-muted-foreground">—</span>}
                                                </td>
                                                <td className="px-4 py-2.5 font-medium">{c.vendor}</td>
                                                <td className="px-4 py-2.5">
                                                    <StatusBadge tone={TYPE_TONE[c.type]}>
                                                        {t(`contract_type_${c.type}`)}
                                                    </StatusBadge>
                                                </td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{c.start}</td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{c.end}</td>
                                                <td className="px-4 py-2.5">
                                                    <DaysCell days={c.days_remaining} inReminder={c.in_reminder} status={c.status} />
                                                </td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{c.value_display}</td>
                                                <td className="px-4 py-2.5">
                                                    <StatusBadge
                                                        tone={c.status === 'cancelled' ? 'gray' : c.status === 'expired' ? 'red' : 'green'}
                                                    >
                                                        {c.status === 'cancelled'
                                                            ? t('contract_cancelled')
                                                            : c.status === 'expired'
                                                              ? lang === 'th' ? 'หมดอายุ' : 'Expired'
                                                              : lang === 'th' ? 'ใช้งาน' : 'Active'}
                                                    </StatusBadge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {meta && rows.length > 0 && (
                            <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                                    <Select
                                        value={String(perPage)}
                                        onValueChange={(v) => {
                                            setPerPage(Number(v));
                                            setPage(1);
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-[72px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[20, 50, 100].map((n) => (
                                                <SelectItem key={n} value={String(n)}>
                                                    {n}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span>
                                        {meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1}–
                                        {Math.min(meta.current_page * meta.per_page, meta.total)} {lang === 'th' ? 'จาก' : 'of'} {meta.total}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            disabled={page <= 1}
                                            className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <span className="text-foreground px-1 font-medium">
                                            {meta.current_page} / {meta.last_page}
                                        </span>
                                        <button
                                            onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                                            disabled={page >= meta.last_page}
                                            className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>

            <ContractDetailDrawer
                contract={selected ?? null}
                onClose={() => setSelectedId(null)}
                onEdit={openEdit}
                canEdit={canEdit}
            />
            <ContractFormDrawer open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
            <ImportContractDialog open={importOpen} onClose={() => setImportOpen(false)} />
        </div>
    );
}

function DashboardTab({
    summary,
    maxVendor,
    onSelect,
}: {
    summary: ReturnType<typeof useContractSummary>['data'];
    maxVendor: number;
    onSelect: (id: number) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { symbol } = useCurrency();

    if (!summary)
        return (
            <div className="p-6">
                <TableSkeleton rows={4} cols={2} />
            </div>
        );

    // 12-month window starting 2 months back, so the current month (NOW) sits in
    // the third column and recently-expired contracts stay visible to its left.
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
        const offset = i - 2;
        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        return {
            key: `${d.getFullYear()}-${d.getMonth()}`,
            label: d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short' }),
            year: d.getFullYear(),
            isNow: offset === 0,
        };
    });

    // Place each contract at its true position along the axis (0–1 across the 12
    // months) by its expiry day, then stack into lanes so near-overlapping dots
    // spread vertically instead of piling on one spot — a real scatter timeline.
    const points = summary.timeline
        .map((c) => {
            const [y, mo, day] = c.end.split('-').map(Number);
            let idx = months.findIndex((m) => m.key === `${y}-${mo - 1}`);
            let within = 0.5;
            if (idx === -1) {
                // Outside the window: pin already-expired to the far left, far-future to the right.
                idx = c.days <= 0 ? 0 : 11;
                within = c.days <= 0 ? 0.1 : 0.9;
            } else {
                const daysInMonth = new Date(y, mo, 0).getDate();
                within = Math.min(0.95, Math.max(0.05, (day - 0.5) / daysInMonth));
            }
            return { c, frac: (idx + within) / 12 };
        })
        .sort((a, b) => a.frac - b.frac);

    const MIN_GAP = 0.03; // dots closer than 3% of the axis get pushed to a new lane
    const laneLastFrac: number[] = [];
    const placed = points.map((p) => {
        let lane = 0;
        while (lane < laneLastFrac.length && p.frac - laneLastFrac[lane] < MIN_GAP) {
            lane++;
        }
        laneLastFrac[lane] = p.frac;
        return { ...p, lane };
    });
    const laneCount = Math.max(1, laneLastFrac.length);
    const plotHeight = Math.max(64, laneCount * 16 + 16);

    return (
        <div className="space-y-6 p-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('contract_total')} value={summary.total} icon={FileText} />
                <StatCard label={t('contract_active')} value={summary.active} icon={CheckCircle2} />
                <StatCard
                    label={t('expiring_soon')}
                    value={summary.expiring}
                    hint={lang === 'th' ? 'ตามช่วงแจ้งเตือนสัญญา' : 'within reminder window'}
                    hintDanger
                    icon={Clock}
                />
                <StatCard
                    label={t('contract_annual_value')}
                    value={summary.annual_value}
                    hint={lang === 'th' ? 'ไม่รวมสัญญาที่ยกเลิก' : 'excluding cancelled'}
                    icon={TrendingUp}
                />
            </div>

            {/* Expiry timeline — 12 months, starting 2 months back with NOW in the third column */}
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('contract_timeline')}</span>
                    <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <span className="bg-brand h-2 w-2 rounded-full" />
                            {lang === 'th' ? 'กำลังจะถึง' : 'Upcoming'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500" />
                            {lang === 'th' ? '≤30 วัน' : '≤30 days'}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="bg-destructive h-2 w-2 rounded-full" />
                            {lang === 'th' ? 'เลยกำหนด' : 'Overdue'}
                        </span>
                    </div>
                </div>

                {summary.timeline.length === 0 ? (
                    <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-6 text-center text-sm">
                        {lang === 'th' ? 'ไม่มีสัญญาที่หมดอายุในช่วง 12 เดือนนี้' : 'No expirations in this 12-month window.'}
                    </div>
                ) : (
                    <div className="bg-muted/40 relative overflow-hidden rounded-lg">
                        {/* Full-height NOW column highlight, sitting behind the dots and labels */}
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-12 px-2">
                            {months.map((m) => (
                                <div key={m.key} className={m.isNow ? 'bg-brand/10' : ''} />
                            ))}
                        </div>
                        <div className="relative z-10 mx-2 mt-3" style={{ height: `${plotHeight}px` }}>
                            {/* Month separators */}
                            {months.slice(1).map((m, i) => (
                                <div key={m.key} className="border-border/40 absolute inset-y-0 border-l" style={{ left: `${((i + 1) / 12) * 100}%` }} />
                            ))}
                            {/* Axis baseline */}
                            <div className="border-border absolute inset-x-0 bottom-0 border-t" />
                            {/* Contract dots, positioned by actual expiry date */}
                            {placed.map(({ c, frac, lane }) => (
                                <button
                                    key={c.id}
                                    title={
                                        c.days <= 0
                                            ? `${c.code} · ${c.name} — ${c.end} (${lang === 'th' ? `หมดอายุไป ${-c.days} วัน` : `expired ${-c.days}d ago`})`
                                            : `${c.code} · ${c.name} — ${c.end} (${c.days} ${lang === 'th' ? 'วัน' : 'days'})`
                                    }
                                    onClick={() => onSelect(c.id)}
                                    className={cn(
                                        'ring-background absolute h-3 w-3 -translate-x-1/2 rounded-full ring-2 transition-transform hover:z-10 hover:scale-125',
                                        c.days <= 0 ? 'bg-destructive' : c.days <= 30 ? 'bg-amber-500' : 'bg-brand',
                                    )}
                                    style={{ left: `${frac * 100}%`, bottom: `${8 + lane * 16}px` }}
                                />
                            ))}
                        </div>
                        <div className="relative z-10 mt-1 grid grid-cols-12 px-2 py-1.5">
                            {months.map((m) => (
                                <div key={m.key} className="text-center leading-tight">
                                    {m.isNow && (
                                        <div className="text-brand text-[9px] font-bold tracking-wide uppercase">
                                            {lang === 'th' ? 'ปัจจุบัน' : 'NOW'}
                                        </div>
                                    )}
                                    <div className={cn('text-[11px] font-medium', m.isNow ? 'text-brand font-bold' : 'text-foreground')}>
                                        {m.label}
                                    </div>
                                    <div className={cn('text-[10px]', m.isNow ? 'text-brand/80' : 'text-muted-foreground')}>{m.year}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Top vendors by spend */}
                <div>
                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('contract_top_vendors')}</div>
                    <div className="space-y-2.5">
                        {summary.top_vendors.map((r) => (
                            <div key={r.vendor}>
                                <div className="mb-1 flex justify-between text-sm">
                                    <span>{r.vendor}</span>
                                    <span className="text-muted-foreground font-mono text-xs">{symbol}{Math.round(r.amount / 1000)}K</span>
                                </div>
                                <div className="bg-muted h-2 overflow-hidden rounded-full">
                                    <span className="bg-brand block h-full rounded-full" style={{ width: `${(r.amount / maxVendor) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action queue */}
                <div>
                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('contract_action_queue')}</div>
                    <div className="space-y-2">
                        {summary.action_queue.length === 0 && (
                            <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">—</div>
                        )}
                        {summary.action_queue.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                className="border-border hover:bg-accent/40 flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left"
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                                    {c.days}d
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{c.name}</div>
                                    <div className="text-muted-foreground text-xs">{c.vendor}</div>
                                </div>
                                <ArrowRight className="text-muted-foreground h-4 w-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
