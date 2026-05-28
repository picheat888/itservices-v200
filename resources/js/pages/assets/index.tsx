import { AssetDetailDrawer } from '@/components/assets/asset-detail-drawer';
import { AssetFormDrawer } from '@/components/assets/asset-form-drawer';
import { ASSET_STATUS_META, ASSET_TYPES, AssetStatusBadge, AssetTypeIcon } from '@/components/assets/asset-meta';
import { AssetToStockModal } from '@/components/assets/asset-to-stock-modal';
import { AssetTransferDrawer } from '@/components/assets/asset-transfer-drawer';
import { TableSkeleton } from '@/components/shared/skeletons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useAssetMutations, useAssets, useAssetSummary, useAssetTransfers } from '@/hooks/use-assets';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Asset, AssetStatus, AssetType, Role } from '@/types';
import { Archive, ArrowRight, Box, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Cog, Download, Eye, Pencil, Plus, RefreshCcw, Search, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';

type Tab = 'dashboard' | 'inventory' | 'transfers';

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: typeof Box }) {
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

const ALL = '__all__';

export default function AssetsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const role = (user?.role ?? 'user') as Role;
    const perms = user?.permissions ?? [];
    const isSuper = role === 'super';
    const canCreate = isSuper || perms.includes('assets.register');
    const canEdit = isSuper || perms.includes('assets.edit');
    const canTransfer = isSuper || perms.includes('assets.transfer');
    const canRetire = isSuper || perms.includes('assets.retire');

    const [tab, setTab] = useState<Tab>('dashboard');
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<AssetType | ''>('');
    const [sourceFilter, setSourceFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
    const [page, setPage] = useState(1);
    const [perPage] = useState(20);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [detail, setDetail] = useState<Asset | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Asset | null>(null);
    const [transferAsset, setTransferAsset] = useState<Asset | null>(null);
    const [toStockAsset, setToStockAsset] = useState<Asset | null>(null);

    const { data: summary } = useAssetSummary();
    const { data: listData, isLoading } = useAssets({
        page,
        per_page: perPage,
        search,
        type: typeFilter || undefined,
        source: sourceFilter || undefined,
        status: statusFilter || undefined,
    });
    const { toggleMaintenance, receive, accept, bulk } = useAssetMutations();
    const { data: transfers = [] } = useAssetTransfers();

    const rows = listData?.data ?? [];
    const meta = listData?.meta;

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (a: Asset) => {
        setDetail(null);
        setEditing(a);
        setFormOpen(true);
    };

    const toggleRow = (id: number, on: boolean) =>
        setSelectedIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    const allOnPage = rows.length > 0 && rows.every((a) => selectedIds.includes(a.id));

    const runBulk = (op: 'maintenance' | 'writeoff') => {
        if (selectedIds.length === 0) return;
        bulk.mutate({ ids: selectedIds, op }, { onSuccess: () => setSelectedIds([]) });
    };

    const typeBars = summary?.by_type ?? [];
    const maxTypeCount = Math.max(1, ...typeBars.map((b) => b.count));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">{t('assets_title')}</h1>
                    <p className="text-muted-foreground text-sm">{t('assets_sub')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" disabled>
                        <Download className="h-4 w-4" />
                        {t('export')}
                    </Button>
                    {canCreate && (
                        <Button onClick={openCreate}>
                            <Plus className="h-4 w-4" />
                            {t('register_asset')}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label={t('asset_total')} value={summary?.total ?? 0} icon={Box} />
                <StatCard label={t('asset_deployed')} value={summary?.deployed ?? 0} hint={`${summary?.ready ?? 0} ${t('asset_ready').toLowerCase()}`} icon={CheckCircle2} />
                <StatCard label={t('asset_pending_accept')} value={summary?.pending_acceptance ?? 0} icon={Clock} />
                <StatCard label={t('asset_pending_return')} value={summary?.pending_return ?? 0} icon={RefreshCcw} />
            </div>

            <Card className="overflow-hidden">
                <div className="flex gap-1 border-b border-border px-2">
                    {(['dashboard', 'inventory', 'transfers'] as Tab[]).map((tb) => (
                        <button
                            key={tb}
                            onClick={() => setTab(tb)}
                            className={cn(
                                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                tab === tb ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb === 'dashboard' ? t('asset_dashboard') : tb === 'inventory' ? t('asset_inventory') : t('asset_transfers')}
                            {tb === 'inventory' && <span className="text-muted-foreground ml-1.5 font-mono text-xs">{summary?.total ?? 0}</span>}
                        </button>
                    ))}
                </div>

                {tab === 'dashboard' && (
                    <div className="space-y-6 p-5">
                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('asset_by_type')}</div>
                            <div className="space-y-2">
                                {typeBars.map((b) => (
                                    <div key={b.type} className="flex items-center gap-3">
                                        <div className="flex w-28 items-center gap-2 text-sm">
                                            <AssetTypeIcon type={b.type} className="text-muted-foreground h-4 w-4" />
                                            {t(`asset_type_${b.type}`)}
                                        </div>
                                        <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                                            <div className="bg-brand h-full rounded-full" style={{ width: `${(b.count / maxTypeCount) * 100}%` }} />
                                        </div>
                                        <div className="w-8 text-right font-mono text-sm">{b.count}</div>
                                    </div>
                                ))}
                                {typeBars.length === 0 && <div className="text-muted-foreground py-6 text-center text-sm">{t('asset_none')}</div>}
                            </div>
                        </div>

                        <div>
                            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">{t('asset_top_value')}</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="px-3 py-2">{t('asset_tag')}</th>
                                            <th className="px-3 py-2">{t('asset_model')}</th>
                                            <th className="px-3 py-2">{t('asset_owner')}</th>
                                            <th className="px-3 py-2">{t('asset_status')}</th>
                                            <th className="px-3 py-2 text-right">{t('asset_value')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(summary?.top_value ?? []).map((a) => (
                                            <tr key={a.id} className="border-border/60 hover:bg-accent/40 cursor-pointer border-b last:border-0" onClick={() => setDetail(a)}>
                                                <td className="text-muted-foreground px-3 py-2 font-mono text-xs">{a.tag}</td>
                                                <td className="px-3 py-2 font-medium">{a.model}</td>
                                                <td className="px-3 py-2">{a.owner}</td>
                                                <td className="px-3 py-2">
                                                    <AssetStatusBadge status={a.status} t={t} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-semibold">{a.value_display}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'inventory' && (
                    <>
                        <div className="flex flex-wrap items-center gap-2 p-3">
                            <div className="relative min-w-[200px] flex-1">
                                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    placeholder={t('asset_search')}
                                    className="h-9 pl-9"
                                />
                            </div>
                            <Select value={typeFilter || ALL} onValueChange={(v) => { setTypeFilter(v === ALL ? '' : (v as AssetType)); setPage(1); }}>
                                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{t('asset_all')}</SelectItem>
                                    {ASSET_TYPES.map((tp) => (
                                        <SelectItem key={tp} value={tp}>{t(`asset_type_${tp}`)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={sourceFilter || ALL} onValueChange={(v) => { setSourceFilter(v === ALL ? '' : v); setPage(1); }}>
                                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{t('asset_all')}</SelectItem>
                                    <SelectItem value="purchased">{t('asset_purchase')}</SelectItem>
                                    <SelectItem value="rented">{t('asset_lease')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter || ALL} onValueChange={(v) => { setStatusFilter(v === ALL ? '' : (v as AssetStatus)); setPage(1); }}>
                                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>{t('asset_all')}</SelectItem>
                                    {(Object.keys(ASSET_STATUS_META) as AssetStatus[]).map((s) => (
                                        <SelectItem key={s} value={s}>{t(ASSET_STATUS_META[s].key)}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="text-muted-foreground ml-auto font-mono text-xs">{meta?.total ?? 0}</div>
                        </div>

                        {selectedIds.length > 0 && (
                            <div className="bg-brand/5 border-border flex items-center gap-3 border-y px-4 py-2.5">
                                <span className="text-brand text-sm font-semibold">
                                    {lang === 'th' ? `${t('asset_selected')} ${selectedIds.length} ${lang === 'th' ? 'รายการ' : ''}` : `${selectedIds.length} ${t('asset_selected')}`}
                                </span>
                                <button className="text-muted-foreground text-xs hover:underline" onClick={() => setSelectedIds([])}>{t('asset_clear')}</button>
                                <div className="flex-1" />
                                {canEdit && (
                                    <Button size="sm" variant="outline" onClick={() => runBulk('maintenance')} disabled={bulk.isPending}>
                                        <Cog className="h-4 w-4" />
                                        {t('asset_set_maintenance')}
                                    </Button>
                                )}
                                {canRetire && (
                                    <Button size="sm" variant="destructive" onClick={() => runBulk('writeoff')} disabled={bulk.isPending}>
                                        <Trash2 className="h-4 w-4" />
                                        {t('asset_writeoff')}
                                    </Button>
                                )}
                            </div>
                        )}

                        {isLoading ? (
                            <TableSkeleton />
                        ) : rows.length === 0 ? (
                            <div className="text-muted-foreground px-4 py-16 text-center text-sm">{t('asset_none')}</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                            <th className="w-8 px-4 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={allOnPage}
                                                    onChange={(e) => setSelectedIds(e.target.checked ? [...new Set([...selectedIds, ...rows.map((a) => a.id)])] : selectedIds.filter((id) => !rows.some((a) => a.id === id)))}
                                                />
                                            </th>
                                            <th className="px-4 py-2.5">{t('asset_tag')}</th>
                                            <th className="px-4 py-2.5">{t('asset_type')}</th>
                                            <th className="px-4 py-2.5">{t('asset_model')}</th>
                                            <th className="px-4 py-2.5">{t('asset_owner')}</th>
                                            <th className="px-4 py-2.5">{t('asset_dept')}</th>
                                            <th className="px-4 py-2.5">{t('asset_status')}</th>
                                            <th className="px-4 py-2.5">{t('asset_value')}</th>
                                            <th className="px-4 py-2.5 text-right">{t('asset_actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((a) => (
                                            <tr key={a.id} className={cn('border-border/60 border-b last:border-0', selectedIds.includes(a.id) ? 'bg-brand/5' : 'hover:bg-accent/40')}>
                                                <td className="px-4 py-2.5">
                                                    <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={(e) => toggleRow(a.id, e.target.checked)} />
                                                </td>
                                                <td className="text-muted-foreground cursor-pointer px-4 py-2.5 font-mono text-xs" onClick={() => setDetail(a)}>{a.tag}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className="flex items-center gap-2">
                                                        <AssetTypeIcon type={a.type} className="text-muted-foreground h-4 w-4" />
                                                        {t(`asset_type_${a.type}`)}
                                                    </span>
                                                </td>
                                                <td className="cursor-pointer px-4 py-2.5 font-medium" onClick={() => setDetail(a)}>{a.model}</td>
                                                <td className="px-4 py-2.5">{a.owner}</td>
                                                <td className="px-4 py-2.5">{a.department}</td>
                                                <td className="px-4 py-2.5"><AssetStatusBadge status={a.status} t={t} /></td>
                                                <td className="px-4 py-2.5 font-mono text-xs">{a.value_display}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {canTransfer && a.status === 'pending_acceptance' && (
                                                            <button className="hover:bg-accent rounded-md p-1.5 text-emerald-600" title={t('asset_accept')} onClick={() => accept.mutate(a.id)}>
                                                                <Check className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {canTransfer && a.status === 'pending_return' && (
                                                            <button className="hover:bg-accent rounded-md p-1.5 text-emerald-600" title={t('asset_mark_received')} onClick={() => receive.mutate(a.id)}>
                                                                <CheckCircle2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {canTransfer && !['deployed', 'writeoff', 'pending_return', 'pending_stock'].includes(a.status) && (
                                                            <button className="hover:bg-accent rounded-md p-1.5" title={t('transfer_asset')} onClick={() => setTransferAsset(a)}>
                                                                <Share2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {canEdit && (
                                                            <button className="hover:bg-accent rounded-md p-1.5" title={a.status === 'maintenance' ? t('asset_exit_maintenance') : t('asset_set_maintenance')} onClick={() => toggleMaintenance.mutate(a.id)}>
                                                                <Cog className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {canRetire && !['deployed', 'writeoff', 'pending_return', 'pending_stock'].includes(a.status) && (
                                                            <button className="hover:bg-accent rounded-md p-1.5 text-emerald-600" title={t('asset_to_stock')} onClick={() => setToStockAsset(a)}>
                                                                <Archive className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        {canEdit && (
                                                            <button className="hover:bg-accent rounded-md p-1.5" title={t('edit_asset')} onClick={() => openEdit(a)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                        <button className="hover:bg-accent rounded-md p-1.5" title={t('asset_view')} onClick={() => setDetail(a)}>
                                                            <Eye className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {meta && rows.length > 0 && (
                            <div className="border-border text-muted-foreground flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                                <span>
                                    {meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1}–{Math.min(meta.current_page * meta.per_page, meta.total)} {t('asset_of')} {meta.total}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40">
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => setPage((p) => p + 1)} disabled={!!meta && page >= meta.last_page} className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40">
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {tab === 'transfers' && (
                    <div className="overflow-x-auto">
                        {transfers.length === 0 ? (
                            <div className="text-muted-foreground px-4 py-16 text-center text-sm">{t('asset_none')}</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                        <th className="px-4 py-2.5">{t('asset_registered')}</th>
                                        <th className="px-4 py-2.5">{t('asset_tag')}</th>
                                        <th className="px-4 py-2.5">{lang === 'th' ? 'จาก' : 'From'}</th>
                                        <th className="px-4 py-2.5" />
                                        <th className="px-4 py-2.5">{t('asset_new_owner')}</th>
                                        <th className="px-4 py-2.5">{t('asset_reason')}</th>
                                        <th className="px-4 py-2.5">{lang === 'th' ? 'โดย' : 'By'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transfers.map((tr) => (
                                        <tr key={tr.id} className="border-border/60 border-b last:border-0">
                                            <td className="px-4 py-2.5 font-mono text-xs">{tr.date}</td>
                                            <td className="text-muted-foreground px-4 py-2.5 font-mono text-xs">{tr.asset_tag}</td>
                                            <td className="px-4 py-2.5">{tr.from_owner ?? '—'}</td>
                                            <td className="text-muted-foreground px-4 py-2.5"><ArrowRight className="h-4 w-4" /></td>
                                            <td className="px-4 py-2.5 font-medium">{tr.to_owner}</td>
                                            <td className="text-muted-foreground px-4 py-2.5">{tr.reason ?? '—'}</td>
                                            <td className="px-4 py-2.5">{tr.performed_by ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </Card>

            <AssetDetailDrawer asset={detail} onClose={() => setDetail(null)} onTransfer={(a) => { setDetail(null); setTransferAsset(a); }} onReceive={(a) => { setDetail(null); receive.mutate(a.id); }} canTransfer={canTransfer} />
            <AssetFormDrawer open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
            <AssetTransferDrawer asset={transferAsset} onClose={() => setTransferAsset(null)} />
            <AssetToStockModal asset={toStockAsset} onClose={() => setToStockAsset(null)} />
        </div>
    );
}
