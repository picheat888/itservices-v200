// Masked password input with a keyboard-reachable show/hide toggle (login page pattern).
import { useT } from '@/lang';
import type { FieldControlProps } from '@/shared/components/field';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput({
    value,
    visible,
    onToggle,
    onChange,
    autoComplete = 'new-password',
    autoFocus,
    placeholder = '••••••••',
    large,
    inputClassName,
    ...control
}: FieldControlProps & {
    value: string;
    visible: boolean;
    onToggle: () => void;
    onChange: (value: string) => void;
    autoComplete?: 'new-password' | 'current-password';
    autoFocus?: boolean;
    placeholder?: string;
    /** A tall field (login page): a 44px toggle. */
    large?: boolean;
    /** Extra classes for the input, e.g. its height or a leading icon's room. */
    inputClassName?: string;
}) {
    const t = useT();

    return (
        <div className="relative">
            <Input
                {...control}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(large ? 'pr-12' : 'pr-10', inputClassName)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                autoFocus={autoFocus}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
            />
            <button
                type="button"
                onClick={onToggle}
                aria-label={visible ? t('hide_password') : t('show_password')}
                className={cn(
                    'press-icon text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                    large ? 'right-0.5 size-11' : 'right-1 h-8 w-8',
                )}
            >
                {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
        </div>
    );
}
