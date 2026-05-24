import { Label } from '@/components/ui/label';

export function Field({
    label,
    error,
    required,
    help,
    children,
}: {
    label: string;
    error?: string;
    required?: boolean;
    help?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label>
                {label}
                {required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            {children}
            {error ? <p className="text-xs text-destructive">{error}</p> : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
        </div>
    );
}
