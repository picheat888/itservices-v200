import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useRefetchOnOpen } from '@/shared/hooks/use-refetch-on-open';
import { localName, localPair } from '@/shared/lib/local-name';
import type { Department, Employee } from '@/shared/types';
import { Dialog, DialogContent, focusDialogOnOpen, mediumDialogContentClass } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDepartmentMembers } from '../hooks/use-departments';
import { useSections } from '../hooks/use-sections';
import { CountPlaceholder } from './count-placeholder';
import { MemberCount } from './member-count';

/** Focused dialog listing every employee in a department, searchable and paged. */
export function DepartmentMembersDialog({ department, onClose }: { department: Department | null; onClose: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);

    // Retain the last department so content stays rendered while the dialog animates closed.
    const [shown, setShown] = useState<Department | null>(null);
    useEffect(() => {
        if (department) setShown(department);
    }, [department]);
    const view = department ?? shown;

    // Each opening starts with an empty search
    const [query, setQuery] = useState('');
    const openId = department?.id ?? null;
    useEffect(() => {
        if (openId !== null) setQuery('');
    }, [openId]);

    const membersQuery = useDepartmentMembers(view?.id ?? null, openId != null);
    const { data: members = [], isLoading } = membersQuery;
    const failed = membersQuery.isError && !membersQuery.data;
    // Member count from the clicked row
    const expected = view?.count;
    const loadingMembers = isLoading && expected !== 0;
    const sectionsQuery = useSections(view?.id ?? null);
    const { data: sections = [], isLoading: sectionsLoading } = sectionsQuery;
    useRefetchOnOpen(openId != null, membersQuery, sectionsQuery);

    const deptName = view ? localName(view, lang) : '';

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
            key: 'section',
            header: t('emp_section'),
            render: (m) => <span className="text-muted-foreground text-sm">{localPair(m.section, m.section_th, lang) ?? '—'}</span>,
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
            <DialogContent className={mediumDialogContentClass} onOpenAutoFocus={focusDialogOnOpen}>
                <FocusDialogHeader
                    icon={Users}
                    eyebrow={t('employees')}
                    title={deptName}
                    code={view?.tag || undefined}
                    srDescription={deptName}
                    subtitle={
                        <span className="text-muted-foreground flex flex-wrap gap-x-3 text-xs" aria-busy={isLoading || sectionsLoading || undefined}>
                            <span>
                                {sectionsLoading ? <CountPlaceholder label={t('loading')} /> : fmtN(sections.length)} {t('sub_sections')}
                            </span>
                            <MemberCount
                                members={members}
                                loading={isLoading || failed}
                                rowActive={view?.active_employees_count}
                                rowTotal={view?.count}
                            />
                        </span>
                    }
                />

                <div className="min-h-0 border-t px-6 py-5">
                    {failed ? (
                        <LoadFailedPanel onRetry={() => membersQuery.refetch()} />
                    ) : (
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
                                    : { kind: 'empty', title: t('emp_empty_dept_members'), hint: t('emp_empty_dept_members_hint') }
                            }
                            searchPlaceholder={t('emp_search_by_position')}
                            searchable={(m) => `${m.name} ${m.name_th ?? ''} ${m.code} ${m.position ?? ''} ${m.section ?? ''} ${m.section_th ?? ''}`}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
