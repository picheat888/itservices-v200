// Keeps a closing layer mounted long enough to play its exit animation (app.css .motion-pop-out).
import { useEffect, useState } from 'react';

/** Exit time of the shared pop-out animation (app.css --motion-pop-out). */
export const POP_OUT_MS = 120;

/** Exit time of motion-sheet dialogs (app.css --motion-close). */
export const SHEET_CLOSE_MS = 180;

/** `mounted` stays true for `exitMs` after `open` turns false; `closing` is true during that time. */
export function usePresence(open: boolean, exitMs = POP_OUT_MS): { mounted: boolean; closing: boolean } {
    const [mounted, setMounted] = useState(open);
    if (open && !mounted) setMounted(true);

    useEffect(() => {
        if (open || !mounted) return;
        const timer = setTimeout(() => setMounted(false), exitMs);
        return () => clearTimeout(timer);
    }, [open, mounted, exitMs]);

    return { mounted, closing: mounted && !open };
}
