// Member counts for departments, positions and sections: staff still working there apart from leavers.
// Used by the members dialogs (leavers listed last) and the "cannot delete" notices.

type Member = { status?: string | null };

export function countMembers(members: Member[]): { active: number; left: number } {
    const left = members.filter((m) => m.status === 'resigned').length;
    return { active: members.length - left, left };
}

export function leaversLast<T extends Member>(members: T[]): T[] {
    return [...members.filter((m) => m.status !== 'resigned'), ...members.filter((m) => m.status === 'resigned')];
}

/** "3 Members, 1 left": the leavers part only when someone has left. */
export function blockedMembersLine(active: number, total: number, fmtN: (n: number) => string, words: { members: string; left: string }): string {
    const line = `${fmtN(active)} ${words.members}`;
    const left = Math.max(0, total - active);
    return left > 0 ? `${line}, ${words.left.replace('{n}', fmtN(left))}` : line;
}
