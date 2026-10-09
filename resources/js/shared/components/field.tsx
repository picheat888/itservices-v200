import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { AlertCircle } from 'lucide-react';
import { Children, cloneElement, isValidElement, useId } from 'react';

export function Field({
    label,
    error,
    required,
    help,
    name,
    action,
    grow,
    children,
}: {
    label: string;
    error?: string;
    required?: boolean;
    help?: string;
    /** Field key — exposed as data-field so a form can scroll/focus it on validation error. */
    name?: string;
    /** Optional control shown at the right end of the label row (e.g. a "generate for me" shortcut). */
    action?: React.ReactNode;
    /** Stretch to fill a flex-column parent and hand the leftover height to the control inside
     *  — for a textarea that has to end level with a neighbouring column. */
    grow?: boolean;
    children: React.ReactNode;
}) {
    // A single child control gets an id (label htmlFor) and is linked to its error/help line.
    const autoId = useId();
    const only = Children.count(children) === 1 ? children : null;
    const control = isValidElement<{ id?: string }>(only) ? only : null;
    const controlId = control?.props.id ?? autoId;
    const msgId = `${autoId}-msg`;
    const describe = error ? { 'aria-invalid': true, 'aria-describedby': msgId } : help ? { 'aria-describedby': msgId } : {};
    const body = control
        ? cloneElement(control as React.ReactElement<Record<string, unknown>>, { ...(control.props.id ? {} : { id: controlId }), ...describe })
        : children;

    const labelNode = (
        <Label htmlFor={control ? controlId : undefined}>
            {label}
            {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
    );

    return (
        <div data-field={name} className={cn('space-y-1.5', grow && 'flex min-h-0 flex-1 flex-col')}>
            {action ? (
                <div className="flex min-h-6 items-center justify-between gap-2">
                    {labelNode}
                    {action}
                </div>
            ) : (
                labelNode
            )}
            {/* On error, tint controls red; keep the hover:/focus: overrides (the controls' own states outrank them). */}
            <div
                className={cn(
                    grow && 'min-h-0 flex-1 [&_textarea]:h-full',
                    error &&
                        '[&_input]:border-destructive [&_textarea]:border-destructive [&_select]:border-destructive [&_button]:border-destructive [&_input]:hover:border-destructive [&_textarea]:hover:border-destructive [&_select]:hover:border-destructive [&_button]:hover:border-destructive [&_input]:focus:border-destructive [&_textarea]:focus:border-destructive [&_select]:focus:border-destructive [&_button]:focus:border-destructive [&_input]:focus-visible:ring-destructive/25 [&_textarea]:focus-visible:ring-destructive/25 [&_select]:focus:ring-destructive/25 [&_button]:focus:ring-destructive/25 [&_button]:ring-destructive/25 [&_button]:data-[state=open]:border-destructive [&_button]:data-[state=open]:ring-destructive/25',
                )}
            >
                {body}
            </div>
            {error ? (
                <p id={msgId} className="text-destructive flex items-center gap-1.5 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {error}
                </p>
            ) : help ? (
                <p id={msgId} className="text-muted-foreground text-xs">
                    {help}
                </p>
            ) : null}
        </div>
    );
}
