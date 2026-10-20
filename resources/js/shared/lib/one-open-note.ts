// One InfoPopover note open at a time: opening a note closes the one that was open.
// No imports, so node tests load it as is.
type CloseNote = () => void;

let openNote: CloseNote | null = null;

/** Marks this note as the open one, closing the note open before it. */
export function claimOpenNote(close: CloseNote): void {
    if (openNote && openNote !== close) openNote();
    openNote = close;
}

/** Forgets this note when it shuts, unless another note has already taken its place. */
export function releaseOpenNote(close: CloseNote): void {
    if (openNote === close) openNote = null;
}
