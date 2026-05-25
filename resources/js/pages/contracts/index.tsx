import { ContractDetailDrawer } from '@/components/contracts/contract-detail-drawer';
import { ContractFormDrawer } from '@/components/contracts/contract-form-drawer';
import { StatusBadge } from '@/components/shared/status-badge';
import { TableSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useContract, useContracts, useContractSummary } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Contract, ContractStatus, Role } from '@/types';
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
import { useState } from 'react';

type Tab = 'dashboard' | 'all' | 'expiring';

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof FileText }) {
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-sm text-muted-foreground">{label}</div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
            {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </Card>
    );
}

/** Days-remaining cell: gray when cancelled, blue far out, amber inside the reminder window, red once expired. */
function DaysCell({ days, inReminder, status }: { days: number; inReminder: boolean; status: ContractStatus }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (status === 'cancelled') return <StatusBadge tone="gray">{t('contract_cancelled')}</StatusBadge>;
    if (days <= 0) return <StatusBadge tone="red">{lang === 'th' ? `หมดอายุไป ${-days} วัน` : `Expired ${-days}d ago`}</StatusBadge>;
    if (inReminder) return <StatusBadge tone="amber">{days} {lang === 'th' ? 'วัน' : 'days'}</StatusBadge>;
    return <StatusBadge tone="blue">{days}d</StatusBadge>;
}

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
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Contract | null>(null);

    const { data: summary } = useContractSummary();
    const listEnabledTab = tab === 'expiring' ? 'expiring' : 'all';
    const { data: listData, isLoading } = useContracts({ page, per_page: perPage, search, tab: listEnabledTab });
    const { data: selected } = useContract(selectedId);

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
                    <p className="text-sm text-muted-foreground">{t('contracts_sub')}</p>
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
                    hint={lang === 'th' ? 'ภายใน 60 วัน' : 'next 60 days'}
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
                                    ? `มีสัญญา ${summary.expiring} ฉบับใกล้หมดอายุภายใน 60 วัน`
                                    : `${summary.expiring} contract${summary.expiring !== 1 ? 's' : ''} expiring in the next 60 days`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {lang === 'th'
                                    ? 'ระบบจะส่งอีเมลแจ้งเตือนที่ 60, 30 และ 7 วันก่อนหมดอายุ'
                                    : 'Email notifications go out at 60, 30 and 7 days before expiration.'}
                            </div>
                        </div>
                        <Button variant="outline" onClick={() => { setTab('expiring'); setPage(1); }}>
                            {lang === 'th' ? 'ตรวจสอบ' : 'Review'} →
                        </Button>
                    </div>
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="flex gap-1 border-b border-border px-2">
                    {([
                        { id: 'dashboard', label: t('sub_dashboard') },
                        { id: 'all', label: t('all_contracts'), count: summary?.total },
                        { id: 'expiring', label: t('expiring_soon'), count: summary?.expiring, warn: true },
                    ] as { id: Tab; label: string; count?: number; warn?: boolean }[]).map((tb) => (
                        <button
                            key={tb.id}
                            onClick={() => { setTab(tb.id); setPage(1); }}
                            className={cn(
                                'relative px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && (
                                <span className={cn('ml-1.5 font-mono text-xs', tb.warn ? 'text-amber-600 dark:text-amber-400' : 'opacity-60')}>{tb.count}</span>
                            )}
                            {tab === tb.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' ? (
                    <DashboardTab summary={summary} maxVendor={maxVendor} onSelect={setSelectedId} />
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-3 border-b border-border p-3">
                            <p className="text-sm text-muted-foreground">
                                {tab === 'expiring' ? t('expiring_soon_hint') : t('all_contracts_hint')}
                            </p>
                            <div className="relative w-full max-w-xs">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={`${t('contract_vendor')} / ${t('contract_name')}`} className="pl-9" />
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="p-4"><TableSkeleton rows={8} cols={8} /></div>
                        ) : rows.length === 0 ? (
                            <div className="px-4 py-16 text-center text-sm text-muted-foreground">{t('contract_none')}</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-2.5">{t('contract_code')}</th>
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
                                            <tr key={c.id} onClick={() => setSelectedId(c.id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40">
                                                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.code}</td>
                                                <td className="px-4 py-2.5 font-medium">{c.vendor}</td>
                                                <td className="max-w-[280px] truncate px-4 py-2.5">{c.name}</td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{c.start}</td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{c.end}</td>
                                                <td className="px-4 py-2.5"><DaysCell days={c.days_remaining} inReminder={c.in_reminder} status={c.status} /></td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{c.value_display}</td>
                                                <td className="px-4 py-2.5">
                                                    <StatusBadge tone={c.status === 'expired' ? 'red' : 'green'}>
                                                        {c.status === 'expired' ? (lang === 'th' ? 'หมดอายุ' : 'Expired') : lang === 'th' ? 'ใช้งาน' : 'Active'}
                                                    </StatusBadge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {meta && rows.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                                    <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
                                        <SelectTrigger className="h-8 w-[72px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[20, 50, 100].map((n) => (
                                                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
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
                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <span className="px-1 font-medium text-foreground">
                                            {meta.current_page} / {meta.last_page}
                                        </span>
                                        <button
                                            onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                                            disabled={page >= meta.last_page}
                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent disabled:opacity-40"
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

    if (!summary) return <div className="p-6"><TableSkeleton rows={4} cols={2} /></div>;

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
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('contract_timeline')}</span>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />{lang === 'th' ? 'กำลังจะถึง' : 'Upcoming'}</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />{lang === 'th' ? '≤30 วัน' : '≤30 days'}</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" />{lang === 'th' ? 'เลยกำหนด' : 'Overdue'}</span>
                    </div>
                </div>

                {summary.timeline.length === 0 ? (
                    <div className="rounded-md bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                        {lang === 'th' ? 'ไม่มีสัญญาที่จะหมดอายุใน 12 เดือนข้างหน้า' : 'No expirations in the next 12 months.'}
                    </div>
                ) : (
                    <div className="rounded-md border border-border">
                        <div className="grid grid-cols-12 items-end gap-px px-2 pt-3">
                            {months.map((m) => (
                                <div key={m.key} className="flex flex-col items-center justify-end gap-1" style={{ minHeight: `${peak * 16 + 8}px` }}>
                                    {m.items.map((c) => (
                                        <button
                                            key={c.id}
                                            title={`${c.code} · ${c.name} — ${c.end} (${c.days} ${lang === 'th' ? 'วัน' : 'days'})`}
                                            onClick={() => onSelect(c.id)}
                                            className={cn(
                                                'h-3 w-3 rounded-full ring-2 ring-background transition-transform hover:scale-125',
                                                c.days <= 30 ? 'bg-amber-500' : 'bg-brand',
                                            )}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="mt-1 grid grid-cols-12 gap-px border-t border-border px-2 py-1.5">
                            {months.map((m) => (
                                <div key={m.key} className="text-center leading-tight">
                                    <div className="text-[11px] font-medium text-foreground">
                                        {m.label}{m.showYear ? ` '${String(m.year).slice(2)}` : ''}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">{m.items.length || ''}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {overdue.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-destructive">{lang === 'th' ? 'เลยกำหนด' : 'Overdue'}</span>
                        {overdue.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                className="rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive transition-colors hover:bg-destructive/20"
                            >
                                {c.code} · {-c.days}{lang === 'th' ? ' วัน' : 'd'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Top vendors by spend */}
                <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('contract_top_vendors')}</div>
                    <div className="space-y-2.5">
                        {summary.top_vendors.map((r) => (
                            <div key={r.vendor}>
                                <div className="mb-1 flex justify-between text-sm">
                                    <span>{r.vendor}</span>
                                    <span className="font-mono text-xs text-muted-foreground">฿{Math.round(r.amount / 1000)}K</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(r.amount / maxVendor) * 100}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action queue */}
                <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('contract_action_queue')}</div>
                    <div className="space-y-2">
                        {summary.action_queue.length === 0 && (
                            <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">—</div>
                        )}
                        {summary.action_queue.map((c) => (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-accent/40"
                            >
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/15 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                                    {c.days}d
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{c.name}</div>
                                    <div className="text-xs text-muted-foreground">{c.vendor}</div>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
