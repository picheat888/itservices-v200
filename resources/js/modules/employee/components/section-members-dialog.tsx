import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { localName } from '@/shared/lib/local-name';
import type { Employee, Section } from '@/shared/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { useSectionMembers } from '../hooks/use-sections';
import { CountPlaceholder } from './count-placeholder';

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
    // Member count from the clicked row
    const expected = view?.members_count;
    const loadingMembers = isLoading && expected !== 0;
    const { data: departments = [] } = useDepartments();

    const sectionName = view ? localName(view, lang) : '';
    const dept = departments.find((d) => d.id === view?.department_id);
    const deptName = lang === 'th' ? (dept?.name_th ?? view?.department) : view?.department;

    const columns: Column<Employee>[] = [
        {
            key: 'name',
            header: t('order_name'),
            render: (m) => (
                <div className="flex items-center gap-2.5">
                    <UserAvatar name={m.name} photoUrl={m.photo_url} />
                    <span className="truncate font-medium">{localName(m, lang)}</span>
                </div>
            ),
        },
        { key: 'code', header: t('tbl_emp_id'), render: (m) => <span className="text-muted-foreground text-xs">{m.code}</span> },
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
            <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-3xl flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="text-muted-foreground h-4 w-4" />
                        {sectionName}
                        {view?.code && <span className="text-muted-foreground text-xs font-normal">{view.code}</span>}
                    </DialogTitle>
                    <DialogDescription className="flex flex-wrap gap-x-3" aria-busy={isLoading || undefined}>
                        {deptName && <span>{deptName}</span>}
                        <span>
                            {isLoading ? (expected ?? <CountPlaceholder label={t('loading')} />) : members.length} {t('section_members')}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <DataTable
                    columns={columns}
                    rows={members}
                    rowKey={(m) => m.id}
                    loading={loadingMembers}
                    loadingRows={expected ? Math.min(expected, 20) : undefined}
                    loadingAvatar
                    maxBodyHeight="52vh"
                    searchable={(m) => `${m.name} ${m.name_th ?? ''} ${m.code} ${m.position ?? ''}`}
                />
            </DialogContent>
        </Dialog>
    );
}
