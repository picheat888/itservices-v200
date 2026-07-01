import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { AlertTriangle, Check, Loader2, PencilLine, Trash2, type LucideIcon } from 'lucide-react';
import * as React from 'react';

/**
 * Themed confirmation dialog — a single, on-brand replacement for the scattered
 * `window.confirm()` / `Swal.fire()` confirm prompts across the app.
 *
 * Two ways to use it:
 *
 *   // 1) Imperative (recommended — drop-in for confirm()/Swal):
 *   const confirm = useConfirm();
 *   if (await confirm({ variant: 'danger', entity: { name, sub: code } })) remove.mutate(id);
 *
 *   // 2) With an async action so the dialog owns the loading/error state:
 *   await confirm({ variant: 'danger', entity: { name }, action: () => remove.mutateAsync(id) });
 *
 * Mount <ConfirmProvider> once near the app root.
 */

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
    /**
     * Optional async work to run on confirm. When provided, the dialog shows a
     * spinner while it runs and stays open (showing the error) if it throws —
     * so the caller doesn't have to juggle loading state. The resolved value is
     * ignored (so a mutation's `mutateAsync` can be passed directly).
     */
    action?: () => unknown | Promise<unknown>;
}

const VARIANT: Record<ConfirmVariant, { icon: LucideIcon; tint: string; fg: string; btn: 'destructive' | 'default' }> = {
    danger: { icon: Trash2, tint: 'bg-destructive/10', fg: 'text-destructive', btn: 'destructive' },
    edit: { icon: PencilLine, tint: 'bg-primary/10', fg: 'text-primary', btn: 'default' },
    warn: { icon: AlertTriangle, tint: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400', btn: 'default' },
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Imperative confirm — returns a promise that resolves true (confirmed) / false (dismissed). */
export function useConfirm(): ConfirmFn {
    const ctx = React.useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
    return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const t = useT();
    const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    // Brief success state — shows a checkmark for a beat before auto-closing,
    // matching the SaveButton "spinner → check" pattern used elsewhere.
    const [done, setDone] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const resolver = React.useRef<((v: boolean) => void) | null>(null);
    const cancelRef = React.useRef<HTMLButtonElement>(null);

    const settle = React.useCallback((result: boolean) => {
        resolver.current?.(result);
        resolver.current = null;
        setOpen(false);
    }, []);

    const confirm = React.useCallback<ConfirmFn>((options) => {
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
        danger: { title: t('cd_delete_title'), description: t('cd_delete_desc'), confirm: t('delete'), busy: t('cd_deleting'), done: t('cd_deleted') },
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
        } catch {
            setError(t('cd_error'));
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
            <Dialog
                open={open}
                onOpenChange={(o) => {
                    if (loading || done) return; // don't dismiss mid-action or during the success flash
                    if (!o) settle(false);
                }}
            >
                <DialogContent
                    className="max-w-md gap-4"
                    onOpenAutoFocus={(e) => {
                        // Focus Cancel (not the destructive action) so a stray Enter is safe.
                        if (variant === 'danger') {
                            e.preventDefault();
                            cancelRef.current?.focus();
                        }
                    }}
                >
                    <div className="flex items-start gap-3.5">
                        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', v.tint, v.fg)}>
                            <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5 pt-0.5 text-left">
                            <DialogTitle className="text-lg">{opts?.title ?? defaults.title}</DialogTitle>
                            <DialogDescription className="leading-relaxed whitespace-pre-line">
                                {opts?.description ?? defaults.description}
                            </DialogDescription>
                        </div>
                    </div>

                    {opts?.entity && (
                        <div className="rounded-lg border bg-muted/50 px-3.5 py-2.5">
                            <p className="truncate text-sm font-medium text-foreground">{opts.entity.name}</p>
                            {opts.entity.sub && <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{opts.entity.sub}</p>}
                        </div>
                    )}

                    {error && (
                        <p className="flex items-center gap-1.5 text-sm text-destructive">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {error}
                        </p>
                    )}

                    {/* reverseButtons convention: Cancel left, primary action right. */}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        {!opts?.hideCancel && (
                            <Button ref={cancelRef} variant="outline" onClick={() => settle(false)} disabled={loading || done}>
                                {opts?.cancelText ?? t('cancel')}
                            </Button>
                        )}
                        <Button variant={v.btn} onClick={handleConfirm} disabled={loading || done} className="min-w-24">
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {defaults.busy}
                                </>
                            ) : done ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    {defaults.done}
                                </>
                            ) : (
                                (opts?.confirmText ?? defaults.confirm)
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </ConfirmContext.Provider>
    );
}
