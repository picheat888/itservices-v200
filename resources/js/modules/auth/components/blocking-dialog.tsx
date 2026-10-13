// A dialog only its own buttons can close (password walls, idle warning): a real modal with a focus trap,
// above every other dialog, and scrollable when the screen is short (on-screen keyboard).
import { cn } from '@/shared/lib/utils';
import { Dialog, DialogOverlay, DialogPortal } from '@/shared/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

const hold = (e: Event) => e.preventDefault();

export function BlockingDialog({ layer = 'wall', className, children }: { layer?: 'wall' | 'top'; className?: string; children: ReactNode }) {
    const z = layer === 'top' ? 'z-[10000]' : 'z-[9999]';

    return (
        <Dialog open>
            <DialogPortal>
                <DialogOverlay className={cn(z, 'bg-[rgb(15_23_42_/_0.5)] backdrop-blur-[2px]')} />
                <DialogPrimitive.Content
                    onEscapeKeyDown={hold}
                    onInteractOutside={hold}
                    className={cn(
                        z,
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
