// Masked password input with a keyboard-reachable show/hide toggle (login page pattern).
import { useT } from '@/lang';
import type { FieldControlProps } from '@/shared/components/field';
import { Input } from '@/shared/ui/input';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput({
    value,
    visible,
    onToggle,
    onChange,
    ...control
}: FieldControlProps & {
    value: string;
    visible: boolean;
    onToggle: () => void;
    onChange: (value: string) => void;
}) {
    const t = useT();

    return (
        <div className="relative">
            <Input
                {...control}
                type={visible ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="pr-10 font-mono"
                placeholder="••••••••"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
            />
            <button
                type="button"
                onClick={onToggle}
                aria-label={visible ? t('hide_password') : t('show_password')}
                className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
}
