// Member counts for departments, positions and sections: staff still working there apart from leavers.
// Used by the members dialogs and the "cannot delete" notices.

type Member = { status?: string | null };

export function splitCounts(active: number, total: number): { active: number; left: number } {
    return { active, left: Math.max(0, total - active) };
}

export function countMembers(members: Member[]): { active: number; left: number } {
    return splitCounts(members.filter((m) => m.status !== 'resigned').length, members.length);
}

/** The notice's member line: `withLeft` only when someone has left; both fill {n}, `withLeft` also {left}. */
export function blockedMembersLine(active: number, total: number, fmtN: (n: number) => string, words: { plain: string; withLeft: string }): string {
    const { left } = splitCounts(active, total);
    const line = left > 0 ? words.withLeft.replace('{left}', fmtN(left)) : words.plain;
    return line.replace('{n}', fmtN(active));
}
