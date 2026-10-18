// Remembers the button that opened a dropdown menu, so a dialog launched from one of its items can hand focus back to it.

// How long after an item is picked a dialog may still claim the button (covers a fetch before opening)
const CLAIM_WINDOW_MS = 1500;

let lastTrigger: HTMLElement | null = null;
let pickedAt = Number.NEGATIVE_INFINITY;
let keyboardLast = false;

// Last input kind, so focus handed back shows a ring for keyboard users only
if (typeof document !== 'undefined') {
    document.addEventListener('keydown', () => (keyboardLast = true), true);
    document.addEventListener('pointerdown', () => (keyboardLast = false), true);
}

export function lastInputWasKeyboard(): boolean {
    return keyboardLast;
}

export function rememberMenuTrigger(trigger: HTMLElement): void {
    lastTrigger = trigger;
}

export function markMenuItemPicked(): void {
    pickedAt = performance.now();
}

/** The button of the menu whose item was just picked, handed to one dialog only. */
export function claimMenuTrigger(): HTMLElement | null {
    if (lastTrigger === null || performance.now() - pickedAt > CLAIM_WINDOW_MS) {
        return null;
    }
    pickedAt = Number.NEGATIVE_INFINITY;
    return lastTrigger;
}

const MENU_BUTTON = '[aria-haspopup="menu"]';
// How long after the dialog closes the row may still disappear (a refetch after a delete)
const FOLLOW_MS = 15000;

export interface RowSpot {
    /** A stable ancestor of the table rows (the table's parent). */
    scope: HTMLElement;
    index: number;
}

/** Where the menu button sits in its table, taken while its row still exists. */
export function rowSpotOf(trigger: HTMLElement): RowSpot | null {
    const row = trigger.closest('tr');
    const scope = row?.closest('table')?.parentElement;
    if (!row || !scope) return null;
    const rows = Array.from(scope.querySelectorAll('tbody > tr'));
    return { scope, index: rows.indexOf(row) };
}

/** Row whose menu button takes focus: the same position, else the nearest row after, else before; null while none has a button. */
export function rowToRefocus(rowHasMenu: boolean[], index: number): number | null {
    if (rowHasMenu.length === 0) return null;
    const start = Math.min(Math.max(index, 0), rowHasMenu.length - 1);
    for (let i = start; i < rowHasMenu.length; i++) if (rowHasMenu[i]) return i;
    for (let i = start - 1; i >= 0; i--) if (rowHasMenu[i]) return i;
    return null;
}

/** Moves focus to the neighbouring row's menu button; false while the rows have none (skeleton) or the table is gone. */
function refocusRow(spot: RowSpot): boolean {
    if (!spot.scope.isConnected) return false;
    const rows = Array.from(spot.scope.querySelectorAll('tbody > tr'));
    const buttons = rows.map((row) => row.querySelector<HTMLElement>(MENU_BUTTON));
    const pick = rowToRefocus(
        buttons.map((b) => b !== null),
        spot.index,
    );
    if (pick === null) return false;
    buttons[pick]!.focus({ focusVisible: keyboardLast } as FocusOptions);
    return true;
}

/**
 * When the menu button that holds (or should get back) focus leaves the page, its row having been deleted or
 * re-rendered, focus moves to the menu button now at that row's position instead of falling to the page body.
 * Stops once the user moves focus or clicks elsewhere, or after FOLLOW_MS.
 */
export function followRowOnRemoval(trigger: HTMLElement, spot: RowSpot): void {
    let done = false;
    const lost = () => !trigger.isConnected && (document.activeElement === null || document.activeElement === document.body);
    const stop = () => {
        if (done) return;
        done = true;
        observer.disconnect();
        window.clearTimeout(timer);
        document.removeEventListener('pointerdown', stop, true);
        trigger.removeEventListener('blur', onBlur);
    };
    const onBlur = (e: FocusEvent) => {
        if (e.relatedTarget) stop();
    };
    const check = () => {
        if (trigger.isConnected) return;
        if (!lost()) return stop();
        if (refocusRow(spot)) stop();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(stop, FOLLOW_MS);
    document.addEventListener('pointerdown', stop, true);
    trigger.addEventListener('blur', onBlur);
    // Already gone as the dialog closes: focus is still inside the closing dialog, so place it now
    if (!trigger.isConnected && refocusRow(spot)) stop();
}
