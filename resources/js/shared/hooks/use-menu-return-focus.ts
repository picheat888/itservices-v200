// Dialog/sheet focus handlers: a layer opened from a dropdown item returns focus to the menu button on close.
import { claimMenuTrigger, followRowOnRemoval, lastInputWasKeyboard, rowSpotOf, type RowSpot } from '@/shared/lib/menu-return-focus';
import { useRef } from 'react';

type AutoFocusHandler = (event: Event) => void;

// focusVisible is not in TypeScript's DOM types yet
const focusBack = (target: HTMLElement) => target.focus({ focusVisible: lastInputWasKeyboard() } as FocusOptions);

export function useMenuReturnFocus(onOpenAutoFocus?: AutoFocusHandler, onCloseAutoFocus?: AutoFocusHandler) {
    const returnTo = useRef<HTMLElement | null>(null);
    // The button's row position, read while the row exists, in case the action removes it
    const spot = useRef<RowSpot | null>(null);

    const handleOpen: AutoFocusHandler = (event) => {
        returnTo.current = claimMenuTrigger();
        spot.current = returnTo.current ? rowSpotOf(returnTo.current) : null;
        onOpenAutoFocus?.(event);
    };

    const handleClose: AutoFocusHandler = (event) => {
        onCloseAutoFocus?.(event);
        const target = returnTo.current;
        const rowSpot = spot.current;
        returnTo.current = null;
        spot.current = null;
        if (target && rowSpot) followRowOnRemoval(target, rowSpot);
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
