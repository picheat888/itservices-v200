import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { AlertCircle } from 'lucide-react';

export function Field({
    label,
    error,
    required,
    help,
    name,
    action,
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
    children: React.ReactNode;
}) {
    const labelNode = (
        <Label>
            {label}
            {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
    );

    return (
        <div data-field={name} className="space-y-1.5">
            {action ? (
                <div className="flex min-h-6 items-center justify-between gap-2">
                    {labelNode}
                    {action}
                </div>
            ) : (
                labelNode
            )}
            {/* On error, tint the control(s) inside red — input/textarea/select and
                button-style triggers (SearchableSelect) all pick up the border.
                The focus: overrides must stay: the controls' own focus-visible:border-brand
                outranks the plain descendant override, so without them the border flips to
                the theme colour while focused. */}
            <div
                className={cn(
                    error &&
                        '[&_input]:border-destructive [&_textarea]:border-destructive [&_select]:border-destructive [&_button]:border-destructive [&_input]:focus:border-destructive [&_textarea]:focus:border-destructive [&_select]:focus:border-destructive [&_button]:focus:border-destructive [&_input]:focus-visible:ring-destructive/25 [&_textarea]:focus-visible:ring-destructive/25 [&_select]:focus:ring-destructive/25 [&_button]:focus:ring-destructive/25 [&_button]:ring-destructive/25 [&_button]:data-[state=open]:border-destructive [&_button]:data-[state=open]:ring-destructive/25',
                )}
            >
                {children}
            </div>
            {error ? (
                <p className="text-destructive flex items-center gap-1.5 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                </p>
            ) : help ? (
                <p className="text-muted-foreground text-xs">{help}</p>
            ) : null}
        </div>
    );
}
