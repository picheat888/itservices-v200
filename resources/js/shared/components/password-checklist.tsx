import { useT } from '@/lang';
import { PASSWORD_RULES } from '@/shared/lib/password-policy';
import { cn } from '@/shared/lib/utils';
import { Check } from 'lucide-react';

/**
 * Live policy checklist for a password field — every requirement is listed from the start
 * (so the rules are known before typing) and ticks green the moment it passes. Rendering it
 * unconditionally also keeps the form from shifting under the cursor mid-typing.
 */
export function PasswordChecklist({ value, className }: { value: string; className?: string }) {
    const t = useT();

    return (
        <ul className={cn('grid grid-cols-2 gap-x-3 gap-y-1', className)}>
            {PASSWORD_RULES.map((rule) => {
                const met = rule.test(value);
                return (
                    <li
                        key={rule.key}
                        className={cn(
                            'flex items-center gap-1.5 text-xs transition-colors',
                            met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                        )}
                    >
                        {met ? (
                            <Check className="h-3 w-3 shrink-0" />
                        ) : (
                            <span className="bg-muted-foreground/50 h-1 w-1 shrink-0 rounded-full" aria-hidden />
                        )}
                        {t(rule.labelKey)}
                    </li>
                );
            })}
        </ul>
    );
}
