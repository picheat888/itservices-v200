import { translate, useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { EmptyState } from '@/shared/components/empty-state';
import { PageTabs } from '@/shared/components/page-tabs';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ListSkeleton } from '@/shared/components/skeletons';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNavigationGuard } from '@/shared/hooks/use-navigation-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useTabParam } from '@/shared/hooks/use-tab-param';
import { searchLabel } from '@/shared/lib/search-words';
import { CARD_HEADING } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Briefcase, LayoutDashboard, Lock, PencilLine, Plus, Save, Search, Shield, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RoleRow } from '../api/permissionApi';
import { AuditLogTab } from '../components/audit-log-tab';
import { CenteredAlert } from '../components/centered-alert';
import { GroupRolesTab } from '../components/group-roles-tab';
import { LoginLogTab } from '../components/login-log-tab';
import { CHANGED_TEXT, PermissionViewProvider } from '../components/permission-layout';
import { PermissionTreeCard } from '../components/permission-tree-card';
import { RoleBar } from '../components/role-bar';
import { RoleModal, type RoleModalMode } from '../components/role-modal';
import { RoleRowMenu } from '../components/role-row-menu';
import { usePermissionMatrix, useRoleMutations, useUpdateRolePermissions } from '../hooks/use-permissions';
import { cardCountSpec, cardSections, countingHas, pageCards, type CardLayout } from '../lib/card-layout';
import { rebaseDraft, specEdges } from '../lib/draft-rebase';
import { isOwnRole } from '../lib/own-role';
import { countGranted, hiddenHitCount, specKeys } from '../lib/permission-count';
import { actionLabel, isLivePermission, moduleLabel } from '../lib/permission-labels';
import { isRoleChanged } from '../lib/refusal';

/** The tab slugs, which are also what ?tab= carries — no mapping layer to keep in step. */
const TABS = ['templates', 'groups', 'logs', 'logins'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => TABS.includes(v as Tab);
// URL keys of the Logs, Login and Role Groups lists; cleared when the tab changes.
const TAB_LIST_KEYS = ['search', 'category', 'user', 'event', 'from', 'to', 'page', 'per', 'role', 'sort', 'view', 'add'];

/** Permission each tab's own endpoints require. */
const TAB_PERMISSION: Record<Tab, string> = {
    templates: 'system.manage_roles',
    groups: 'system.manage_groups',
    logs: 'system.view_audit',
    logins: 'system.view_logins',
};

export default function PermissionsPage() {
    const t = useT();
    const { can } = useAuth();
    const allowed = TABS.filter((id) => can(TAB_PERMISSION[id]));
    const isAllowedTab = (v: string | null): v is Tab => isTab(v) && allowed.includes(v);

    // Active tab in ?tab= (useTabParam); an unknown or forbidden tab falls back to the first allowed one
    const [allowedTab, setTab] = useTabParam(isAllowedTab, allowed[0] ?? 'templates');
    const tab: Tab | null = allowed.length > 0 ? allowedTab : null;
    // Unsaved role-permission draft; leaving the matrix tab asks first.
    const [rolesDirty, setRolesDirty] = useState(false);
    const guardTabSwitch = useDiscardGuard(tab === 'templates' && rolesDirty);
    const changeTab = (next: Tab) => {
        if (next === tab) return;
        guardTabSwitch(() => setTab(next, { extra: (params) => TAB_LIST_KEYS.forEach((key) => params.delete(key)) }));
    };

    const labels: Record<Tab, string> = {
        templates: t('perm_roles'),
        groups: t('perm_groups'),
        logs: t('perm_audit'),
        logins: t('perm_logins'),
    };
    const tabs = allowed.map((id) => ({ id, label: labels[id] }));

    return (
        <div className="space-y-6">
            <div className="mb-3">
                <h1 className="text-2xl font-bold">{t('permissions')}</h1>
                <p className="text-muted-foreground text-sm">{t('perm_sub')}</p>
            </div>

            <Card className="overflow-clip p-0">
                {tab !== null && <PageTabs tabs={tabs} active={tab} onChange={changeTab} />}

                {tab === 'templates' && <RolesTab onDirtyChange={setRolesDirty} />}
                {tab === 'groups' && <GroupRolesTab />}
                {tab === 'logs' && <AuditLogTab />}
                {tab === 'logins' && <LoginLogTab />}
                {tab === null && <EmptyState kind="denied" title={t('perm_empty_no_tabs')} hint={t('perm_empty_no_tabs_hint')} />}
            </Card>
        </div>
    );
}

// Section icons by section label (lib/card-layout.ts sorts the cards into sections); "Other" takes Shield
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    nav_overview: LayoutDashboard,
    nav_workspace: Briefcase,
    nav_admin: Shield,
};

function RolesTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { data, isLoading, isError, refetch } = usePermissionMatrix();
    const update = useUpdateRolePermissions();
    const roleMut = useRoleMutations();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [draft, setDraft] = useState<Set<string>>(new Set());
    // The mode stays on close, so the dialog keeps its words through the exit animation
    const [roleModal, setRoleModal] = useState<{ open: boolean; mode: RoleModalMode }>({ open: false, mode: { kind: 'create' } });
    const [query, setQuery] = useState('');
    // Save flow: centred confirm (count frozen at open), ✓ flash, then the saved notice
    const [saveStep, setSaveStep] = useState<'idle' | 'confirm' | 'saving' | 'done'>('idle');
    const [pending, setPending] = useState(0);
    const [saveError, setSaveError] = useState<unknown>(null);
    const [saved, setSaved] = useState<{ label: string; members: number } | null>(null);

    const roles = data?.roles ?? [];
    // Selected role in ?role= (the first role is the bare URL); an unknown key falls back to the first
    const role: RoleRow | undefined = roles.find((r) => r.value === searchParams.get('role')) ?? roles[0];
    const selectRole = (key: string) =>
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (key === roles[0]?.value) params.delete('role');
            else params.set('role', key);
            return params;
        });

    // An unknown or deleted ?role= leaves the URL (replace), so the bare URL means the first role again
    const roleParam = searchParams.get('role');
    const unknownRoleParam = data !== undefined && roleParam !== null && !roles.some((r) => r.value === roleParam);
    useEffect(() => {
        if (!unknownRoleParam) return;
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                params.delete('role');
                return params;
            },
            { replace: true },
        );
    }, [unknownRoleParam, setSearchParams]);

    // Retired keys a role still holds stay out of the draft so the save passes server validation
    const catalogKeys = useMemo(
        () => new Set(Object.entries(data?.catalog ?? {}).flatMap(([module, actions]) => actions.map((action) => `${module}.${action}`))),
        [data],
    );
    const heldKeys = (r: RoleRow) => new Set(r.permissions.filter((p) => catalogKeys.has(p)));
    // Every card of the page with its count spec: the server layout, then a plain card per unknown module
    const cards = useMemo(() => pageCards(data?.layout ?? [], data?.catalog ?? {}), [data]);
    const specs = useMemo(() => new Map(cards.map((card) => [card, cardCountSpec(card)])), [cards]);
    const specOf = (card: CardLayout) => specs.get(card) ?? cardCountSpec(card);
    // Master/view rules of every card, for rebasing a draft onto a newer stored set
    const draftEdges = useMemo(() => [...specs.values()].flatMap(specEdges), [specs]);

    /** Delete a role template, or say up front why the API would refuse it. */
    const handleDeleteRole = (r: RoleRow) => {
        const blocked = r.is_system
            ? t('role_del_blocked_system')
            : r.members > 0
              ? t('role_del_blocked_members').replace('{n}', fmtN(r.members))
              : r.groups > 0
                ? t('role_del_blocked_group').replace('{n}', fmtN(r.groups))
                : null;

        if (blocked) {
            confirm({
                variant: 'warn',
                hideCancel: true,
                title: t('role_del_blocked_title'),
                description: blocked,
                // Nothing to agree to here — the one button acknowledges a refusal.
                confirmText: t('role_del_blocked_ack'),
            });
            return;
        }

        void confirm({ variant: 'danger', entity: { name: r.label }, action: () => roleMut.remove.mutateAsync(r.value) });
    };

    const original = useMemo(() => new Set(role ? role.permissions.filter((p) => catalogKeys.has(p)) : []), [role, catalogKeys]);
    // Keys whose saved state differs from the draft; drives the orange labels and the unsaved count.
    const changedKeys = useMemo(() => {
        const keys = new Set<string>();
        for (const p of draft) if (!original.has(p)) keys.add(p);
        for (const p of original) if (!draft.has(p)) keys.add(p);
        return keys;
    }, [draft, original]);
    const dirty = changedKeys.size > 0;
    const guardRoleSwitch = useDiscardGuard(dirty);
    // Links, Back and Forward that leave the page, the tab or the role ask first
    useNavigationGuard(dirty, ['tab', 'role']);
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    // The stored set the draft stands on and its version (sent with the save)
    const seededFor = useRef<string | null>(null);
    const seedKeys = useRef<Set<string>>(new Set());
    const draftVersion = useRef('');
    /** A newly selected role seeds the draft; a newer version of the same role rebases the unsaved changes onto it. */
    const adoptStored = (stored: RoleRow) => {
        const keys = heldKeys(stored);
        if (seededFor.current !== stored.value) {
            seededFor.current = stored.value;
            seedKeys.current = keys;
            draftVersion.current = stored.version;
            setDraft(keys);
            return;
        }
        if (draftVersion.current === stored.version) return;
        const seed = seedKeys.current;
        seedKeys.current = keys;
        draftVersion.current = stored.version;
        setDraft((prev) => rebaseDraft(prev, seed, keys, draftEdges));
    };
    useEffect(() => {
        if (role) adoptStored(role);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role?.value, role?.version]);

    // The saved notice follows the ✓ beat; a tab left mid-beat drops it
    const doneTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(doneTimer.current), []);
    const pickerId = useId();
    const roleHeading = useRef<HTMLHeadingElement>(null);

    // A refused or failed load says so
    if (isError) return <div className="text-muted-foreground p-10 text-center text-sm">{t('perm_load_failed')}</div>;

    if (isLoading || !data || !role) return <RolesSkeleton />;

    const ownRole = isOwnRole(role, user?.role);
    const readOnly = role.is_super || ownRole;

    // Held = in the draft (super holds all); coming-soon-aware cards count only live keys
    const has = (key: string) => role.is_super || draft.has(key);
    const countHas = (card: CardLayout) => countingHas(card, has, isLivePermission);
    const tally = (card: CardLayout) => countGranted(specOf(card), countHas(card));

    const keyLabel = (key: string) => {
        const [mod, action] = key.split('.');
        return actionLabel(mod, action, lang);
    };
    const q = query.trim().toLowerCase();
    const isHit = (key: string) => q !== '' && keyLabel(key).toLowerCase().includes(q);
    const matches = (card: CardLayout) => !q || moduleLabel(card.module, lang).toLowerCase().includes(q) || specKeys(specOf(card)).some(isHit);
    const searchPlaceholder = t('perm_search_ph');

    const sectionViews = cardSections(cards)
        .map((section) => ({ section, groups: section.cards, shown: section.cards.filter(matches) }))
        .filter((s) => s.shown.length > 0);
    // Hits each card keeps behind its off master, for the master band
    const hiddenHits = new Map(
        sectionViews.flatMap(({ shown }) => shown.map((card) => [card.module, hiddenHitCount(specOf(card), countHas(card), isHit)] as const)),
    );

    // Role list and tablet picker share one guarded switch; it pushes ?role= so Back steps through roles
    const switchRole = (key: string) => {
        if (key !== role.value) guardRoleSwitch(() => selectRole(key));
    };
    const editRole = (r: RoleRow) => setRoleModal({ open: true, mode: { kind: 'edit', role: r } });
    const duplicateRole = (r: RoleRow) => setRoleModal({ open: true, mode: { kind: 'duplicate', source: r, savedCount: heldKeys(r).size } });
    const roleOptions = roles.map((r) => ({ value: r.value, label: r.label, search: r.label, icon: <RoleBar color={r.color} className="h-4" /> }));

    const openSave = () => {
        setPending(changedKeys.size);
        setSaveError(null);
        setSaveStep('confirm');
    };
    const runSave = async () => {
        setSaveError(null);
        setSaveStep('saving');
        try {
            const fresh = await update.mutateAsync({ role: role.value, permissions: [...draft], version: draftVersion.current });
            // The draft takes the stored set, so nothing reads as unsaved
            const stored = fresh.roles.find((r) => r.value === role.value);
            if (stored) {
                const keys = heldKeys(stored);
                seedKeys.current = keys;
                draftVersion.current = stored.version;
                setDraft(keys);
            }
        } catch (err: unknown) {
            if (isRoleChanged(err)) {
                // Someone else saved this role: rebase onto the latest, then the reader reviews and saves again
                const { data: latest } = await refetch();
                const stored = latest?.roles.find((r) => r.value === role.value);
                if (stored) adoptStored(stored);
                setSaveStep('idle');
                useToastStore.getState().push(t('perm_refusal_role_changed'), 'warning');
                return;
            }
            setSaveError(err);
            setSaveStep('confirm');
            return;
        }
        // Same beat as the shared confirm's success check, then the saved notice
        setSaveStep('done');
        const savedRole = { label: role.label, members: role.members };
        doneTimer.current = window.setTimeout(() => {
            setSaveStep('idle');
            setSaved(savedRole);
        }, 850);
    };

    const renderCard = (card: CardLayout) => (
        <PermissionTreeCard key={card.module} card={card} draft={draft} setDraft={setDraft} isSuper={role.is_super} lang={lang} />
    );

    return (
        <PermissionViewProvider
            value={{
                changed: (key) => changedKeys.has(key),
                query,
                hiddenHits: (module) => hiddenHits.get(module) ?? 0,
                superRole: role.is_super,
                ownRole,
            }}
        >
            <div className="border-border flex items-center justify-between border-b p-3">
                <span className="text-muted-foreground text-sm">{translate(lang, 'perm_ui_all_templates')}</span>
                <Button onClick={() => setRoleModal({ open: true, mode: { kind: 'create' } })}>
                    <Plus className="h-4 w-4" />
                    {t('perm_new_role')}
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                {/* Role list; below lg the sticky header's picker stands in for it */}
                <div className="border-border hidden border-r lg:block">
                    {roles.map((r) => (
                        <div
                            key={r.value}
                            className={cn(
                                'group border-border hover:bg-accent/50 flex items-center justify-between border-b transition-colors',
                                r.value === role.value && 'bg-brand/10',
                            )}
                        >
                            <button
                                type="button"
                                aria-current={r.value === role.value ? 'true' : undefined}
                                onClick={() => switchRole(r.value)}
                                className="flex min-w-0 flex-1 items-center gap-2 py-3.5 pl-4 text-left"
                            >
                                <RoleBar color={r.color} className="h-6" />
                                <span className={cn('block text-sm font-semibold', r.value === role.value && 'text-brand-ink')}>{r.label}</span>
                            </button>
                            <RoleRowMenu
                                role={r}
                                onEdit={() => editRole(r)}
                                onDuplicate={() => duplicateRole(r)}
                                onDelete={() => handleDeleteRole(r)}
                                className="pr-2"
                            />
                        </div>
                    ))}
                </div>

                <div className="min-w-0 px-5 pb-5">
                    {/* Role header: sticks while the cards scroll, so Save is always in reach */}
                    <div className="bg-card border-border sticky top-[var(--sticky-top,0px)] z-10 mb-4 flex flex-wrap items-center justify-between gap-3 border-b py-4 lg:flex-nowrap">
                        <div className="min-w-0 lg:flex-1">
                            <h2
                                ref={roleHeading}
                                tabIndex={-1}
                                title={role.label}
                                className="sr-only text-lg font-bold focus:outline-none lg:not-sr-only lg:block lg:truncate"
                            >
                                {role.label}
                            </h2>
                            {/* Below lg: the role list as a picker, with the chosen role's edit and delete */}
                            <div className="mb-1 flex items-center gap-1 lg:hidden">
                                <label htmlFor={pickerId} className="sr-only">
                                    {t('perm_roles')}
                                </label>
                                <div className="w-64 max-w-full">
                                    <SearchableSelect
                                        id={pickerId}
                                        value={role.value}
                                        onChange={switchRole}
                                        options={roleOptions}
                                        searchPlaceholder={t('gr_role_search')}
                                    />
                                </div>
                                <RoleRowMenu
                                    role={role}
                                    onEdit={() => editRole(role)}
                                    onDuplicate={() => duplicateRole(role)}
                                    onDelete={() => handleDeleteRole(role)}
                                />
                            </div>
                            <div className="text-muted-foreground text-xs">
                                {role.is_super
                                    ? t('perm_super_locked')
                                    : ownRole
                                      ? t('perm_own_role_sub').replace('{n}', fmtN(draft.size))
                                      : `${fmtN(draft.size)} ${t('perm_enabled')}`}
                            </div>
                        </div>
                        {/* Below lg: search fills its own row, Save stays at the right edge */}
                        <div className="flex flex-wrap items-end gap-2 max-lg:w-full max-lg:flex-nowrap lg:shrink-0 lg:flex-nowrap">
                            <div className="relative w-72 max-w-full max-lg:w-auto max-lg:min-w-0 max-lg:flex-1 lg:max-xl:w-60">
                                <Search
                                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                                    aria-hidden
                                />
                                <Input
                                    type="search"
                                    name="perm-search"
                                    autoComplete="off"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={searchPlaceholder}
                                    aria-label={searchLabel(searchPlaceholder)}
                                    className="pl-9 text-ellipsis"
                                />
                            </div>
                            {/* Amber badge where Save stands: the role is protected, not wrong */}
                            {readOnly ? (
                                <span className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
                                    <Lock className="h-3.5 w-3.5 shrink-0" />
                                    {ownRole ? t('perm_own_readonly') : t('perm_super_readonly')}
                                </span>
                            ) : (
                                <div className="flex flex-col items-end gap-1">
                                    <span
                                        role="status"
                                        aria-live="polite"
                                        className={cn('text-muted-foreground flex items-center gap-1.5 text-xs leading-4', !dirty && 'invisible')}
                                    >
                                        <span className="h-2 w-2 rounded-full bg-orange-600 dark:bg-orange-400" aria-hidden />
                                        {t('perm_ui_unsaved')} <b className="text-foreground font-semibold tabular-nums">{fmtN(changedKeys.size)}</b>
                                    </span>
                                    <Button disabled={!dirty || update.isPending} onClick={openSave}>
                                        <Save className="h-4 w-4" />
                                        {t('perm_save')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        {sectionViews.map(({ section, groups, shown }) => {
                            const SectionIcon = SECTION_ICONS[section.label] ?? Shield;
                            const sectionActions = groups.flatMap((card) => specKeys(specOf(card)));
                            const sectionCount = groups
                                .map(tally)
                                .reduce((sum, c) => ({ on: sum.on + c.on, total: sum.total + c.total }), { on: 0, total: 0 });
                            return (
                                <div key={section.label}>
                                    <div className="border-border mb-3 flex items-center gap-2 border-b pb-1.5">
                                        <SectionIcon className="text-muted-foreground h-4 w-4" />
                                        <h2 className="text-foreground text-sm font-bold">{t(section.label)}</h2>
                                        <span
                                            className={cn(
                                                'text-muted-foreground ml-auto text-xs tabular-nums',
                                                sectionActions.some((k) => changedKeys.has(k)) && CHANGED_TEXT,
                                            )}
                                        >
                                            {fmtN(sectionCount.on)} / {fmtN(sectionCount.total)}
                                        </span>
                                    </div>
                                    {/* Full-width cards; each lays its switches in ruled cells */}
                                    <div className="space-y-4">{shown.map(renderCard)}</div>
                                </div>
                            );
                        })}
                        {sectionViews.length === 0 && (
                            <EmptyState kind="search" title={t('perm_search_none').replace('{q}', query.trim())} hint={t('perm_search_none_hint')} />
                        )}
                    </div>
                </div>
            </div>

            <RoleModal
                open={roleModal.open}
                mode={roleModal.mode}
                onClose={() => setRoleModal((m) => ({ ...m, open: false }))}
                onDuplicated={switchRole}
            />

            <CenteredAlert
                open={saveStep !== 'idle'}
                icon={PencilLine}
                title={t('perm_confirm_title')}
                busy={saveStep === 'saving' || saveStep === 'done'}
                error={saveError}
                returnFocus={() => roleHeading.current}
                onClose={() => setSaveStep('idle')}
                actions={
                    <>
                        <Button variant="outline" className="w-full" disabled={saveStep !== 'confirm'} onClick={() => setSaveStep('idle')}>
                            {t('cancel')}
                        </Button>
                        <SaveButton
                            className="w-full font-semibold disabled:opacity-100"
                            loading={saveStep === 'saving'}
                            success={saveStep === 'done'}
                            disabled={saveStep !== 'confirm'}
                            onClick={runSave}
                        >
                            {t('perm_save')}
                        </SaveButton>
                    </>
                }
            >
                <span className="block">{t('perm_confirm_role').replace('{name}', role.label)}</span>
                <span className="block">{t('perm_confirm_count').replace('{n}', fmtN(pending))}</span>
            </CenteredAlert>

            <CenteredAlert
                open={saved !== null}
                icon={ShieldCheck}
                title={t('perm_saved_title')}
                returnFocus={() => roleHeading.current}
                onClose={() => setSaved(null)}
                actions={
                    <Button className="w-full font-semibold" onClick={() => setSaved(null)}>
                        {t('perm_ui_ok')}
                    </Button>
                }
            >
                {saved &&
                    (saved.members > 0
                        ? t('perm_saved_desc').replace('{name}', saved.label).replace('{n}', fmtN(saved.members))
                        : t('perm_saved_desc_none').replace('{name}', saved.label))}
            </CenteredAlert>
        </PermissionViewProvider>
    );
}

/** Loading Role Templates: role list, sticky header, then cards with a heading strip, master band and ruled cells. */
function RolesSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]" aria-busy>
            <div className="border-border hidden border-r lg:block">
                <ListSkeleton rows={4} />
            </div>
            <div className="min-w-0 px-5 pb-5">
                <div className="border-border mb-4 flex flex-wrap items-center justify-between gap-3 border-b py-4">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-10 w-72 max-w-full" />
                </div>
                <div className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    {[3, 2].map((cells, i) => (
                        <div key={i} className="border-border @container overflow-clip rounded-lg border">
                            <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-3.5 py-3')}>
                                <Skeleton className="h-3 w-28" />
                                <Skeleton className="h-3 w-10" />
                            </div>
                            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-3">
                                <div className="space-y-1.5">
                                    <Skeleton className="h-3.5 w-36" />
                                    <Skeleton className="h-3 w-56 max-w-full" />
                                </div>
                                <Skeleton className="ml-auto h-5 w-9 rounded-full" />
                            </div>
                            <div className="grid grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3">
                                {Array.from({ length: cells }).map((_, j) => (
                                    <div key={j} className="border-border -mt-px -ml-px space-y-3 border-t border-l px-4 pt-3 pb-4">
                                        <Skeleton className="h-6 w-full" />
                                        <Skeleton className="h-3 w-3/4" />
                                        <Skeleton className="h-3 w-2/3" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
