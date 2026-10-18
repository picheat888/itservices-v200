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
