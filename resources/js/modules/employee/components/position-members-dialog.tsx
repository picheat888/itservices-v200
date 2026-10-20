import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { localName, localPair } from '@/shared/lib/local-name';
import type { Employee, Position } from '@/shared/types';
import { Dialog, DialogContent, focusDialogOnOpen, mediumDialogContentClass } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePositionMembers } from '../hooks/use-positions';
import { CountPlaceholder } from './count-placeholder';

/**
 * Focused dialog listing every employee holding a position. Uses the shared
 * DataTable (search + pagination + sticky header) so it scales to 100+ members.
 */
export function PositionMembersDialog({ position, onClose }: { position: Position | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    // Retain the last position so content stays rendered while the dialog animates closed.
    const [shown, setShown] = useState<Position | null>(null);
    useEffect(() => {
        if (position) setShown(position);
    }, [position]);
    const view = position ?? shown;

    // Each opening starts with an empty search
    const [query, setQuery] = useState('');
    const openId = position?.id ?? null;
    useEffect(() => {
        if (openId !== null) setQuery('');
    }, [openId]);

    const { data: members = [], isLoading } = usePositionMembers(view?.id ?? null);
    // Member count from the clicked row
    const expected = view?.employees_count;
    const loadingMembers = isLoading && expected !== 0;

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
        {
            key: 'department',
            header: t('department'),
            render: (m) => <span className="text-muted-foreground text-sm">{localPair(m.department, m.department_th, lang) ?? '—'}</span>,
        },
        {
            key: 'section',
            header: t('emp_section'),
            render: (m) => <span className="text-muted-foreground text-sm">{localPair(m.section, m.section_th, lang) ?? '—'}</span>,
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
            <DialogContent className={mediumDialogContentClass} onOpenAutoFocus={focusDialogOnOpen}>
                <FocusDialogHeader
                    icon={Users}
                    eyebrow={t('employees')}
                    title={view?.title ?? ''}
                    code={view?.code || undefined}
                    srDescription={view?.title ?? ''}
                    subtitle={
                        <span className="text-muted-foreground text-xs" aria-busy={isLoading || undefined}>
                            {isLoading ? (expected ?? <CountPlaceholder label={t('loading')} />) : members.length} {t('dept_members')}
                        </span>
                    }
                />

                <div className="min-h-0 border-t px-6 py-5">
                    <DataTable
                        columns={columns}
                        rows={members}
                        rowKey={(m) => m.id}
                        loading={loadingMembers}
                        loadingRows={expected ? Math.min(expected, 20) : undefined}
                        loadingAvatar
                        maxBodyHeight="52dvh"
                        search={{ value: query, onChange: setQuery }}
                        empty={
                            query
                                ? { kind: 'search', title: t('emp_empty_members_search'), hint: t('emp_empty_members_search_hint') }
                                : { kind: 'empty', title: t('emp_empty_position_members'), hint: t('emp_empty_position_members_hint') }
                        }
                        searchPlaceholder={t('emp_search_by_department')}
                        searchable={(m) =>
                            `${m.name} ${m.name_th ?? ''} ${m.code} ${m.department ?? ''} ${m.department_th ?? ''} ${m.section ?? ''} ${m.section_th ?? ''}`
                        }
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
