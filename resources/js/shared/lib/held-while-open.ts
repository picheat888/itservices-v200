// Keeps the value a dialog showed while open, for the frames it is still on screen after closing.
// Pure (no React), so node tests load it as is.

/** A holder fed (value, open) each render: passes the value through while open, returns the last one seen once closed. */
export function createHold<T>(initial: T): (value: T, open: boolean) => T {
    let held = initial;
    return (value, open) => {
        if (open) held = value;
        return held;
    };
}
