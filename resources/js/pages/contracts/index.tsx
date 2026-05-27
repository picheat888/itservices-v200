import { ContractDetailDrawer } from '@/components/contracts/contract-detail-drawer';
import { ContractFormDrawer } from '@/components/contracts/contract-form-drawer';
import { TableSkeleton } from '@/components/shared/skeletons';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useContract, useContracts, useContractSummary } from '@/hooks/use-contracts';
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
    Download,
    FileText,
    Plus,
    Search,
    TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Tab = 'dashboard' | 'all' | 'expiring';

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof FileText }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
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

const TYPE_LABEL: Record<ContractType, { en: string; th: string }> = {
    software: { en: 'Software', th: 'ซอฟต์แวร์' },
    hardware: { en: 'Hardware', th: 'ฮาร์ดแวร์' },
    service: { en: 'Service', th: 'บริการ' },
    connectivity: { en: 'Network', th: 'เครือข่าย' },
    other: { en: 'Other', th: 'อื่นๆ' },
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
    const canRenew = isSuper || perms.includes('contracts.renew');

    const [tab, setTab] = useState<Tab>('dashboard');
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<ContractType | ''>('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Contract | null>(null);

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
                    <Button variant="outline" disabled title={t('coming_soon')}>
                        <Download className="h-4 w-4" />
                        {t('export')}
                    </Button>
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('new_contract')}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('contract_total')} value={summary?.total ?? '—'} icon={FileText} />
                <StatCard label={t('contract_active')} value={summary?.active ?? '—'} icon={CheckCircle2} />
                <StatCard
                    label={t('expiring_soon')}
                    value={summary?.expiring ?? '—'}
                    hint={lang === 'th' ? 'ตามช่วงแจ้งเตือนสัญญา' : 'within reminder window'}
                    icon={Clock}
                />
                <StatCard
                    label={t('contract_annual_value')}
                    value={summary?.annual_value ?? '—'}
                    hint={lang === 'th' ? 'รวมทุกผู้ขาย' : 'across all vendors'}
                    icon={TrendingUp}
                />
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
                            <Select
                                value={typeFilter}
                                onValueChange={(v) => {
                                    setTypeFilter(v as ContractType | '');
                                    setPage(1);
                                }}
                            >
                                <SelectTrigger className="h-9 w-44">
                                    <SelectValue placeholder={t('contract_type')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">{lang === 'th' ? 'ทุกประเภท' : 'All types'}</SelectItem>
                                    <SelectItem value="software">{t('contract_type_software')}</SelectItem>
                                    <SelectItem value="hardware">{t('contract_type_hardware')}</SelectItem>
                                    <SelectItem value="service">{t('contract_type_service')}</SelectItem>
                                    <SelectItem value="connectivity">{t('contract_type_connectivity')}</SelectItem>
                                    <SelectItem value="other">{t('contract_type_other')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative w-full max-w-xs">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={`${t('contract_vendor')} / ${t('contract_name')}`}
                                    className="h-9 pl-9"
                                />
                            </div>
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
                                            <th className="px-4 py-2.5">{t('contract_type')}</th>
                                            <th className="px-4 py-2.5">{t('contract_vendor')}</th>
                                            <th className="px-4 py-2.5">{t('contract_name')}</th>
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
                                                <td className="px-4 py-2.5">
                                                    <StatusBadge tone={TYPE_TONE[c.type]}>
                                                        {lang === 'th' ? TYPE_LABEL[c.type].th : TYPE_LABEL[c.type].en}
                                                    </StatusBadge>
                                                </td>
                                                <td className="px-4 py-2.5 font-medium">{c.vendor}</td>
                                                <td className="max-w-[280px] truncate px-4 py-2.5">{c.name}</td>
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
                canRenew={canRenew}
            />
            <ContractFormDrawer open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
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

    if (!summary)
        return (
            <div className="p-6">
                <TableSkeleton rows={4} cols={2} />
            </div>
        );

    // Group upcoming contracts into the next 12 monthly buckets; expired ones are listed separately.
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        return {
            key: `${d.getFullYear()}-${d.getMonth()}`,
            label: d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short' }),
            showYear: i === 0 || d.getMonth() === 0,
            year: d.getFullYear(),
            items: [] as typeof summary.timeline,
        };
    });
    const overdue: typeof summary.timeline = [];
    summary.timeline.forEach((c) => {
        if (c.days <= 0) {
            overdue.push(c);
            return;
        }
        const [y, mo] = c.end.split('-').map(Number);
        const bucket = months.find((m) => m.key === `${y}-${mo - 1}`) ?? months[months.length - 1];
        bucket.items.push(c);
    });
    const peak = Math.max(1, ...months.map((m) => m.items.length));

    return (
        <div className="space-y-6 p-5">
            {/* Expiry timeline — one column per month for the next 12 months */}
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
                        {lang === 'th' ? 'ไม่มีสัญญาที่จะหมดอายุใน 12 เดือนข้างหน้า' : 'No expirations in the next 12 months.'}
                    </div>
                ) : (
                    <div className="border-border rounded-md border">
                        <div className="grid grid-cols-12 items-end gap-px px-2 pt-3">
                            {months.map((m) => (
                                <div key={m.key} className="flex flex-col items-center justify-end gap-1" style={{ minHeight: `${peak * 16 + 8}px` }}>
                                    {m.items.map((c) => (
                                        <button
                                            key={c.id}
                                            title={`${c.code} · ${c.name} — ${c.end} (${c.days} ${lang === 'th' ? 'วัน' : 'days'})`}
                                            onClick={() => onSelect(c.id)}
                                            className={cn(
                                                'ring-background h-3 w-3 rounded-full ring-2 transition-transform hover:scale-125',
                                                c.days <= 30 ? 'bg-amber-500' : 'bg-brand',
                                            )}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="border-border mt-1 grid grid-cols-12 gap-px border-t px-2 py-1.5">
                            {months.map((m) => (
                                <div key={m.key} className="text-center leading-tight">
                                    <div className="text-foreground text-[11px] font-medium">
                                        {m.label}
                                        {m.showYear ? ` '${String(m.year).slice(2)}` : ''}
                                    </div>
                                    <div className="text-muted-foreground text-[10px]">{m.items.length || ''}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {overdue.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-destructive text-[11px] font-medium tracking-wide uppercase">
                            {lang === 'th' ? 'เลยกำหนด' : 'Overdue'}
                        </span>
                        {overdue.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                            >
                                {c.code} · {-c.days}
                                {lang === 'th' ? ' วัน' : 'd'}
                            </button>
                        ))}
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
                                    <span className="text-muted-foreground font-mono text-xs">฿{Math.round(r.amount / 1000)}K</span>
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
