import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/ui/label';
import { AlertCircle } from 'lucide-react';

export function Field({
    label,
    error,
    required,
    help,
    name,
    children,
}: {
    label: string;
    error?: string;
    required?: boolean;
    help?: string;
    /** Field key — exposed as data-field so a form can scroll/focus it on validation error. */
    name?: string;
    children: React.ReactNode;
}) {
    return (
        <div data-field={name} className="space-y-1.5">
            <Label>
                {label}
                {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {/* On error, tint the control(s) inside red — input/textarea/select and
                button-style triggers (SearchableSelect) all pick up the border. */}
            <div
                className={cn(
                    error &&
                        '[&_input]:border-destructive [&_textarea]:border-destructive [&_select]:border-destructive [&_button]:border-destructive [&_input]:focus-visible:ring-destructive/25 [&_textarea]:focus-visible:ring-destructive/25',
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
