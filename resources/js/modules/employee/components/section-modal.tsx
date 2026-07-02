import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useDepartments, useSectionMutations } from '../hooks/use-org';
import { useT } from '@/lang';
import { useUiStore } from '@/stores/ui';
import type { Section } from '@/shared/types';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const empty = { department_id: '', name: '', name_th: '' };

export function SectionModal({ open, onClose, section }: { open: boolean; onClose: () => void; section: Section | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { create, update } = useSectionMutations();
    const [form, setForm] = useState(empty);
    const [saved, setSaved] = useState(false);
    const initial = useRef(empty);

    useEffect(() => {
        if (open) {
            setSaved(false);
            const values = section ? { department_id: String(section.department_id), name: section.name, name_th: section.name_th ?? '' } : empty;
            setForm(values);
            initial.current = values;
        }
    }, [open, section]);

    const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const isDirty =
        !section ||
        form.department_id !== initial.current.department_id ||
        form.name.trim() !== initial.current.name.trim() ||
        form.name_th.trim() !== initial.current.name_th.trim();

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
        setSaved(true);
        setTimeout(onClose, 1200);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {section ? t('edit_section') : t('add_section')}
                        {section?.code && <span className="text-muted-foreground font-mono text-xs font-normal">{section.code}</span>}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('department')}>
                        <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={deptOptions} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('section_name_en')}>
                            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('section_name_en_ph')} />
                        </Field>
                        <Field label={t('section_name_th')}>
                            <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder={t('section_name_th_ph')} />
                        </Field>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={!form.department_id || !form.name.trim() || !isDirty || create.isPending || update.isPending || saved}
                    >
                        {create.isPending || update.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('saving')}
                            </>
                        ) : saved ? (
                            <>
                                <Check className="h-4 w-4" />
                                {t('saved')}
                            </>
                        ) : (
                            t('save')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
