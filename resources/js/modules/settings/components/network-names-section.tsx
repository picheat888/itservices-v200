// Settings → Security "ชื่อเครือข่าย": the admin-named IP ranges as a searchable list with add / edit / delete, plus the GeoIP database date and credit.
import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { LoadFailed } from '@/shared/components/load-failed';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useListParams } from '@/shared/hooks/use-list-params';
import { toastDeleteError } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { NetworkName } from '../api/settingsApi';
import { useNetworkNameMutations, useNetworkNames } from '../hooks/use-network-names';
import { masterDataEmpty } from './lookup-section';
import { NetworkNameModal } from './network-name-modal';

const GEOIP_CREDIT_URL = 'https://db-ip.com';

/** `geoipUpdatedAt`: ISO date of the GeoIP file, null when there is none, undefined while the security settings load. */
export function NetworkNamesSection({ geoipUpdatedAt }: { geoipUpdatedAt: string | null | undefined }) {
    const t = useT();
    const confirm = useConfirm();
    const list = useListParams();
    const { data: networks = [], isLoading, isError, refetch } = useNetworkNames();
    const { remove } = useNetworkNameMutations();
    const [addOpen, setAddOpen] = useState(false);
    const [editNetwork, setEditNetwork] = useState<NetworkName | null>(null);

    const columns: Column<NetworkName>[] = [
        { key: 'cidr', header: t('net_col_cidr'), render: (n) => <span className="text-sm font-medium break-all">{n.cidr}</span> },
        { key: 'name', header: t('net_col_name'), render: (n) => <span className="text-sm">{n.name}</span> },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (n) => (
                <div className="flex justify-end gap-1">
                    {/* Icon-only row actions, labelled per row */}
                    <button
                        type="button"
                        onClick={() => setEditNetwork(n)}
                        aria-label={`${t('edit')} ${n.name}`}
                        className="hover:bg-accent focus-visible:ring-ring/50 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
                    >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label={`${t('delete')} ${n.name}`}
                        onClick={async () => {
                            if (!(await confirm({ variant: 'danger', entity: { name: n.name, sub: n.cidr } }))) return;
                            try {
                                await remove.mutateAsync(n.id);
                            } catch (e) {
                                toastDeleteError(e, t);
                            }
                        }}
                        className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/40 flex h-8 w-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2"
                    >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div>
            {/* Heading */}
            <div className="mt-8 mb-5">
                <h2 className="text-lg font-semibold">{t('net_title')}</h2>
                <p className="text-muted-foreground text-sm">{t('net_desc')}</p>
            </div>

            <DataTable
                columns={columns}
                rows={networks}
                loading={isLoading}
                rowKey={(n) => n.id}
                search={list.table.search}
                paging={list.table.paging}
                searchPlaceholder={t('net_search')}
                searchable={(n) => `${n.cidr} ${n.name}`}
                empty={masterDataEmpty(t, 'network_names', list.table.search.value.trim() !== '', t('net_add'))}
                emptyState={isError ? <LoadFailed onRetry={() => refetch()} /> : undefined}
                actions={
                    <Button onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" />
                        {t('net_add')}
                    </Button>
                }
            />

            <GeoIpNote updatedAt={geoipUpdatedAt} />

            <NetworkNameModal
                open={addOpen || !!editNetwork}
                network={editNetwork}
                onClose={() => {
                    setAddOpen(false);
                    setEditNetwork(null);
                }}
            />
        </div>
    );
}

/** GeoIP database date line with the credit DB-IP asks for. */
function GeoIpNote({ updatedAt }: { updatedAt: string | null | undefined }) {
    const t = useT();
    const fmt = useDateFormat();

    if (updatedAt === undefined) {
        return <Skeleton className="mt-3 h-3 w-72 max-w-full" aria-hidden="true" />;
    }

    return (
        <p className="text-muted-foreground mt-3 text-xs">
            {updatedAt ? t('net_geoip_updated').replace('{date}', fmt.date(updatedAt)) : t('net_geoip_none')}{' '}
            <a
                href={GEOIP_CREDIT_URL}
                target="_blank"
                rel="noreferrer"
                translate="no"
                className="focus-visible:ring-ring/50 rounded-sm underline underline-offset-2 outline-none hover:no-underline focus-visible:ring-2"
            >
                {t('net_geoip_credit')}
            </a>
        </p>
    );
}
