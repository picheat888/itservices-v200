import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, GeneralCell, GroupHead, GroupNote, PermissionCard, PermissionCell, PlainRow, SetHead } from './permission-layout';

// Mirrors App\Support\Permissions::ticketHierarchy() — keep in sync.
const MASTER = 'tickets.module';
// Self-service: `create` (+ its child `edit_own`) and `my` survive without the master.
const STANDALONE = { view: 'tickets.create', children: ['tickets.edit_own'] };
const STANDALONE_SOLO = 'tickets.my';
// Ticket Level keys — scope which categories a staff member sees / takes / gets alerts for.
const LEVELS = [
    'tickets.level_hardware',
    'tickets.level_software',
    'tickets.level_network',
    'tickets.level_cctv',
    'tickets.level_telephone',
    'tickets.level_other',
];
const GROUPS: { view: string; children: string[]; chip?: boolean }[] = [
    { view: 'tickets.view_dashboard', children: [], chip: false },
    { view: 'tickets.view_all', children: ['tickets.resolve', 'tickets.forward', 'tickets.assign', 'tickets.set_work_class'] },
    { view: 'tickets.jobs', children: [], chip: false },
];
// Every key that lives under the master (excludes the standalone keys).
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children]), ...LEVELS];

const label = (key: string, lang: Lang) => actionLabel('tickets', key.replace('tickets.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('tickets', key.replace('tickets.', ''), lang);

/** True when every ancestor (master, and the group view for a child) is on. */
function hasAncestors(key: string, has: (k: string) => boolean): boolean {
    if (!has(MASTER)) {
        return false;
    }
    const parent = GROUPS.find((g) => g.children.includes(key));
    if (parent) {
        return has(parent.view);
    }
    return true;
}

/** Tickets card: master → group → management with cascade; the self-service keys stand outside the master. */
export function TicketPermissionTree({
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);
    const masterOn = has(MASTER);

    const toggle = (key: string) => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (key === MASTER) {
                    GATED_KEYS.forEach((k) => next.delete(k));
                }
                const group = GROUPS.find((g) => g.view === key);
                if (group) {
                    group.children.forEach((c) => next.delete(c));
                }
                // Turning off "Open Ticket" clears its edit child.
                if (key === STANDALONE.view) {
                    STANDALONE.children.forEach((c) => next.delete(c));
                }
            } else {
                next.add(key);
                const parent = GROUPS.find((g) => g.children.includes(key));
                if (parent) {
                    next.add(parent.view);
                    next.add(MASTER);
                }
                if (GROUPS.some((g) => g.view === key) || LEVELS.includes(key)) {
                    next.add(MASTER);
                }
                // A standalone child implies its self-service view (not the master).
                if (STANDALONE.children.includes(key)) {
                    next.add(STANDALONE.view);
                }
            }
            return next;
        });
    };

    const createOn = has(STANDALONE.view);
    const standaloneActive = (createOn ? 1 : 0) + STANDALONE.children.filter((c) => has(c) && createOn).length + (has(STANDALONE_SOLO) ? 1 : 0);
    const gatedActive = masterOn ? GATED_KEYS.filter((k) => has(k) && hasAncestors(k, has)).length : 0;
    const activeCount = gatedActive + standaloneActive;
    const totalCount = GATED_KEYS.length + 1 + STANDALONE.children.length + 1; // + create + its children + my
    const view = (key: string) => ({
        pkey: key,
        label: label(key, lang),
        info: info(key, lang),
        on: has(key) && masterOn,
        locked: isSuper || !masterOn,
        onToggle: () => toggle(key),
    });

    return (
        <PermissionCard
            module="tickets"
            on={activeCount}
            total={totalCount}
            lang={lang}
            keys={[...GATED_KEYS, STANDALONE.view, ...STANDALONE.children, STANDALONE_SOLO]}
            master={{
                pkey: MASTER,
                label: label(MASTER, lang),
                on: masterOn,
                locked: isSuper,
                onToggle: () => toggle(MASTER),
                rest: GATED_KEYS.length - 1,
            }}
        >
            {masterOn && (
                <>
                    <GeneralCell lang={lang} rows={GROUPS.filter((g) => g.children.length === 0).map((g) => ({ key: g.view, ...view(g.view) }))} />
                    {GROUPS.filter((g) => g.children.length > 0).map((group) => {
                        const viewOn = has(group.view) && masterOn;
                        return (
                            <PermissionCell key={group.view}>
                                <GroupHead chip={group.chip !== false} lang={lang} {...view(group.view)} />
                                <ChildList>
                                    {group.children.map((child) => (
                                        <ChildRow
                                            key={child}
                                            pkey={child}
                                            label={label(child, lang)}
                                            aria={`${label(group.view, lang)} ${label(child, lang)}`}
                                            info={info(child, lang)}
                                            on={has(child) && viewOn}
                                            locked={isSuper || !viewOn}
                                            onToggle={() => toggle(child)}
                                        />
                                    ))}
                                </ChildList>
                            </PermissionCell>
                        );
                    })}
                    {/* Ticket Level cluster — which categories this role may see / take / be alerted about. */}
                    <PermissionCell>
                        <SetHead label={translate(lang, 'perm_ui_tickets_level')} info={translate(lang, 'perm_ui_tickets_level_hint')} />
                        <ChildList>
                            {LEVELS.map((level) => (
                                <ChildRow
                                    key={level}
                                    pkey={level}
                                    label={label(level, lang)}
                                    on={has(level) && masterOn}
                                    locked={isSuper || !masterOn}
                                    onToggle={() => toggle(level)}
                                />
                            ))}
                        </ChildList>
                    </PermissionCell>
                </>
            )}

            {/* Standalone self-service keys — never locked by the master. */}
            <PermissionCell>
                <GroupHead
                    lang={lang}
                    pkey={STANDALONE.view}
                    label={label(STANDALONE.view, lang)}
                    on={createOn}
                    locked={isSuper}
                    onToggle={() => toggle(STANDALONE.view)}
                />
                <GroupNote>{translate(lang, 'perm_ui_self_service')}</GroupNote>
                <ChildList>
                    {STANDALONE.children.map((child) => (
                        <ChildRow
                            key={child}
                            pkey={child}
                            label={label(child, lang)}
                            aria={`${label(STANDALONE.view, lang)} ${label(child, lang)}`}
                            info={info(child, lang)}
                            on={has(child) && createOn}
                            locked={isSuper || !createOn}
                            onToggle={() => toggle(child)}
                        />
                    ))}
                </ChildList>
                <PlainRow
                    lang={lang}
                    pkey={STANDALONE_SOLO}
                    label={label(STANDALONE_SOLO, lang)}
                    info={info(STANDALONE_SOLO, lang)}
                    on={has(STANDALONE_SOLO)}
                    locked={isSuper}
                    onToggle={() => toggle(STANDALONE_SOLO)}
                />
            </PermissionCell>
        </PermissionCard>
    );
}
