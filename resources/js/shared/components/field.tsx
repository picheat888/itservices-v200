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
    /**
     * Tie the label to the control it names, without an `id` at all 182 call sites.
     *
     * A single element child gets a generated id (one it does not already carry) and the
     * label points at it, so clicking the words focuses the field and a screen reader reads
     * the pair as one thing. Input and Textarea spread props onto the DOM node, which is
     * most of them; a child that ignores the prop, or a Field wrapping several controls,
     * simply keeps today's behaviour — the label just does not point anywhere.
     */
    const autoId = useId();
    const only = Children.count(children) === 1 ? children : null;
    const control = isValidElement<{ id?: string }>(only) ? only : null;
    const controlId = control?.props.id ?? autoId;
    const body = control && !control.props.id ? cloneElement(control, { id: controlId }) : children;

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
            {/* On error, tint the control(s) inside red — input/textarea/select and
                button-style triggers (SearchableSelect) all pick up the border.
                The hover: and focus: overrides must stay: the controls' own
                hover:border-brand/50 and focus-visible:border-brand outrank the plain
                descendant override, so without them the border flips to the theme colour
                the moment the pointer lands on a field that is still flagged wrong. */}
            <div
                className={cn(
                    // Under `grow` the wrapper takes the leftover height and passes it to the
                    // control, so the field ends where its column ends.
                    grow && 'min-h-0 flex-1 [&_textarea]:h-full',
                    error &&
                        '[&_input]:border-destructive [&_textarea]:border-destructive [&_select]:border-destructive [&_button]:border-destructive [&_input]:hover:border-destructive [&_textarea]:hover:border-destructive [&_select]:hover:border-destructive [&_button]:hover:border-destructive [&_input]:focus:border-destructive [&_textarea]:focus:border-destructive [&_select]:focus:border-destructive [&_button]:focus:border-destructive [&_input]:focus-visible:ring-destructive/25 [&_textarea]:focus-visible:ring-destructive/25 [&_select]:focus:ring-destructive/25 [&_button]:focus:ring-destructive/25 [&_button]:ring-destructive/25 [&_button]:data-[state=open]:border-destructive [&_button]:data-[state=open]:ring-destructive/25',
                )}
            >
                {body}
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
