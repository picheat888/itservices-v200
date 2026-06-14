import { SearchableSelect, type SearchOption } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAccessMutations, useResourceMembers } from '@/hooks/use-access';
import { useEmployees } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import type { AccessKind } from '@/types';
import { useMemo, useState } from 'react';

// Access levels offered per kind; social platforms grant no level (free-text purpose instead).
const LEVELS: Record<AccessKind, string[]> = { 'email-groups': ['Owner', 'Member'], 'file-shares': ['Full', 'Write', 'Read'], 'social-platforms': [] };

/**
 * Right-side drawer listing the active members of an access resource, with
 * per-member revoke and an add-member row (employee picker + level/purpose).
 * Add/revoke controls only render when the viewer has access.manage (canManage).
 */
export function MembersDrawer({ target, canManage, onClose }: { target: { kind: AccessKind; id: number; name: string } | null; canManage: boolean; onClose: () => void }) {
    const t = useT();
    const kind = target?.kind ?? 'email-groups';
    const { data: members = [] } = useResourceMembers(kind, target?.id ?? null);
    const { data: employees = [] } = useEmployees();
    const { addMember, revokeMember } = useAccessMutations(kind);
    const [empId, setEmpId] = useState('');
    const [level, setLevel] = useState('');
    const [purpose, setPurpose] = useState('');

    const opts = useMemo<SearchOption[]>(() => employees.map((e) => ({ value: String(e.id), label: e.name, sub: e.code, search: `${e.name} ${e.code}` })), [employees]);
    const levels = LEVELS[kind];

    const add = async () => {
        if (!empId || !target) return;
        await addMember.mutateAsync({
            id: target.id,
            payload: { employee_id: Number(empId), access_level: levels.length ? level || levels[levels.length - 1] : null, purpose: purpose || null },
        });
        setEmpId('');
        setLevel('');
        setPurpose('');
    };

    return (
        <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-[440px] sm:max-w-[440px]">
                {target && (
                    <>
                        <SheetHeader>
                            <SheetTitle>
                                {target.name} · {t('access_members')}
                            </SheetTitle>
                        </SheetHeader>
                        <div className="mt-4 space-y-2">
                            {members.map((m) => (
                                <div key={m.id} className="border-border flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{m.employee}</div>
                                        <div className="text-muted-foreground text-xs">
                                            {m.access_level ?? m.purpose ?? '—'} · {m.granted_at}
                                        </div>
                                    </div>
                                    {canManage && (
                                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => revokeMember.mutate({ id: target.id, membershipId: m.id })}>
                                            {t('access_revoke')}
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {members.length === 0 && <div className="text-muted-foreground bg-muted/40 rounded-lg py-6 text-center text-sm">{t('access_no_members')}</div>}
                        </div>
                        {canManage && (
                            <div className="border-border mt-4 space-y-2 border-t pt-4">
                                <SearchableSelect value={empId} onChange={setEmpId} options={opts} placeholder={t('access_pick_employee')} clearable />
                                {levels.length > 0 ? (
                                    <select className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
                                        <option value="">{levels[levels.length - 1]}</option>
                                        {levels.map((l) => (
                                            <option key={l} value={l}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                                        placeholder={t('access_purpose')}
                                        value={purpose}
                                        onChange={(e) => setPurpose(e.target.value)}
                                    />
                                )}
                                <Button className="w-full" disabled={!empId || addMember.isPending} onClick={add}>
                                    {t('access_add_member')}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
