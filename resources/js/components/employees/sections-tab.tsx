import { SectionModal } from '@/components/employees/section-modal';
import { Column, DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { useSectionMutations, useSections } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Section } from '@/types';
import { Plus, SquarePen, Trash2 } from 'lucide-react';
import { useState } from 'react';

export function SectionsTab({ canManage }: { canManage: boolean }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: sections = [] } = useSections();
    const mut = useSectionMutations();
    const [editSection, setEditSection] = useState<Section | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    const columns: Column<Section>[] = [
        { key: 'department', header: t('department'), render: (s) => <span className="text-muted-foreground">{s.department ?? '—'}</span> },
        { key: 'name', header: t('section'), render: (s) => <span className="font-medium">{lang === 'th' ? (s.name_th ?? s.name) : s.name}</span> },
        { key: 'members', header: t('section_members'), align: 'right', render: (s) => <span className="font-mono text-xs">{s.members_count ?? 0}</span> },
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
                            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
                        >
                            <SquarePen className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(`${t('confirm_delete')} ${s.name}`)) mut.remove.mutate(s.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
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
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{t('section_all_org')}</span>
                {canManage && (
                    <Button
                        onClick={() => {
                            setEditSection(null);
                            setModalOpen(true);
                        }}
                    >
                        <Plus className="h-4 w-4" />
                        {t('add_section')}
                    </Button>
                )}
            </div>
            {sections.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">{t('section_empty')}</div>
            ) : (
                <DataTable columns={columns} rows={sections} rowKey={(s) => s.id} />
            )}
            <SectionModal open={modalOpen} onClose={() => setModalOpen(false)} section={editSection} />
        </div>
    );
}
