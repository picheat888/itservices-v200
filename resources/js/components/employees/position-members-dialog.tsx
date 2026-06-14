import { Column, DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePositionMembers } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Employee, Position } from '@/types';
import { Briefcase } from 'lucide-react';

function initials(name: string) {
    return name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/**
 * Focused dialog listing every employee holding a position. Uses the shared
 * DataTable (search + pagination + sticky header) so it scales to 100+ members.
 */
export function PositionMembersDialog({ position, onClose }: { position: Position | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: members = [], isLoading } = usePositionMembers(position?.id ?? null);

    const columns: Column<Employee>[] = [
        {
            key: 'name',
            header: t('order_name'),
            render: (m) => (
                <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8">
                        {m.photo_url && <AvatarImage src={m.photo_url} alt="" />}
                        <AvatarFallback className="bg-brand/10 text-brand text-[11px] font-semibold">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium">{lang === 'th' ? (m.name_th ?? m.name) : m.name}</span>
                </div>
            ),
        },
        { key: 'code', header: t('tbl_emp_id'), render: (m) => <span className="text-muted-foreground font-mono text-xs">{m.code}</span> },
        {
            key: 'department',
            header: t('department'),
            render: (m) => (
                <span className="text-muted-foreground text-sm">{(lang === 'th' ? (m.department_th ?? m.department) : m.department) ?? '—'}</span>
            ),
        },
        {
            key: 'section',
            header: t('emp_section'),
            render: (m) => <span className="text-muted-foreground text-sm">{(lang === 'th' ? (m.section_th ?? m.section) : m.section) ?? '—'}</span>,
        },
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
        <Dialog open={!!position} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Briefcase className="text-muted-foreground h-4 w-4" />
                        {position?.title}
                        {position?.code && <span className="text-muted-foreground font-mono text-xs font-normal">{position.code}</span>}
                    </DialogTitle>
                    <DialogDescription>
                        {members.length} {t('dept_members')}
                    </DialogDescription>
                </DialogHeader>

                <DataTable
                    columns={columns}
                    rows={members}
                    rowKey={(m) => m.id}
                    loading={isLoading}
                    maxBodyHeight="52vh"
                    searchable={(m) => `${m.name} ${m.name_th ?? ''} ${m.code} ${m.department ?? ''} ${m.section ?? ''}`}
                />
            </DialogContent>
        </Dialog>
    );
}
