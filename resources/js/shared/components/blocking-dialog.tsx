// A dialog only its own buttons can close (password walls, idle warning, error screens): a real modal with a focus trap,
// above every other dialog, and scrollable when the screen is short (on-screen keyboard).
import { holdTopDialog, isTopDialogOpen, subscribeTopDialogs } from '@/shared/lib/top-dialogs';
import { cn } from '@/shared/lib/utils';
import { Dialog, DialogOverlay, DialogPortal } from '@/shared/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

const hold = (e: Event) => e.preventDefault();

/** True while a layer="top" dialog is on screen; the last modal Radix mounts takes pointer and focus from older ones. */
export function useTopDialogOpen(): boolean {
    return useSyncExternalStore(subscribeTopDialogs, isTopDialogOpen);
}

export function BlockingDialog({ layer = 'wall', className, children }: { layer?: 'wall' | 'top'; className?: string; children: ReactNode }) {
    const z = layer === 'top' ? 'z-[10000]' : 'z-[9999]';
    useLayoutEffect(() => (layer === 'top' ? holdTopDialog() : undefined), [layer]);
    // No Trigger to hand focus back to, so return it to whatever had it before the dialog opened
    const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);
    const restoreFocus = (e: Event) => {
        e.preventDefault();
        if (returnFocusTo?.isConnected) returnFocusTo.focus();
    };

    return (
        <Dialog open>
            <DialogPortal>
                <DialogOverlay className={z} />
                <DialogPrimitive.Content
                    onEscapeKeyDown={hold}
                    onInteractOutside={hold}
                    onCloseAutoFocus={restoreFocus}
                    className={cn(
                        z,
                        'motion-sheet data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                        'border-border bg-background fixed top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[14px] border shadow-2xl focus:outline-hidden',
                        className,
                    )}
                >
                    {children}
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
