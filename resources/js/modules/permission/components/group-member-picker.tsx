// "Add members" pane of the Role Group dialog: search or pick a department, tick people (or the whole department) to stage them.
import { useT } from '@/lang';
import { useDepartments } from '@/modules/employee';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localName } from '@/shared/lib/local-name';
import { Checkbox } from '@/shared/ui/checkbox';
import { useUiStore } from '@/stores/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { groupRoleApi, type GroupMember } from '../api/permissionApi';
import { useGroupCandidates } from '../hooks/use-permissions';
import { countKey } from '../lib/group-rules';
import { PaneHeader, PanePager, PaneRow, PaneSearch, PaneSkeleton } from './group-pane';

const ALL = '__all__';

export function GroupMemberPicker({
    groupId,
    added,
    onToggle,
    onAddMany,
    onRemoveMany,
}: {
    groupId: number | null;
    /** People staged to join; ticked here. */
    added: Map<number, GroupMember>;
    onToggle: (person: GroupMember) => void;
    onAddMany: (people: GroupMember[]) => void;
    onRemoveMany: (ids: number[]) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const qc = useQueryClient();
    const { data: departments = [] } = useDepartments();
    const [search, setSearch] = useState('');
    const [departmentId, setDepartmentId] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [departmentIds, setDepartmentIds] = useState<number[] | null>(null);
    const [loadingAll, setLoadingAll] = useState(false);
    const debounced = useDebouncedSearch(search);
    const { data, isLoading, isError, isPlaceholderData, refetch } = useGroupCandidates({ groupId, search: debounced, departmentId, page }, true);
    const busy = isLoading || isPlaceholderData;
    const failed = isError && !data;

    const rows = data?.data ?? [];
    const total = data?.meta.total ?? 0;
    const department = departments.find((d) => d.id === departmentId);
    // Who this caller may not add: their own account, and Super admins unless they are one
    const lockReason = (p: GroupMember) => (p.is_me ? t('gr_your_account') : p.protected ? t('gr_admin_only') : null);
    const wholeDepartment = departmentId !== null && debounced === '' && total > 0 && !busy;
    const allPicked = departmentIds !== null && departmentIds.length > 0 && departmentIds.every((id) => added.has(id));

    const pickDepartment = (value: string) => {
        setDepartmentId(value === ALL ? null : Number(value));
        setDepartmentIds(null);
        setPage(1);
    };
    const toggleDepartment = async () => {
        if (departmentId === null) return;
        if (allPicked && departmentIds) {
            onRemoveMany(departmentIds);
            return;
        }
        setLoadingAll(true);
        try {
            const people = await qc.fetchQuery({
                queryKey: ['group-roles', 'department-candidates', groupId, departmentId],
                queryFn: () => groupRoleApi.departmentCandidates(groupId, departmentId),
            });
            const addable = people.filter((p) => lockReason(p) === null);
            setDepartmentIds(addable.map((p) => p.id));
            onAddMany(addable);
        } finally {
            setLoadingAll(false);
        }
    };

    const departmentOptions = [
        { value: ALL, label: t('gr_all_departments'), search: t('gr_all_departments') },
        ...departments.map((d) => ({ value: String(d.id), label: localName(d, lang) ?? d.name, search: `${d.code} ${d.name} ${d.name_th ?? ''}` })),
    ];

    return (
        <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="gr-pick-title">
            <PaneHeader id="gr-pick-title" title={t('gr_pick_title')} meta={t('gr_pick_hint')}>
                <PaneSearch
                    name="group-pick-search"
                    value={search}
                    placeholder={t('gr_pick_search')}
                    onChange={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                />
                <div className="w-[46%] shrink-0">
                    <label htmlFor="gr-pick-department-select" className="sr-only">
                        {t('department')}
                    </label>
                    <SearchableSelect
                        id="gr-pick-department-select"
                        searchPlaceholder={t('emp_departments_search')}
                        value={departmentId === null ? ALL : String(departmentId)}
                        onChange={pickDepartment}
                        options={departmentOptions}
                        active={departmentId !== null}
                        clearable={false}
                    />
                </div>
            </PaneHeader>

            <div aria-busy={busy} className="border-border flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t">
                {wholeDepartment && (
                    <label
                        htmlFor="gr-pick-department"
                        className="border-border/60 bg-background sticky top-0 z-[1] flex min-h-10 cursor-pointer items-center gap-3 border-b px-5 text-[13px] font-medium"
                    >
                        <Checkbox id="gr-pick-department" checked={allPicked} disabled={loadingAll} onCheckedChange={() => void toggleDepartment()} />
                        {t(countKey('gr_pick_department', total))
                            .replace('{dept}', localName(department ?? null, lang) ?? '')
                            .replace('{n}', fmtN(total))}
                    </label>
                )}
                {busy && <PaneSkeleton />}
                {failed && <LoadFailedPanel onRetry={() => void refetch()} />}
                {!busy &&
                    rows.map((p) => {
                        const locked = lockReason(p);
                        const id = `gr-pick-${p.id}`;
                        return (
                            <PaneRow
                                key={p.id}
                                as="label"
                                htmlFor={id}
                                name={localName(p, lang) ?? p.name}
                                code={p.code}
                                department={localName(p.department ? { name: p.department, name_th: p.department_th } : null, lang)}
                                muted={locked !== null}
                                locked={locked !== null}
                                note={locked ?? (p.group ? t('gr_in_group').replace('{name}', p.group) : null)}
                                lead={<Checkbox id={id} checked={added.has(p.id)} disabled={locked !== null} onCheckedChange={() => onToggle(p)} />}
                            />
                        );
                    })}
                {!busy && !failed && rows.length === 0 && (
                    <EmptyState
                        {...(debounced !== '' || departmentId !== null
                            ? { kind: 'search' as const, title: t('gr_pick_none'), hint: t('gr_pick_none_hint') }
                            : { kind: 'clear' as const, title: t('gr_pick_all_in') })}
                    />
                )}
            </div>
            {total > 0 && data && (
                <PanePager page={data.meta.current_page} lastPage={data.meta.last_page} perPage={data.meta.per_page} total={total} onPage={setPage} />
            )}
        </section>
    );
}
