import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

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
                {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {children}
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
