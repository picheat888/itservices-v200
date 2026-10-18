import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { cascadeToggle, countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { TICKET_COUNT, TICKET_TREE } from '../lib/permission-specs';
import { ChildList, ChildRow, GeneralCell, GroupHead, GroupNote, PermissionCard, PermissionCell, PlainRow, SetHead } from './permission-layout';

const { master: MASTER, groups: GROUPS, levels: LEVELS, standalone: STANDALONE, solo: STANDALONE_SOLO } = TICKET_TREE;
// Every key that lives under the master (excludes the standalone keys).
const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => [g.view, ...g.children]), ...LEVELS];

const label = (key: string, lang: Lang) => actionLabel('tickets', key.replace('tickets.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('tickets', key.replace('tickets.', ''), lang);

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
        setDraft((prev) => cascadeToggle(prev, key, TICKET_COUNT));
    };

    const createOn = has(STANDALONE.view);
    const { on: activeCount, total: totalCount } = countGranted(TICKET_COUNT, has);
    const view = (key: string) => ({
        pkey: key,
        label: label(key, lang),
        info: info(key, lang),
        on: has(key) && masterOn,
        locked: isSuper || !masterOn,
        lockedBy: label(MASTER, lang),
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
                                            lockedBy={label(group.view, lang)}
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
                                    lockedBy={label(MASTER, lang)}
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
                            lockedBy={label(STANDALONE.view, lang)}
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
