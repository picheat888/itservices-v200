import { SectionModal } from '@/components/employees/section-modal';
import { Column, DataTable } from '@/components/shared/data-table';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartments, useSectionMutations, useSections } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Section } from '@/types';
import { ArrowUpDown, Plus, SquarePen, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type SortKey = 'dept' | 'name' | 'members' | 'code';

export function SectionsTab({ canManage }: { canManage: boolean }) {
    const t = useT();
    const confirm = useConfirm();
    const lang = useUiStore((s) => s.lang);
    const { data: sections = [] } = useSections();
    const { data: departments = [] } = useDepartments();
    const mut = useSectionMutations();
    const [editSection, setEditSection] = useState<Section | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [deptFilter, setDeptFilter] = useState(''); // '' = all departments
    const [sort, setSort] = useState<SortKey>('dept');

    const sectionLabel = (s: Section) => (lang === 'th' ? (s.name_th ?? s.name) : s.name);

    const deptOptions = useMemo(
        () => [
            { value: '', label: t('all_departments'), search: t('all_departments') },
            ...departments.map((d) => ({
                value: String(d.id),
                label: lang === 'th' ? (d.name_th ?? d.name) : d.name,
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
        const name = lang === 'th' ? (s.name_th ?? s.name) : s.name;
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
        { key: 'code', header: t('section_code'), render: (s) => <span className="text-muted-foreground font-mono text-xs">{s.code}</span> },
        { key: 'name', header: t('section'), render: (s) => <span className="font-medium">{lang === 'th' ? (s.name_th ?? s.name) : s.name}</span> },
        { key: 'department', header: t('department'), render: (s) => <span className="text-muted-foreground">{s.department ?? '—'}</span> },
        {
            key: 'members',
            header: t('section_members'),
            align: 'right',
            render: (s) => <span className="font-mono text-xs">{s.members_count ?? 0}</span>,
        },
        {
            key: 'actions',
            header: t('actions'),
            align: 'right',
            render: (s) =>
                canManage ? (
                    <div className="flex justify-end gap-1">
                        <button
                            onClick={() => {
                                setEditSection(s);
                                setModalOpen(true);
                            }}
                            className="hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md"
                        >
                            <SquarePen className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => handleDelete(s)}
                            className="text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <div className="space-y-3">
            {sections.length === 0 ? (
                <div className="text-muted-foreground py-16 text-center text-sm">{t('section_empty')}</div>
            ) : (
                <DataTable
                    columns={columns}
                    rows={view}
                    rowKey={(s) => s.id}
                    searchable={(s) => `${s.code} ${s.name} ${s.name_th ?? ''} ${s.department ?? ''}`}
                    filters={
                        <>
                            {/* Filter by department */}
                            <div className="w-44">
                                <SearchableSelect
                                    value={deptFilter}
                                    onChange={setDeptFilter}
                                    options={deptOptions}
                                    placeholder={t('all_departments')}
                                />
                            </div>
                            {/* Order by */}
                            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                                <SelectTrigger className="w-44">
                                    <ArrowUpDown className="text-muted-foreground h-4 w-4" />
                                    <SelectValue />
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
                        canManage && (
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
            )}
            <SectionModal open={modalOpen} onClose={() => setModalOpen(false)} section={editSection} />
        </div>
    );
}
