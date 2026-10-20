// Centred confirm and alert windows: the round icon, the frame (CenteredAlert) and useConfirm, which draws with it.
// Usage: `if (await confirm({ variant: 'danger', entity: { name } })) …`, or pass `action` to let the window own loading and errors.
import { useT } from '@/lang';
import { useMenuReturnFocus } from '@/shared/hooks/use-menu-return-focus';
import { editConfirmEntity, type EditConfirmTarget } from '@/shared/lib/edit-confirm';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/shared/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertTriangle, Check, Loader2, PencilLine, Trash2, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

// Round icon

export type AlertTone = 'brand' | 'warn' | 'danger';

const TONE: Record<AlertTone, string> = {
    brand: 'bg-brand/15 text-brand-ink',
    warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    danger: 'bg-destructive/15 text-destructive',
};

/** The round icon on top of a centred dialog: brand for a step to take, amber for a warning, red for a delete. */
export function AlertIconCircle({ icon: Icon, tone = 'brand', className }: { icon: LucideIcon; tone?: AlertTone; className?: string }) {
    return (
        <div className={cn('mx-auto flex h-12 w-12 items-center justify-center rounded-full', TONE[tone], className)} aria-hidden>
            <Icon className="h-6 w-6" />
        </div>
    );
}

// Frame

type AlertEntity = { name: ReactNode; sub?: ReactNode };

type Shown = {
    Icon: LucideIcon;
    tone: AlertTone;
    title: ReactNode;
    children: ReactNode;
    entity: AlertEntity | undefined;
    body: ReactNode;
    actions: ReactNode;
    errorText: ReactNode;
};

export function CenteredAlert({
    open,
    icon,
    tone = 'brand',
    title,
    children,
    entity,
    body,
    actions,
    busy,
    errorText,
    initialFocus,
    opener,
    returnFocus,
    onClose,
    className,
}: {
    open: boolean;
    icon: LucideIcon;
    /** Icon colour: brand, amber for a warning, red for a delete. */
    tone?: AlertTone;
    title: ReactNode;
    children: ReactNode;
    /** The record the action applies to, in a bordered box read together with the description. */
    entity?: AlertEntity;
    /** Content under the text that is not part of the description a screen reader reads on open (a list with its own buttons). */
    body?: ReactNode;
    /** Buttons share the row equally; one fills it. */
    actions: ReactNode;
    /** While true the alert cannot be dismissed (a save is running). */
    busy?: boolean;
    /** A failed save, already worded; shown in red under the text. */
    errorText?: ReactNode;
    /** The control to focus on open instead of the first button (Cancel before a delete). */
    initialFocus?: () => HTMLElement | null | undefined;
    /** The control that opened the alert when it is known before the alert mounts; otherwise the one focused on open. */
    opener?: () => HTMLElement | null | undefined;
    /** Where focus goes on close when the control that opened the alert is gone or disabled. */
    returnFocus?: () => HTMLElement | null | undefined;
    onClose: () => void;
    /** Extra classes for the panel, e.g. a wider max width. */
    className?: string;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const descRef = useRef<HTMLParagraphElement>(null);
    const focusedAtOpen = useRef<HTMLElement | null>(null);
    const entityId = useId();

    // The last open content stays on screen through the exit animation
    const current: Shown = { Icon: icon, tone, title, children, entity, body, actions, errorText };
    const retained = useRef<Shown>(current);
    useEffect(() => {
        if (open) retained.current = current;
    });
    const shown: Shown = open ? current : retained.current;
    const { Icon } = shown;

    // The record box is read with the description: its id joins Radix's own description id as the content node attaches
    const attachContent = (node: HTMLDivElement | null) => {
        contentRef.current = node;
        const desc = descRef.current;
        if (node && desc) node.setAttribute('aria-describedby', shown.entity ? `${desc.id} ${entityId}` : desc.id);
    };

    // Row menus get their button back on close, after this alert's own focus rule (as DialogContent does)
    const { handleOpen, handleClose } = useMenuReturnFocus(
        (event) => {
            focusedAtOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const first = initialFocus?.();
            if (first) {
                event.preventDefault();
                first.focus();
            }
        },
        (event) => {
            event.preventDefault();
            const active = document.activeElement;
            // Focus already placed elsewhere (the next alert) stays there
            if (active && active !== document.body && !contentRef.current?.contains(active)) return;
            const target = opener?.() ?? focusedAtOpen.current;
            if (target?.isConnected && !target.matches(':disabled') && !contentRef.current?.contains(target)) target.focus();
            else returnFocus?.()?.focus();
        },
    );
    const error =
        shown.errorText != null ? (
            <span role="alert" className="text-destructive mt-2 block">
                {shown.errorText}
            </span>
        ) : null;

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
                {/* The standard overlay and open motion, as BlockingDialog and every other dialog */}
                <DialogOverlay />
                <DialogPrimitive.Content
                    ref={attachContent}
                    role="alertdialog"
                    onOpenAutoFocus={handleOpen}
                    onCloseAutoFocus={handleClose}
                    className={cn(
                        'motion-sheet border-border bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[14px] border p-6 text-center shadow-2xl focus:outline-hidden',
                        className,
                    )}
                >
                    <AlertIconCircle icon={Icon} tone={shown.tone} />
                    <div>
                        <DialogTitle className="mb-1 text-base leading-normal font-semibold tracking-normal text-balance">{shown.title}</DialogTitle>
                        <DialogDescription ref={descRef} className="text-muted-foreground text-sm text-pretty whitespace-pre-line">
                            {shown.children}
                            {shown.body == null && error}
                        </DialogDescription>
                    </div>
                    {shown.entity && (
                        <div id={entityId} className="bg-muted/50 min-w-0 rounded-lg border px-3.5 py-2.5">
                            <p className="text-foreground truncate text-sm font-medium">{shown.entity.name}</p>
                            {shown.entity.sub && <p className="text-muted-foreground mt-0.5 truncate text-xs">{shown.entity.sub}</p>}
                        </div>
                    )}
                    {shown.body != null && (
                        <div className="text-sm">
                            {shown.body}
                            {error}
                        </div>
                    )}
                    <div className="grid auto-cols-fr grid-flow-col gap-2">{shown.actions}</div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}

// useConfirm

type ConfirmVariant = 'danger' | 'edit' | 'warn';

export interface ConfirmOptions {
    /** Visual + default-copy preset. 'danger' = delete, 'edit' = save changes, 'warn' = caution. */
    variant?: ConfirmVariant;
    title?: React.ReactNode;
    description?: React.ReactNode;
    /** Highlighted record the action applies to — shown in a bordered panel. */
    entity?: { name: React.ReactNode; sub?: React.ReactNode };
    confirmText?: React.ReactNode;
    cancelText?: React.ReactNode;
    /** Hide the Cancel button — turns the dialog into a single-button acknowledgement/notice. */
    hideCancel?: boolean;
    /** Override the medallion icon. */
    icon?: LucideIcon;
    /** Async work run on confirm: spinner while it runs, ✓ then close, or the window stays open with the error. */
    action?: () => unknown | Promise<unknown>;
    /** Words an error thrown by `action`; undefined falls back to the generic message. */
    errorMessage?: (error: unknown) => React.ReactNode | undefined;
}

const VARIANT: Record<ConfirmVariant, { icon: LucideIcon; tone: AlertTone; btn: 'destructive' | 'default' }> = {
    danger: { icon: Trash2, tone: 'danger', btn: 'destructive' },
    edit: { icon: PencilLine, tone: 'brand', btn: 'default' },
    warn: { icon: AlertTriangle, tone: 'warn', btn: 'default' },
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Imperative confirm — returns a promise that resolves true (confirmed) / false (dismissed). */
export function useConfirm(): ConfirmFn {
    const ctx = React.useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
    return ctx;
}

/** Confirm before saving an edit: shared wording, the saved record named; a second call while one is open resolves false. */
export function useConfirmEdit(): (target: EditConfirmTarget) => Promise<boolean> {
    const t = useT();
    const confirm = useConfirm();
    const asking = React.useRef(false);
    return React.useCallback(
        async (target: EditConfirmTarget) => {
            if (asking.current) return false;
            asking.current = true;
            try {
                return await confirm({
                    variant: 'edit',
                    title: t('edit_confirm_title'),
                    description: t('edit_confirm_desc'),
                    confirmText: t('edit_confirm_save'),
                    entity: editConfirmEntity(target),
                });
            } finally {
                asking.current = false;
            }
        },
        [confirm, t],
    );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const t = useT();
    const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    // Brief success check before auto-closing
    const [done, setDone] = React.useState(false);
    const [error, setError] = React.useState<React.ReactNode>(null);
    const resolver = React.useRef<((v: boolean) => void) | null>(null);
    const cancelRef = React.useRef<HTMLButtonElement>(null);
    // Opened without a trigger: remember what had focus so closing returns there.
    const returnFocus = React.useRef<HTMLElement | null>(null);

    const settle = React.useCallback((result: boolean) => {
        resolver.current?.(result);
        resolver.current = null;
        setOpen(false);
    }, []);

    const confirm = React.useCallback<ConfirmFn>((options) => {
        // A prompt replaced by a new one answers "no", so its caller never waits forever
        resolver.current?.(false);
        resolver.current = null;
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpts(options);
        setError(null);
        setLoading(false);
        setDone(false);
        setOpen(true);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const variant = opts?.variant ?? 'warn';
    const v = VARIANT[variant];
    const Icon = opts?.icon ?? v.icon;

    const defaults = {
        danger: {
            title: t('cd_delete_title'),
            description: t('cd_delete_desc'),
            confirm: t('delete'),
            busy: t('cd_deleting'),
            done: t('cd_deleted'),
        },
        edit: { title: t('cd_edit_title'), description: t('cd_edit_desc'), confirm: t('save'), busy: t('saving'), done: t('saved') },
        warn: { title: t('cd_confirm_title'), description: t('cd_confirm_desc'), confirm: t('cd_confirm'), busy: t('saving'), done: t('cd_done') },
    }[variant];

    const handleConfirm = async () => {
        // No async action to own → resolve immediately and let the caller act.
        if (!opts?.action) {
            settle(true);
            return;
        }
        try {
            setError(null);
            setLoading(true);
            await opts.action();
        } catch (e) {
            // Caller's own refusal wording first
            setError(opts.errorMessage?.(e) ?? t('cd_error'));
            setLoading(false);
            return;
        }
        // Flash the success check, then close.
        setLoading(false);
        setDone(true);
        setTimeout(() => settle(true), 850);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <CenteredAlert
                open={open}
                icon={Icon}
                tone={v.tone}
                title={opts?.title ?? defaults.title}
                entity={opts?.entity}
                busy={loading || done}
                errorText={error}
                // Delete focuses Cancel so a stray Enter is safe
                initialFocus={variant === 'danger' ? () => cancelRef.current : undefined}
                opener={() => returnFocus.current}
                returnFocus={() => {
                    const target = returnFocus.current;
                    return target?.isConnected && target.matches(':disabled') ? target.closest<HTMLElement>('[role="dialog"]') : null;
                }}
                onClose={() => settle(false)}
                actions={
                    <>
                        {!opts?.hideCancel && (
                            <Button ref={cancelRef} variant="outline" className="w-full" onClick={() => settle(false)} disabled={loading || done}>
                                {opts?.cancelText ?? t('cancel')}
                            </Button>
                        )}
                        <Button
                            variant={v.btn}
                            onClick={handleConfirm}
                            disabled={loading || done}
                            aria-busy={loading || undefined}
                            className="w-full font-semibold disabled:opacity-100"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {defaults.busy}
                                </>
                            ) : done ? (
                                <>
                                    <Check className="animate-in zoom-in-50 fade-in h-4 w-4 duration-300" />
                                    {defaults.done}
                                </>
                            ) : (
                                (opts?.confirmText ?? defaults.confirm)
                            )}
                        </Button>
                    </>
                }
            >
                {opts?.description ?? defaults.description}
            </CenteredAlert>
        </ConfirmContext.Provider>
    );
}
