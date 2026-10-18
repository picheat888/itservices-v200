// Add / edit a Role Group: name and role on top, "Add members" beside "Current members", saved through a centred confirm.
import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import { SUPER_ROLE } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, focusDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Check, Loader2, Lock, PencilLine, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GroupMember, GroupRole } from '../api/permissionApi';
import { useDeleteGroup } from '../hooks/use-delete-group';
import { useBaseRoleLabel, useGroupRoleMutations, useGroupRoleOptions } from '../hooks/use-permissions';
import { countKey, findRole, isOverCeiling, removeLine, roleLabel } from '../lib/group-rules';
import { permissionRefusalText } from '../lib/refusal';
import { CenteredAlert } from './centered-alert';
import { GroupMemberList } from './group-member-list';
import { GroupMemberPicker } from './group-member-picker';
import { LockHint } from './group-pane';
import { RoleBar } from './role-bar';

type SaveStep = 'idle' | 'confirm' | 'saving' | 'done';

export function GroupRoleDialog({
    open,
    group: liveGroup,
    groups,
    defaultGroup,
    onClose,
    onSaved,
}: {
    open: boolean;
    /** null = a new group. */
    group: GroupRole | null;
    groups: GroupRole[];
    defaultGroup: GroupRole | null;
    onClose: () => void;
    onSaved: (saved: { name: string; members: number }) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { user, isSuper } = useAuth();
    const roles = useGroupRoleOptions();
    const baseRole = useBaseRoleLabel();
    const { create, update, refreshList } = useGroupRoleMutations();
    const deleteGroup = useDeleteGroup(defaultGroup);

    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [added, setAdded] = useState<Map<number, GroupMember>>(new Map());
    const [removed, setRemoved] = useState<Map<number, GroupMember>>(new Map());
    const [tab, setTab] = useState<'pick' | 'members'>('members');
    const [tried, setTried] = useState(false);
    const [saveStep, setSaveStep] = useState<SaveStep>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const roleRef = useRef<HTMLButtonElement>(null);

    // Keep the last group while the dialog plays its exit animation
    const [shown, setShown] = useState<GroupRole | null>(liveGroup);
    useEffect(() => {
        if (open) setShown(liveGroup);
    }, [open, liveGroup]);
    const group = open ? liveGroup : shown;

    // Fresh state, set while rendering, when the dialog opens or switches group; a refetch of the same group keeps it
    const session = open ? String(group?.id ?? 'new') : null;
    const [seenSession, setSeenSession] = useState<string | null>(null);
    if (session !== seenSession) {
        setSeenSession(session);
        if (session !== null) {
            setName(group?.name ?? '');
            setRole(group?.role ?? '');
            setAdded(new Map());
            setRemoved(new Map());
            setTab(group ? 'members' : 'pick');
            setTried(false);
            setSaveStep('idle');
            setSaveError(null);
        }
    }

    const myPermissions = new Set(user?.permissions ?? []);
    const readOnly = group !== null && group.role === SUPER_ROLE && !isSuper;
    const roleLocked = readOnly || !!group?.includes_me;
    const chosenRole = role ? findRole(roles, role) : undefined;
    const paneKey = String(group?.id ?? 'new');

    const nameChanged = group !== null && name.trim() !== group.name;
    const roleChanged = group !== null && role !== (group.role ?? '');
    const changes = added.size + removed.size + (nameChanged ? 1 : 0) + (roleChanged ? 1 : 0);
    const dirty = group === null ? name.trim() !== '' || role !== '' || added.size > 0 : changes > 0;
    const memberCount = (group?.member_count ?? 0) + added.size - removed.size;

    const leavesTo = defaultGroup && defaultGroup.id !== group?.id ? defaultGroup : null;
    const leaveNote = leavesTo ? t('gr_leaves_to').replace('{name}', leavesTo.name) : t('gr_leaves_none').replace('{role}', baseRole);
    // The server refuses every add to a saved group whose role is above the caller
    const savedRole = group ? findRole(roles, group.role) : undefined;
    const groupOverCeiling = savedRole !== undefined && isOverCeiling(savedRole, isSuper, myPermissions);

    const taken = groups.some((g) => g.id !== group?.id && g.name.trim().toLowerCase() === name.trim().toLowerCase());
    const nameError = !name.trim() ? t('gr_err_name') : taken ? t('gr_err_name_taken') : null;
    // A locked role stays as saved, even when that is none
    const roleError = !role && !roleLocked ? t('gr_err_role') : null;

    const guardClose = useDiscardGuard(open && dirty && saveStep === 'idle');
    const close = () => guardClose(onClose);

    // Staging: ticking someone stages them; taking out a staged person just un-stages them
    const toggleStaged = (person: GroupMember) =>
        setAdded((prev) => {
            const next = new Map(prev);
            if (next.has(person.id)) next.delete(person.id);
            else next.set(person.id, person);
            return next;
        });
    const addMany = (people: GroupMember[]) =>
        setAdded((prev) => {
            const next = new Map(prev);
            people.forEach((p) => next.set(p.id, p));
            return next;
        });
    const removeMany = (ids: number[]) =>
        setAdded((prev) => {
            const next = new Map(prev);
            ids.forEach((id) => next.delete(id));
            return next;
        });
    const takeOut = (person: GroupMember) => {
        if (added.has(person.id)) {
            toggleStaged(person);
            return;
        }
        setRemoved((prev) => new Map(prev).set(person.id, person));
    };
    const undoTakeOut = (person: GroupMember) =>
        setRemoved((prev) => {
            const next = new Map(prev);
            next.delete(person.id);
            return next;
        });

    const openSave = () => {
        if (nameError || roleError) {
            setTried(true);
            (nameError ? nameRef : roleRef).current?.focus();
            return;
        }
        setSaveError(null);
        setSaveStep('confirm');
    };

    const runSave = async () => {
        setSaveError(null);
        setSaveStep('saving');
        try {
            if (group) {
                await update.mutateAsync({
                    id: group.id,
                    payload: { name: name.trim(), role: role || null, add_ids: [...added.keys()], remove_ids: [...removed.keys()] },
                });
            } else {
                await create.mutateAsync({ name: name.trim(), role: role || null, employee_ids: [...added.keys()] });
            }
        } catch (err: unknown) {
            setSaveError(permissionRefusalText(err, t));
            setSaveStep('confirm');
            return;
        }
        // Same beat as the Role Templates save: the check, then the saved notice
        setSaveStep('done');
        const saved = { name: name.trim(), members: memberCount };
        setTimeout(() => {
            setSaveStep('idle');
            onClose();
            onSaved(saved);
            void refreshList();
        }, 850);
    };

    const askDelete = async () => {
        if (group && (await deleteGroup(group))) onClose();
    };

    const movedIn = [...added.values()].filter((p) => p.group_id !== null).length;
    const confirmLines = [
        t('gr_confirm_group').replace('{name}', name.trim()),
        added.size > 0 &&
            (movedIn > 0
                ? t(countKey('gr_confirm_add_moved', added.size)).replace('{n}', fmtN(added.size)).replace('{m}', fmtN(movedIn))
                : t(countKey('gr_confirm_add', added.size)).replace('{n}', fmtN(added.size))),
        removed.size > 0 && removeLine(t, removed.size, fmtN(removed.size), leavesTo?.name ?? null, baseRole),
        roleChanged && chosenRole && t('gr_confirm_role').replace('{role}', roleLabel(chosenRole)),
        nameChanged && group && t('gr_confirm_rename').replace('{name}', group.name),
        group === null && added.size === 0 && t('gr_no_members'),
    ].filter((line): line is string => !!line);

    const fieldLabel = (htmlFor: string, text: string, changed: boolean) => (
        <label htmlFor={htmlFor} className={cn('text-sm font-medium', changed && 'font-semibold text-orange-700 dark:text-orange-400')}>
            {text}
        </label>
    );
    const showNameError = tried && nameError !== null;
    const showRoleError = tried && roleError !== null;
    const roleHelp = roleLocked && !readOnly ? t('perm_refusal_own_access') : !isSuper ? t('gr_role_ceiling') : null;
    const deleteBlocked = group?.includes_me ? t('perm_refusal_own_access') : null;

    return (
        <>
            <Dialog open={open} onOpenChange={(o) => !o && close()}>
                <DialogContent
                    className={focusDialogContentClass}
                    // Focus the dialog itself: a field would raise the iPad keyboard
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement | null)?.focus();
                    }}
                >
                    <FocusDialogHeader
                        icon={Users}
                        eyebrow={group === null ? t('gr_add') : readOnly ? t('gr_view') : t('gr_edit')}
                        title={name.trim() || group?.name || t('gr_new_title')}
                    />

                    {readOnly && (
                        <div className="border-border flex items-center gap-2 border-t bg-amber-50 px-6 py-2.5 text-[13px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                            <Lock className="h-4 w-4 shrink-0" aria-hidden />
                            {t('gr_admin_protected')}
                        </div>
                    )}

                    {/* Name and role */}
                    <div className="border-border grid gap-4 border-t px-6 py-4 md:grid-cols-2">
                        <div className="grid content-start gap-1.5">
                            {fieldLabel('gr-name', t('gr_name'), nameChanged)}
                            <Input
                                ref={nameRef}
                                id="gr-name"
                                name="group-name"
                                autoComplete="off"
                                value={name}
                                readOnly={readOnly}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('gr_name_ph')}
                                aria-invalid={showNameError || undefined}
                                aria-describedby={showNameError ? 'gr-name-error' : undefined}
                                className={cn(showNameError && 'border-destructive')}
                            />
                            {showNameError && (
                                <p id="gr-name-error" className="text-destructive text-xs">
                                    {nameError}
                                </p>
                            )}
                        </div>
                        <div className="grid content-start gap-1.5">
                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                                {fieldLabel('gr-role', t('gr_role'), roleChanged)}
                                <span id="gr-role-help" className="text-muted-foreground text-xs">
                                    {roleHelp ?? (chosenRole ? t('gr_role_help').replace('{role}', roleLabel(chosenRole)) : t('gr_role_help_none'))}
                                </span>
                            </div>
                            <Select value={role || undefined} onValueChange={setRole} disabled={roleLocked}>
                                <SelectTrigger
                                    ref={roleRef}
                                    id="gr-role"
                                    aria-invalid={showRoleError || undefined}
                                    aria-describedby={showRoleError ? 'gr-role-help gr-role-error' : 'gr-role-help'}
                                    className={cn(showRoleError && 'border-destructive')}
                                >
                                    <SelectValue placeholder={t('select_placeholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles.map((r) => (
                                        <SelectItem key={r.key} value={r.key} disabled={r.key !== role && isOverCeiling(r, isSuper, myPermissions)}>
                                            <span className="flex items-center gap-2">
                                                <RoleBar color={r.color} />
                                                {roleLabel(r)}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {showRoleError && (
                                <p id="gr-role-error" className="text-destructive text-xs">
                                    {roleError}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Narrow screens show one pane at a time */}
                    {!readOnly && (
                        <div className="border-border flex gap-1 border-t px-4 lg:hidden" role="tablist">
                            {(['pick', 'members'] as const).map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === id}
                                    onClick={() => setTab(id)}
                                    className={cn(
                                        '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium',
                                        tab === id ? 'border-brand text-foreground' : 'text-muted-foreground border-transparent',
                                    )}
                                >
                                    {id === 'pick' ? t('gr_pick_title') : `${t('gr_members_title')} (${fmtN(memberCount)})`}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className={cn('border-border grid min-h-0 flex-1 border-t', !readOnly && 'lg:grid-cols-2')}>
                        {!readOnly && (
                            <div className={cn('border-border min-h-0 flex-col lg:flex lg:border-r', tab === 'pick' ? 'flex' : 'hidden')}>
                                <GroupMemberPicker
                                    key={paneKey}
                                    groupId={group?.id ?? null}
                                    groupOverCeiling={groupOverCeiling}
                                    added={added}
                                    onToggle={toggleStaged}
                                    onAddMany={addMany}
                                    onRemoveMany={removeMany}
                                />
                            </div>
                        )}
                        <div className={cn('min-h-0 flex-col lg:flex', readOnly || tab === 'members' ? 'flex' : 'hidden')}>
                            <GroupMemberList
                                key={paneKey}
                                groupId={group?.id ?? null}
                                memberCount={memberCount}
                                added={added}
                                removed={removed}
                                onRemove={takeOut}
                                onUndo={undoTakeOut}
                                leaveNote={leaveNote}
                                readOnly={readOnly}
                            />
                        </div>
                    </div>

                    <div className="border-border bg-muted/30 flex items-center justify-end gap-2 border-t px-6 py-3">
                        {group !== null && !readOnly && (
                            <span className="mr-auto flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    onClick={() => void askDelete()}
                                    disabled={deleteBlocked !== null}
                                    aria-describedby={deleteBlocked ? 'gr-delete-blocked' : undefined}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t('gr_delete')}
                                </Button>
                                {deleteBlocked && (
                                    <>
                                        <span id="gr-delete-blocked" className="sr-only">
                                            {deleteBlocked}
                                        </span>
                                        <LockHint text={deleteBlocked} />
                                    </>
                                )}
                            </span>
                        )}
                        {!readOnly && (
                            <span
                                role="status"
                                aria-live="polite"
                                className={cn(
                                    'text-muted-foreground mr-2 flex items-center gap-1.5 text-xs',
                                    changes === 0 && 'invisible',
                                    group === null && 'mr-auto',
                                )}
                            >
                                <span className="h-2 w-2 rounded-full bg-orange-600 dark:bg-orange-400" aria-hidden />
                                {t('perm_ui_unsaved')} <b className="text-foreground font-semibold tabular-nums">{fmtN(changes)}</b>
                            </span>
                        )}
                        <Button variant="outline" onClick={close}>
                            {readOnly ? t('close') : t('cancel')}
                        </Button>
                        {!readOnly && (
                            <Button onClick={openSave} disabled={group !== null && changes === 0}>
                                {t('save')}
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <CenteredAlert
                open={saveStep !== 'idle'}
                icon={PencilLine}
                title={group === null ? t('gr_confirm_create_title') : t('perm_confirm_title')}
                busy={saveStep === 'saving' || saveStep === 'done'}
                onClose={() => setSaveStep('idle')}
                actions={
                    <>
                        <Button variant="outline" className="w-full" disabled={saveStep !== 'confirm'} onClick={() => setSaveStep('idle')}>
                            {t('cancel')}
                        </Button>
                        <Button className="w-full font-semibold" disabled={saveStep !== 'confirm'} onClick={() => void runSave()}>
                            {saveStep === 'saving' ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('saving')}
                                </>
                            ) : saveStep === 'done' ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {t('saved')}
                                </>
                            ) : (
                                t('save')
                            )}
                        </Button>
                    </>
                }
            >
                {confirmLines.map((line) => (
                    <span key={line} className="block">
                        {line}
                    </span>
                ))}
                {saveError && (
                    <span role="alert" className="text-destructive mt-2 block">
                        {saveError}
                    </span>
                )}
            </CenteredAlert>
        </>
    );
}
