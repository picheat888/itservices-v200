import { Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useSectionMembers } from '../hooks/use-org';
import { useT } from '@/lang';
import { useUiStore } from '@/stores/ui';
import type { Employee, Section } from '@/shared/types';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Focused dialog listing every employee in a section. Uses the shared DataTable
 * (search + pagination) so it scales to 100+ members per section without
 * turning into an endless scroll — handy before acting on the section.
 */
export function SectionMembersDialog({ section, onClose }: { section: Section | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    // Retain the last section so content stays rendered while the dialog animates closed.
    const [shown, setShown] = useState<Section | null>(null);
    useEffect(() => {
        if (section) setShown(section);
    }, [section]);
    const view = section ?? shown;

    const { data: members = [], isLoading } = useSectionMembers(view?.id ?? null);

    const sectionName = view ? (lang === 'th' ? (view.name_th ?? view.name) : view.name) : '';

    const columns: Column<Employee>[] = [
        {
            key: 'name',
            header: t('order_name'),
            render: (m) => (
                <div className="flex items-center gap-2.5">
                    <UserAvatar name={m.name} photoUrl={m.photo_url} />
                    <span className="truncate font-medium">{lang === 'th' ? (m.name_th ?? m.name) : m.name}</span>
                </div>
            ),
        },
        { key: 'code', header: t('tbl_emp_id'), render: (m) => <span className="text-muted-foreground font-mono text-xs">{m.code}</span> },
        { key: 'position', header: t('position'), render: (m) => <span className="text-muted-foreground text-sm">{m.position ?? '—'}</span> },
        {
            key: 'status',
            header: t('status'),
            align: 'right',
            render: (m) => (
                <StatusBadge tone={m.status === 'resigned' ? 'red' : 'green'}>{m.status === 'resigned' ? t('resigned') : t('active')}</StatusBadge>
            ),
        },
    ];

    return (
        <Dialog open={!!section} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="text-muted-foreground h-4 w-4" />
                        {sectionName}
                        {view?.code && <span className="text-muted-foreground font-mono text-xs font-normal">{view.code}</span>}
                    </DialogTitle>
                    <DialogDescription>
                        {view?.department ? `${view.department} · ` : ''}
                        {members.length} {t('section_members')}
                    </DialogDescription>
                </DialogHeader>

                <DataTable
                    columns={columns}
                    rows={members}
                    rowKey={(m) => m.id}
                    loading={isLoading}
                    maxBodyHeight="52vh"
                    searchable={(m) => `${m.name} ${m.name_th ?? ''} ${m.code} ${m.position ?? ''}`}
                />
            </DialogContent>
        </Dialog>
    );
}
