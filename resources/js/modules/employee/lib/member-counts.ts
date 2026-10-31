// Member counts for departments, positions and sections: staff still working there apart from leavers.
// Used by the members dialogs and the "cannot delete" notices.

type Member = { status?: string | null };

type MemberWords = { plain: string; plainOne: string; withLeft: string; withLeftOne: string };

export function splitCounts(active: number, total: number): { active: number; left: number } {
    return { active, left: Math.max(0, total - active) };
}

export function countMembers(members: Member[]): { active: number; left: number } {
    return splitCounts(members.filter((m) => m.status !== 'resigned').length, members.length);
}

/** The four lang strings blockedMembersLine picks from. */
export function memberWords(t: (key: string) => string): MemberWords {
    return {
        plain: t('members_n'),
        plainOne: t('members_n_one'),
        withLeft: t('members_with_left'),
        withLeftOne: t('members_with_left_one'),
    };
}

/** The notice's member line: the leavers part only when someone has left, the singular for one active member. */
export function blockedMembersLine(active: number, total: number, fmtN: (n: number) => string, words: MemberWords): string {
    const { left } = splitCounts(active, total);
    const one = active === 1;
    const line = left > 0 ? (one ? words.withLeftOne : words.withLeft).replace('{left}', fmtN(left)) : one ? words.plainOne : words.plain;
    return line.replace('{n}', fmtN(active));
}
