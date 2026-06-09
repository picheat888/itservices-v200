import { Field } from '@/components/shared/field';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDepartments, useSectionMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Section } from '@/types';
import { useEffect, useMemo, useState } from 'react';

const empty = { department_id: '', name: '', name_th: '' };

export function SectionModal({ open, onClose, section }: { open: boolean; onClose: () => void; section: Section | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { create, update } = useSectionMutations();
    const [form, setForm] = useState(empty);

    useEffect(() => {
        if (open)
            setForm(
                section
                    ? { department_id: String(section.department_id), name: section.name, name_th: section.name_th ?? '' }
                    : empty,
            );
    }, [open, section]);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const deptOptions = useMemo(
        () =>
            departments.map((d) => ({
                value: String(d.id),
                label: lang === 'th' ? (d.name_th ?? d.name) : d.name,
                sub: d.tag,
                search: `${d.name} ${d.name_th ?? ''} ${d.tag}`,
            })),
        [departments, lang],
    );

    const submit = async () => {
        if (!form.department_id || !form.name.trim()) return;
        const payload = { department_id: Number(form.department_id), name: form.name.trim(), name_th: form.name_th.trim() || null };
        if (section) await update.mutateAsync({ id: section.id, payload });
        else await create.mutateAsync(payload);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{section ? t('edit_section') : t('add_section')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('department')}>
                        <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={deptOptions} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('section_name_en')}>
                            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Network" />
                        </Field>
                        <Field label={t('section_name_th')}>
                            <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder="เครือข่าย" />
                        </Field>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!form.department_id || !form.name.trim() || create.isPending || update.isPending}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
