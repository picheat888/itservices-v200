import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { Children, cloneElement, isValidElement, useId } from 'react';

/** Props Field hands to its control: the id its label points at plus the error/help/required links. */
export interface FieldControlProps {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
}

/** Form-level error at the top of a form: shakes in and is announced (login page standard). */
export function FormErrorBanner({ message, shakeKey, className }: { message: string; shakeKey?: string | number; className?: string }) {
    if (!message) return null;
    return (
        <p
            key={`${message}-${shakeKey ?? ''}`}
            role="alert"
            className={cn(
                'bg-destructive/10 dark:text-destructive border-destructive/25 animate-shake flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-red-700',
                className,
            )}
        >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">{message}</span>
        </p>
    );
}

export function Field({
    label,
    icon: Icon,
    error,
    required,
    help,
    name,
    action,
    grow,
    controlId,
    children,
}: {
    label: string;
    /** Small icon in front of the label text. */
    icon?: LucideIcon;
    error?: string;
    required?: boolean;
    help?: string;
    /** Field key — exposed as data-field so a form can scroll/focus it on validation error. */
    name?: string;
    /** Optional control shown at the right end of the label row (e.g. a "generate for me" shortcut). */
    action?: React.ReactNode;
    /** Stretch to fill a flex-column parent and hand the leftover height to the control inside. */
    grow?: boolean;
    /** Fixed id for the control (label htmlFor); otherwise the child's own id or a generated one. */
    controlId?: string;
    /** One control (gets the id/aria props cloned on), or a function that places them itself. */
    children: React.ReactNode | ((control: FieldControlProps) => React.ReactNode);
}) {
    const autoId = useId();
    const msgId = `${autoId}-msg`;
    const describe = {
        ...(error ? { 'aria-invalid': true, 'aria-describedby': msgId } : help ? { 'aria-describedby': msgId } : {}),
        ...(required ? { 'aria-required': true } : {}),
    };

    let body: React.ReactNode;
    let labelFor: string | undefined;
    if (typeof children === 'function') {
        labelFor = controlId ?? autoId;
        body = children({ id: labelFor, ...describe });
    } else {
        const only = Children.count(children) === 1 ? children : null;
        const control = isValidElement<{ id?: string }>(only) ? only : null;
        labelFor = control ? (control.props.id ?? controlId ?? autoId) : controlId;
        body = control
            ? cloneElement(control as React.ReactElement<Record<string, unknown>>, { ...(control.props.id ? {} : { id: labelFor }), ...describe })
            : children;
    }

    const labelNode = (
        <Label htmlFor={labelFor} className={cn(Icon && 'inline-flex items-center gap-1.5')}>
            {Icon && <Icon className="text-muted-foreground h-3.5 w-3.5" aria-hidden />}
            {label}
            {required && (
                <span className="text-destructive ml-0.5" aria-hidden>
                    *
                </span>
            )}
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
            {/* Error tint for the controls inside */}
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
