// Centred alert in the Account Switched shell (ring icon, centred title and text, full-width buttons): the save confirm and the saved notice.
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/shared/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function CenteredAlert({
    open,
    icon: Icon,
    title,
    children,
    actions,
    busy,
    onClose,
}: {
    open: boolean;
    icon: LucideIcon;
    title: ReactNode;
    children: ReactNode;
    /** Buttons share the row equally; one fills it. */
    actions: ReactNode;
    /** While true the alert cannot be dismissed (a save is running). */
    busy?: boolean;
    onClose: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
            <DialogPortal>
                <DialogOverlay className="bg-[rgb(15_23_42_/_0.5)] backdrop-blur-[2px]" />
                <DialogPrimitive.Content
                    role="alertdialog"
                    className="border-border bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[14px] border p-6 text-center shadow-2xl focus:outline-hidden"
                >
                    <div className="bg-brand/15 text-brand-ink mx-auto flex h-12 w-12 items-center justify-center rounded-full" aria-hidden>
                        <Icon className="h-6 w-6" />
                    </div>
                    <div>
                        <DialogTitle className="mb-1 text-base leading-normal font-semibold tracking-normal text-balance">{title}</DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm text-pretty">{children}</DialogDescription>
                    </div>
                    <div className="grid auto-cols-fr grid-flow-col gap-2">{actions}</div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
