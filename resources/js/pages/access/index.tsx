import { MembersDrawer } from '@/components/access/members-drawer';
import { ResourceModal } from '@/components/access/resource-modal';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useEmailGroups, useFileShares, useSocialPlatforms } from '@/hooks/use-access';
import { useT } from '@/lib/i18n';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform } from '@/types';
import { Plus } from 'lucide-react';
import { useState } from 'react';

type Tab = AccessKind;
type AnyResource = EmailGroup | FileShare | SocialPlatform;

/**
 * Access Control page: three sub-tabs (email groups / file shares / social),
 * each a DataTable. Row click opens the members drawer; "Add" opens the
 * resource modal. Write controls are gated behind the access.manage permission.
 */
export default function AccessControlPage() {
    const t = useT();
    const { can } = useAuth();
    const canManage = can('access.manage');
    const [tab, setTab] = useState<Tab>('email-groups');
    const [editing, setEditing] = useState<{ kind: AccessKind; row: AnyResource | null } | null>(null);
    const [members, setMembers] = useState<{ kind: AccessKind; id: number; name: string } | null>(null);

    const emailGroups = useEmailGroups();
    const fileShares = useFileShares();
    const social = useSocialPlatforms();

    const tabs: { id: Tab; label: string }[] = [
        { id: 'email-groups', label: t('access_email_groups') },
        { id: 'file-shares', label: t('access_file_shares') },
        { id: 'social-platforms', label: t('access_social') },
    ];

    const egCols: Column<EmailGroup>[] = [
        { key: 'code', header: t('pos_code'), render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.code}</span> },
        { key: 'name', header: t('pos_title'), render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'email', header: t('access_email'), render: (r) => <span className="font-mono text-xs">{r.email}</span> },
        { key: 'members', header: t('access_members'), align: 'right', render: (r) => r.members_count ?? 0 },
    ];
    const fsCols: Column<FileShare>[] = [
        { key: 'code', header: t('pos_code'), render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.code}</span> },
        { key: 'name', header: t('pos_title'), render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'path', header: t('access_path'), render: (r) => <span className="font-mono text-xs">{r.path}</span> },
        { key: 'members', header: t('access_members'), align: 'right', render: (r) => r.members_count ?? 0 },
    ];
    const spCols: Column<SocialPlatform>[] = [
        { key: 'code', header: t('pos_code'), render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.code}</span> },
        {
            key: 'name',
            header: t('pos_title'),
            render: (r) => (
                <span className="inline-flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color ?? 'var(--muted)' }} />
                    {r.name}
                </span>
            ),
        },
        { key: 'policy', header: t('access_policy'), render: (r) => <span className="text-muted-foreground text-xs">{r.policy}</span> },
        { key: 'members', header: t('access_members'), align: 'right', render: (r) => r.members_count ?? 0 },
    ];

    return (
        <div className="space-y-4">
            <div className="border-border flex items-center gap-1 border-b">
                {tabs.map((tb) => (
                    <button
                        key={tb.id}
                        onClick={() => setTab(tb.id)}
                        className={`relative px-3 pt-1 pb-2 text-sm font-medium ${tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {tb.label}
                        {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded" />}
                    </button>
                ))}
                {canManage && (
                    <Button className="ml-auto" onClick={() => setEditing({ kind: tab, row: null })}>
                        <Plus className="h-4 w-4" /> {t('access_add')}
                    </Button>
                )}
            </div>

            {tab === 'email-groups' && (
                <DataTable
                    columns={egCols}
                    rows={emailGroups.data ?? []}
                    loading={emailGroups.isLoading}
                    searchable={(r) => `${r.code} ${r.name} ${r.email}`}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => setMembers({ kind: 'email-groups', id: r.id, name: r.name })}
                />
            )}
            {tab === 'file-shares' && (
                <DataTable
                    columns={fsCols}
                    rows={fileShares.data ?? []}
                    loading={fileShares.isLoading}
                    searchable={(r) => `${r.code} ${r.name} ${r.path}`}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => setMembers({ kind: 'file-shares', id: r.id, name: r.name })}
                />
            )}
            {tab === 'social-platforms' && (
                <DataTable
                    columns={spCols}
                    rows={social.data ?? []}
                    loading={social.isLoading}
                    searchable={(r) => `${r.code} ${r.name} ${r.policy ?? ''}`}
                    rowKey={(r) => r.id}
                    onRowClick={(r) => setMembers({ kind: 'social-platforms', id: r.id, name: r.name })}
                />
            )}

            <ResourceModal open={!!editing} kind={editing?.kind ?? 'email-groups'} row={editing?.row ?? null} onClose={() => setEditing(null)} />
            <MembersDrawer target={members} canManage={canManage} onClose={() => setMembers(null)} />
        </div>
    );
}
