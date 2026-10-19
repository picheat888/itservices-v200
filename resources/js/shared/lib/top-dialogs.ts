// Top-layer BlockingDialogs on screen (idle warning, account switched), so the error dialog can wait under them.
// No imports, so node tests load it as is.
let holds = 0;
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

/** Counts one open top dialog; the returned release counts it off once, however often it is called. */
export function holdTopDialog(): () => void {
    let held = true;
    holds += 1;
    notify();

    return () => {
        if (!held) return;
        held = false;
        holds -= 1;
        notify();
    };
}

export function isTopDialogOpen(): boolean {
    return holds > 0;
}

export function subscribeTopDialogs(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
