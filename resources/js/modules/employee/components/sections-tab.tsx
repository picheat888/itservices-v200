import { useT } from '@/lang';
import { Column, DataTable } from '@/shared/components/data-table';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useListParams } from '@/shared/hooks/use-list-params';
import { localName, localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import type { Section } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { ArrowUpDown, Plus, SquarePen, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { useSectionMutations, useSections } from '../hooks/use-sections';
import { SectionMembersDialog } from './section-members-dialog';
import { SectionModal } from './section-modal';

const SORT_KEYS = ['dept', 'name', 'members', 'code'] as const;
type SortKey = (typeof SORT_KEYS)[number];
const DEFAULT_SORT: SortKey = 'dept';
const isSortKey = (v: string): v is SortKey => (SORT_KEYS as readonly string[]).includes(v);

// Icon-only row action buttons
const ICON_BTN =
    'hover:bg-accent focus-visible:ring-ring flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none';

export function SectionsTab({ canAdd, canEdit, canDelete }: { canAdd: boolean; canEdit: boolean; canDelete: boolean }) {
    const t = useT();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { data: sections = [], isLoading } = useSections();
    const { data: departments = [] } = useDepartments();
    const mut = useSectionMutations();
    const [editSection, setEditSection] = useState<Section | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    // Search, department, order, page and rows-per-page live in the URL (?search, dept, sort, page, per).
    const list = useListParams();
    const deptParam = list.get('dept');
    const deptFilter = departments.length === 0 || departments.some((d) => String(d.id) === deptParam) ? deptParam : '';
    const sortParam = list.get('sort');
    const sort: SortKey = isSortKey(sortParam) ? sortParam : DEFAULT_SORT;
    const setDeptFilter = (value: string) => list.setFilter('dept', value);
    const setSort = (value: SortKey) => list.setFilter('sort', value === DEFAULT_SORT ? '' : value);
    const [membersOf, setMembersOf] = useState<Section | null>(null);

    const sectionLabel = (s: Section) => localName(s, lang);
    const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
    const deptLabel = (s: Section) => localPair(s.department, deptById.get(s.department_id)?.name_th, lang);

    const deptOptions = useMemo(
        () => [
            { value: '', label: t('all_departments'), search: t('all_departments') },
            ...departments.map((d) => ({
                value: String(d.id),
                label: localName(d, lang),
                sub: d.tag,
                search: `${d.name} ${d.name_th ?? ''} ${d.tag}`,
            })),
        ],
        [departments, lang, t],
    );

    // Filter by department, then order. Default 'dept' keeps the API order
    // (department_id → name); the other keys re-sort client-side.
    const view = useMemo(() => {
        const rows = deptFilter ? sections.filter((s) => String(s.department_id) === deptFilter) : sections;
        if (sort === 'code') return [...rows].sort((a, b) => a.code.localeCompare(b.code));
        if (sort === 'name') return [...rows].sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b)));
        if (sort === 'members')
            return [...rows].sort((a, b) => (b.members_count ?? 0) - (a.members_count ?? 0) || sectionLabel(a).localeCompare(sectionLabel(b)));
        return rows;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sections, deptFilter, sort, lang]);

    // A section can only be deleted when it's empty. If it still has members,
    // show a blocking notice asking the user to move/remove them first.
    const handleDelete = (s: Section) => {
        const name = localName(s, lang);
        const count = s.members_count ?? 0;
        if (count > 0) {
            confirm({
                variant: 'warn',
                hideCancel: true,
                title: t('section_del_blocked_title'),
                description: t('section_del_blocked_desc'),
                entity: { name, sub: `${count} ${t('section_members')}` },
                confirmText: t('got_it'),
            });
            return;
        }
        confirm({
            variant: 'danger',
            entity: { name },
            action: () => mut.remove.mutateAsync(s.id),
        });
    };

    const columns: Column<Section>[] = [
        { key: 'code', header: t('section_code'), render: (s) => <span className="text-muted-foreground text-xs">{s.code}</span> },
        { key: 'name', header: t('section'), render: (s) => <span className="font-medium">{localName(s, lang)}</span> },
        { key: 'department', header: t('department'), render: (s) => <span className="text-muted-foreground">{deptLabel(s) ?? '—'}</span> },
        {
            key: 'members',
            header: t('section_members'),
            align: 'right',
            render: (s) => (
                <span className="inline-flex items-center justify-end gap-1.5 text-xs">
                    <Users className="text-muted-foreground h-3.5 w-3.5" />
                    {s.members_count ?? 0}
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (s) =>
                canEdit || canDelete ? (
                    // Stop row-click (which opens the members dialog) from firing on the action buttons.
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => {
                                    setEditSection(s);
                                    setModalOpen(true);
                                }}
                                aria-label={`${t('edit')} ${sectionLabel(s)}`}
                                className={ICON_BTN}
                            >
                                <SquarePen aria-hidden className="h-4 w-4" />
                            </button>
                        )}
                        {canDelete && (
                            <button
                                type="button"
                                onClick={() => handleDelete(s)}
                                aria-label={`${t('delete')} ${sectionLabel(s)}`}
                                className={cn(ICON_BTN, 'text-destructive hover:bg-destructive/10')}
                            >
                                <Trash2 aria-hidden className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <div className="space-y-3">
            <DataTable
                columns={columns}
                rows={view}
                rowKey={(s) => s.id}
                loading={isLoading}
                emptyState={sections.length === 0 ? t('section_empty') : undefined}
                onRowClick={(s) => setMembersOf(s)}
                searchable={(s) => `${s.code} ${s.name} ${s.name_th ?? ''} ${s.department ?? ''} ${deptById.get(s.department_id)?.name_th ?? ''}`}
                search={list.table.search}
                paging={list.table.paging}
                filters={
                    <>
                        {/* Filter by department */}
                        <div className="w-44">
                            <SearchableSelect value={deptFilter} onChange={setDeptFilter} options={deptOptions} placeholder={t('all_departments')} />
                        </div>
                        {/* Order by */}
                        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                            <SelectTrigger className="w-52">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <ArrowUpDown className="text-muted-foreground h-4 w-4 shrink-0" />
                                    <SelectValue />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="code">
                                    {t('order_by')}: {t('section_code')}
                                </SelectItem>
                                <SelectItem value="dept">
                                    {t('order_by')}: {t('department')}
                                </SelectItem>
                                <SelectItem value="name">
                                    {t('order_by')}: {t('order_name')}
                                </SelectItem>
                                <SelectItem value="members">
                                    {t('order_by')}: {t('section_members')}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </>
                }
                actions={
                    canAdd && (
                        <Button
                            onClick={() => {
                                setEditSection(null);
                                setModalOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            {t('add_section')}
                        </Button>
                    )
                }
            />
            <SectionModal open={modalOpen} onClose={() => setModalOpen(false)} section={editSection} />
            <SectionMembersDialog section={membersOf} onClose={() => setMembersOf(null)} />
        </div>
    );
}
