// Save dialogs: how long the Saved tick shows before the dialog closes, and the timer that closes it.
import { useEffect, useRef } from 'react';

export const MODAL_CLOSE_DELAY_MS = 1100;

/** Returns a function that closes the dialog after MODAL_CLOSE_DELAY_MS; the timer is dropped when the dialog closes or unmounts. */
export function useCloseAfterSave(open: boolean, onClose: () => void): () => void {
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        if (!open) {
            clearTimeout(timer.current);
        }
    }, [open]);

    useEffect(() => () => clearTimeout(timer.current), []);

    return () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(onClose, MODAL_CLOSE_DELAY_MS);
    };
}
