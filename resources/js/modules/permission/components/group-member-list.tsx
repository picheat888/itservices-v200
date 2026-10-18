// "Current members" pane of the Role Group dialog: saved members a page at a time, people staged to join on top, leavers struck through.
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localName } from '@/shared/lib/local-name';
import { matchesAllWords } from '@/shared/lib/search-words';
import { useUiStore } from '@/stores/ui';
import { X } from 'lucide-react';
import { useState } from 'react';
import type { GroupMember } from '../api/permissionApi';
import { useGroupMembers } from '../hooks/use-permissions';
import { countKey } from '../lib/group-rules';
import { LockHint, PaneHeader, PanePager, PaneRow, PaneSearch, PaneSkeleton } from './group-pane';

export function GroupMemberList({
    groupId,
    memberCount,
    added,
    removed,
    onRemove,
    onUndo,
    leaveNote,
    readOnly,
}: {
    groupId: number | null;
    /** Members after the staged changes. */
    memberCount: number;
    added: Map<number, GroupMember>;
    removed: Map<number, GroupMember>;
    /** Take out a saved member, or drop a staged one. */
    onRemove: (person: GroupMember) => void;
    onUndo: (person: GroupMember) => void;
    /** Where a leaver ends up, e.g. "Moves to User". */
    leaveNote: string | null;
    readOnly: boolean;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const debounced = useDebouncedSearch(search);
    const { data, isLoading, isFetching, isFetchedAfterMount, isError, isPlaceholderData, refetch } = useGroupMembers(groupId, debounced, page);
    const failed = groupId !== null && isError && !data;
    // Rows cached from an earlier opening wait for the fresh fetch
    const busy = groupId !== null && (isLoading || isPlaceholderData || !isFetchedAfterMount || (failed && isFetching));

    const name = (p: GroupMember) => localName(p, lang) ?? p.name;
    const department = (p: GroupMember) => localName(p.department ? { name: p.department, name_th: p.department_th } : null, lang);
    // Staged joiners lead page 1, filtered here since the server does not know them yet
    const staged =
        page === 1
            ? [...added.values()]
                  .reverse()
                  .filter((p) => matchesAllWords(`${p.name} ${p.name_th ?? ''} ${p.code} ${p.department ?? ''} ${p.department_th ?? ''}`, debounced))
            : [];
    // A staged joiner already shows above; never twice
    const saved = (data?.data ?? []).filter((p) => !added.has(p.id));
    const total = data?.meta.total ?? 0;
    const lockReason = (p: GroupMember) => (p.is_me ? t('perm_refusal_own_access') : p.protected ? t('perm_refusal_admin_members_protected') : null);

    const removeButton = (p: GroupMember) => (
        <button
            type="button"
            onClick={() => onRemove(p)}
            aria-label={t('gr_remove_member').replace('{name}', name(p))}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex h-8 w-8 items-center justify-center rounded-md"
        >
            <X className="h-3.5 w-3.5" aria-hidden />
        </button>
    );
    const endFor = (p: GroupMember, leaving: boolean) => {
        if (readOnly) return null;
        if (leaving) {
            return (
                <button
                    type="button"
                    onClick={() => onUndo(p)}
                    aria-label={t('gr_undo_member').replace('{name}', name(p))}
                    className="text-brand inline-flex min-h-6 items-center px-1 text-[13px] font-medium underline-offset-[3px] hover:underline"
                >
                    {t('gr_undo')}
                </button>
            );
        }
        const locked = lockReason(p);
        return locked ? <LockHint text={locked} /> : removeButton(p);
    };

    const empty = !busy && !failed && staged.length === 0 && saved.length === 0;

    return (
        <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="gr-members-title">
            <PaneHeader
                id="gr-members-title"
                title={t('gr_members_title')}
                meta={t(countKey('gr_people', memberCount)).replace('{n}', fmtN(memberCount))}
            >
                <PaneSearch
                    name="group-member-search"
                    value={search}
                    placeholder={t('gr_members_search')}
                    onChange={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                />
            </PaneHeader>

            <div aria-busy={busy} className="border-border flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t">
                {staged.map((p) => (
                    <PaneRow
                        key={`new-${p.id}`}
                        name={name(p)}
                        code={p.code}
                        department={department(p)}
                        changed
                        note={p.group ? t('gr_moved_from').replace('{name}', p.group) : t('gr_new_member')}
                        end={readOnly ? null : removeButton(p)}
                    />
                ))}
                {busy && <PaneSkeleton />}
                {failed && !busy && <LoadFailedPanel onRetry={() => void refetch()} />}
                {!busy &&
                    saved.map((p) => {
                        const leaving = removed.has(p.id);
                        return (
                            <PaneRow
                                key={p.id}
                                name={name(p)}
                                code={p.code}
                                department={department(p)}
                                changed={leaving}
                                gone={leaving}
                                note={leaving ? leaveNote : null}
                                end={endFor(p, leaving)}
                            />
                        );
                    })}
                {empty && (
                    <EmptyState
                        {...(debounced !== ''
                            ? {
                                  kind: 'search' as const,
                                  title: t('gr_members_not_found'),
                                  hint: t('gr_members_not_found_hint').replace('{q}', debounced),
                              }
                            : { kind: 'empty' as const, title: t('gr_no_members'), hint: readOnly ? null : t('gr_members_none_hint') })}
                    />
                )}
            </div>
            {total > 0 && data && (
                <PanePager page={data.meta.current_page} lastPage={data.meta.last_page} perPage={data.meta.per_page} total={total} onPage={setPage} />
            )}
        </section>
    );
}
