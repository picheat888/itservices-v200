// Centred alert in the Account Switched shell (ring icon, centred title and text, full-width buttons): the save confirm and the saved notice.
import { useT } from '@/lang';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/shared/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { permissionRefusalText } from '../lib/refusal';

type Shown = { Icon: LucideIcon; title: ReactNode; children: ReactNode; actions: ReactNode; error: unknown };

export function CenteredAlert({
    open,
    icon,
    title,
    children,
    actions,
    busy,
    error,
    returnFocus,
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
    /** A failed save, worded by the server's refusal code. */
    error?: unknown;
    /** Where focus goes on close when the control that opened the alert is gone or disabled. */
    returnFocus?: () => HTMLElement | null | undefined;
    onClose: () => void;
}) {
    const t = useT();
    const contentRef = useRef<HTMLDivElement>(null);
    const opener = useRef<HTMLElement | null>(null);

    // The last open content stays on screen through the exit animation
    const retained = useRef<Shown>({ Icon: icon, title, children, actions, error });
    useEffect(() => {
        if (open) retained.current = { Icon: icon, title, children, actions, error };
    });
    const shown: Shown = open ? { Icon: icon, title, children, actions, error } : retained.current;
    const { Icon } = shown;

    // Busy buttons are disabled; focus they held moves to the alert instead of the page body
    useEffect(() => {
        if (!busy) return;
        const content = contentRef.current;
        const active = document.activeElement;
        const dropped = !active || active === document.body || (content?.contains(active) && active.matches(':disabled'));
        if (content && dropped) content.focus();
    }, [busy]);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
            <DialogPortal>
                <DialogOverlay className="bg-[rgb(15_23_42_/_0.5)] backdrop-blur-[2px]" />
                <DialogPrimitive.Content
                    ref={contentRef}
                    role="alertdialog"
                    onOpenAutoFocus={() => {
                        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        const active = document.activeElement;
                        // Focus already placed elsewhere (the next alert) stays there
                        if (active && active !== document.body && !contentRef.current?.contains(active)) return;
                        const target = opener.current;
                        if (target?.isConnected && !target.matches(':disabled') && !contentRef.current?.contains(target)) target.focus();
                        else returnFocus?.()?.focus();
                    }}
                    className="border-border bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:zoom-out-[0.97] fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[14px] border p-6 text-center shadow-2xl duration-200 focus:outline-hidden"
                >
                    <div className="bg-brand/15 text-brand-ink mx-auto flex h-12 w-12 items-center justify-center rounded-full" aria-hidden>
                        <Icon className="h-6 w-6" />
                    </div>
                    <div>
                        <DialogTitle className="mb-1 text-base leading-normal font-semibold tracking-normal text-balance">{shown.title}</DialogTitle>
                        <DialogDescription className="text-muted-foreground text-sm text-pretty">
                            {shown.children}
                            {shown.error != null && (
                                <span role="alert" className="text-destructive mt-2 block">
                                    {permissionRefusalText(shown.error, t)}
                                </span>
                            )}
                        </DialogDescription>
                    </div>
                    <div className="grid auto-cols-fr grid-flow-col gap-2">{shown.actions}</div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
