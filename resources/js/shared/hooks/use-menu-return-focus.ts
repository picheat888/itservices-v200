// Dialog/sheet focus handlers: a layer opened from a dropdown item returns focus to the menu button on close.
import { claimMenuTrigger, lastInputWasKeyboard } from '@/shared/lib/menu-return-focus';
import { useRef } from 'react';

type AutoFocusHandler = (event: Event) => void;

// focusVisible is not in TypeScript's DOM types yet
const focusBack = (target: HTMLElement) => target.focus({ focusVisible: lastInputWasKeyboard() } as FocusOptions);

export function useMenuReturnFocus(onOpenAutoFocus?: AutoFocusHandler, onCloseAutoFocus?: AutoFocusHandler) {
    const returnTo = useRef<HTMLElement | null>(null);

    const handleOpen: AutoFocusHandler = (event) => {
        returnTo.current = claimMenuTrigger();
        onOpenAutoFocus?.(event);
    };

    const handleClose: AutoFocusHandler = (event) => {
        onCloseAutoFocus?.(event);
        const target = returnTo.current;
        returnTo.current = null;
        if (!target?.isConnected) {
            return;
        }
        if (!event.defaultPrevented) {
            event.preventDefault();
            focusBack(target);
            return;
        }
        // The caller handled focus itself; step in only when it left focus nowhere
        const active = document.activeElement;
        const closingContent = event.target instanceof Node ? event.target : null;
        if (active === null || active === document.body || closingContent?.contains(active)) {
            focusBack(target);
        }
    };

    return { handleOpen, handleClose };
}
