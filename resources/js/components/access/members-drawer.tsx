import { AccessBadge } from '@/components/access/access-badge';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useAccessMutations, useResourceMembers } from '@/hooks/use-access';
import { useEmployees } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import type { AccessKind } from '@/shared/types';
import { Folder, Globe, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

/** The resource a member drawer is bound to, with enough detail for the header card. */
export type MemberTarget = {
    kind: AccessKind;
    id: number;
    name: string;
    /** Sub line under the title (email / path / url). */
    detail?: string | null;
    /** Resource owner display name (email groups & file shares). */
    owner?: string | null;
    /** Department label (email groups) or size label (file shares). */
    metaLabel?: string | null;
    metaValue?: string | null;
    /** Accent color (social platforms use the platform color). */
    color?: string | null;
};

// Access levels offered per kind; social platforms grant no level (free-text purpose instead).
const LEVELS: Record<AccessKind, string[]> = { 'email-groups': ['Owner', 'Member'], 'file-shares': ['Full', 'Write', 'Read'], 'social-platforms': [] };

// Per-kind icon tile accent (matches the registry tables / design tokens).
const KIND_META: Record<AccessKind, { icon: typeof Users; color: string }> = {
    'email-groups': { icon: Users, color: '#7c3aed' },
    'file-shares': { icon: Folder, color: '#0d9488' },
    'social-platforms': { icon: Globe, color: '#6366f1' },
};

/** First two initials of a name, for avatar fallbacks. */
function initials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

/**
 * Right-side member manager for an access resource. Shows an info card (icon
 * tile + dept/size/url + owner), the active member list (each with a trailing
 * role/level/purpose badge and a revoke button), and an add-member row gated
 * behind canManage. Wires to useAccessMutations(kind).addMember / .revokeMember.
 */
export function MembersDrawer({ target, canManage, onClose }: { target: MemberTarget | null; canManage: boolean; onClose: () => void }) {
    const t = useT();
    const kind = target?.kind ?? 'email-groups';
    const { data: members = [] } = useResourceMembers(kind, target?.id ?? null);
    const { data: employees = [] } = useEmployees();
    const { addMember, revokeMember } = useAccessMutations(kind);
    const [empId, setEmpId] = useState('');
    const [level, setLevel] = useState('');
    const [purpose, setPurpose] = useState('');

    const takenIds = useMemo(() => new Set(members.map((m) => m.employee_id)), [members]);
    const opts = useMemo<SearchOption[]>(
        () => employees.filter((e) => !takenIds.has(e.id)).map((e) => ({ value: String(e.id), label: e.name, sub: e.code, search: `${e.name} ${e.code}` })),
        [employees, takenIds],
    );
    const levels = LEVELS[kind];
    const meta = KIND_META[kind];
    const Icon = meta.icon;
    const isSocial = kind === 'social-platforms';
    const tileColor = isSocial && target?.color ? target.color : meta.color;

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

    /** Trailing badge for a member row, by kind. */
    const memberBadge = (accessLevel: string | null, mPurpose: string | null) => {
        if (kind === 'email-groups') {
            const isOwner = accessLevel === 'Owner';
            return (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${isOwner ? 'bg-brand/15 text-brand' : 'bg-muted text-muted-foreground'}`}>
                    {isOwner ? t('access_role_owner') : t('access_role_member')}
                </span>
            );
        }
        if (kind === 'file-shares') return <AccessBadge level={accessLevel} />;
        return mPurpose ? <span className="text-muted-foreground max-w-[120px] text-right text-xs">{mPurpose}</span> : null;
    };

    return (
        <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-[460px] overflow-y-auto sm:max-w-[460px]">
                {target && (
                    <>
                        <SheetHeader>
                            <SheetTitle>{target.name}</SheetTitle>
                            {target.detail && <SheetDescription className="font-mono text-xs">{target.detail}</SheetDescription>}
                        </SheetHeader>

                        {/* Info card: icon tile + dept/size/url + owner */}
                        <div className="border-border mt-4 flex items-center gap-3 rounded-lg border px-3.5 py-3">
                            <span
                                className="grid h-10 w-10 shrink-0 place-items-center rounded-md font-bold"
                                style={isSocial ? { background: tileColor, color: '#fff' } : { background: `${tileColor}18`, color: tileColor }}
                            >
                                {isSocial ? target.name[0]?.toUpperCase() : <Icon className="h-5 w-5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                {target.metaLabel && <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{target.metaLabel}</div>}
                                <div className="truncate text-sm font-semibold">{target.metaValue || target.detail || '—'}</div>
                            </div>
                            {!isSocial && target.owner && (
                                <div className="text-right">
                                    <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{t('access_owner')}</div>
                                    <div className="text-sm font-semibold">{target.owner}</div>
                                </div>
                            )}
                        </div>

                        {/* Member list */}
                        <div className="mt-5">
                            <div className="text-muted-foreground mb-2.5 text-[11px] font-semibold tracking-wider uppercase">
                                {t('access_members')} · {members.length}
                            </div>
                            {members.length === 0 ? (
                                <div className="text-muted-foreground bg-muted/40 rounded-lg py-7 text-center text-sm">{t('access_no_members')}</div>
                            ) : (
                                <div className="space-y-2">
                                    {members.map((m) => (
                                        <div key={m.id} className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5">
                                            <Avatar className="h-8 w-8">
                                                <AvatarFallback className="text-[11px] font-semibold">{initials(m.employee ?? '?')}</AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-medium">{m.employee ?? '—'}</div>
                                                {m.granted_at && (
                                                    <div className="text-muted-foreground text-xs">
                                                        {t('access_granted')} {m.granted_at}
                                                    </div>
                                                )}
                                            </div>
                                            {memberBadge(m.access_level, m.purpose)}
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    title={t('access_remove')}
                                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors"
                                                    onClick={() => revokeMember.mutate({ id: target.id, membershipId: m.id })}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Add member row */}
                        {canManage && (
                            <div className="border-border mt-5 flex items-end gap-2 border-t pt-5">
                                <div className="flex-1">
                                    <SearchableSelect value={empId} onChange={setEmpId} options={opts} placeholder={t('access_pick_employee')} clearable />
                                </div>
                                {levels.length > 0 && (
                                    <select
                                        className="border-input bg-background h-10 shrink-0 rounded-md border px-3 text-sm"
                                        value={level || levels[levels.length - 1]}
                                        onChange={(e) => setLevel(e.target.value)}
                                    >
                                        {levels.map((l) => (
                                            <option key={l} value={l}>
                                                {l}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {isSocial && (
                                    <input
                                        className="border-input bg-background h-10 w-32 shrink-0 rounded-md border px-3 text-sm"
                                        placeholder={t('access_purpose')}
                                        value={purpose}
                                        onChange={(e) => setPurpose(e.target.value)}
                                    />
                                )}
                                <Button size="icon" className="h-10 w-10 shrink-0" disabled={!empId || addMember.isPending} onClick={add} title={t('access_add_member')}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
