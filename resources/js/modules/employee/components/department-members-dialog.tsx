import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import type { Department, Employee } from '@/shared/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDepartmentMembers, useSections } from '../hooks/use-org';

/**
 * Focused dialog listing every employee in a department. Uses the shared
 * DataTable (search + pagination + sticky header) so it scales to 100+ members
 * without an endless scroll.
 */
export function DepartmentMembersDialog({ department, onClose }: { department: Department | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    // Retain the last department so content stays rendered while the dialog animates closed.
    const [shown, setShown] = useState<Department | null>(null);
    useEffect(() => {
        if (department) setShown(department);
    }, [department]);
    const view = department ?? shown;

    const { data: members = [], isLoading } = useDepartmentMembers(view?.id ?? null);
    const { data: sections = [] } = useSections(view?.id ?? null);

    const deptName = view ? (lang === 'th' ? (view.name_th ?? view.name) : view.name) : '';

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
        {
            key: 'section',
            header: t('emp_section'),
            render: (m) => <span className="text-muted-foreground text-sm">{(lang === 'th' ? (m.section_th ?? m.section) : m.section) ?? '—'}</span>,
        },
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
        <Dialog open={!!department} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="text-muted-foreground h-4 w-4" />
                        {deptName}
                        {view?.tag && <span className="text-muted-foreground font-mono text-xs font-normal">{view.tag}</span>}
                    </DialogTitle>
                    <DialogDescription>
                        {sections.length} {t('sub_sections')} · {members.length} {t('dept_members')}
                    </DialogDescription>
                </DialogHeader>

                <DataTable
                    columns={columns}
                    rows={members}
                    rowKey={(m) => m.id}
                    loading={isLoading}
                    maxBodyHeight="52vh"
                    searchable={(m) => `${m.name} ${m.name_th ?? ''} ${m.code} ${m.position ?? ''} ${m.section ?? ''}`}
                />
            </DialogContent>
        </Dialog>
    );
}
