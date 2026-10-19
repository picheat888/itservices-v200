// One error block for dialogs and full pages: visual, title, lines, optional reference row, stacked actions.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Check, Copy, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export type ErrorTone = 'danger' | 'wait' | 'info';

const TONE_CLASS: Record<ErrorTone, string> = {
    danger: 'text-red-600 dark:text-red-400',
    wait: 'text-amber-600 dark:text-amber-400',
    info: 'text-brand',
};

export function ErrorIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: ErrorTone }) {
    return <Icon className={cn('h-10 w-10', TONE_CLASS[tone])} strokeWidth={1.75} aria-hidden />;
}

// Reference row: the server's request id with a copy button
export function ReferenceCode({ code }: { code: string }) {
    const t = useT();
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
        } catch {
            return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
            <span>
                {t('err_reference_label')} <span className="text-foreground">{code}</span>
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={t('err_copy_reference')} onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
        </div>
    );
}

interface ErrorStateProps {
    variant: 'dialog' | 'page';
    visual: ReactNode;
    title: string;
    lines: string[];
    reference?: string | null;
    /** Shown between the description and the reference row. */
    status?: ReactNode;
    actions: ReactNode;
}

export function ErrorState({ variant, visual, title, lines, reference, status, actions }: ErrorStateProps) {
    const hasReference = typeof reference === 'string' && reference !== '';
    const isDialog = variant === 'dialog';

    const titleClass = 'mb-1 text-base leading-normal font-semibold tracking-normal';
    const descriptionClass = cn('text-muted-foreground text-sm', status || hasReference ? 'mb-4' : 'mb-5');
    const description = lines.map((line, index) => (
        <span key={index} className="block">
            {line}
        </span>
    ));

    return (
        <div className={cn('text-center', !isDialog && 'mx-auto w-full max-w-sm')}>
            <div className="mb-4 flex justify-center">{visual}</div>

            {isDialog ? <DialogTitle className={titleClass}>{title}</DialogTitle> : <h1 className={titleClass}>{title}</h1>}
            {isDialog ? (
                <DialogDescription className={descriptionClass}>{description}</DialogDescription>
            ) : (
                <p className={descriptionClass}>{description}</p>
            )}

            {status}
            {hasReference && (
                <div className="mb-5">
                    <ReferenceCode code={reference} />
                </div>
            )}

            <div className="flex w-full flex-col gap-2">{actions}</div>
        </div>
    );
}
