// Language and theme switches at the top right of the login page; a choice made here wins over the account's saved one after sign-in.
import { useT } from '@/lang';
import type { Lang } from '@/lang/types';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Moon, Sun } from 'lucide-react';

const LANGUAGES: { code: Lang; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'th', label: 'ไทย' },
];

const FOCUS = 'focus-visible:ring-ring ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden';

export function LoginToolbar() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const dark = useUiStore((s) => s.dark);
    const setLang = useUiStore((s) => s.setLang);
    const toggleDark = useUiStore((s) => s.toggleDark);
    const markLoginPref = useUiStore((s) => s.markLoginPref);

    const chooseLang = (next: Lang) => {
        setLang(next);
        markLoginPref('lang');
    };
    const chooseDark = () => {
        toggleDark();
        markLoginPref('dark');
    };

    return (
        // Beside the brand panel: centred on its logo row (48px + 52px / 2) and 64px from the edge, mirroring it
        <div className="split:top-[53px] split:right-16 absolute top-5 right-6 z-10 flex items-center gap-2">
            {/* Both languages stay visible, the active one filled in */}
            <div
                role="group"
                aria-label={t('login_language')}
                className="border-border bg-muted/60 flex items-center gap-0.5 rounded-xl border p-[3px]"
            >
                {LANGUAGES.map(({ code, label }) => (
                    <button
                        key={code}
                        type="button"
                        onClick={() => chooseLang(code)}
                        aria-pressed={lang === code}
                        className={cn(
                            'press touch:h-[38px] touch:min-w-[52px] inline-flex h-[34px] min-w-[46px] cursor-pointer items-center justify-center rounded-[9px] px-2.5 text-[13px] font-semibold transition-colors',
                            FOCUS,
                            lang === code ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <button
                type="button"
                onClick={chooseDark}
                aria-label={t(dark ? 'login_theme_to_light' : 'login_theme_to_dark')}
                className={cn(
                    'press-icon border-border bg-background text-muted-foreground hover:text-foreground touch:size-[46px] inline-flex size-[42px] cursor-pointer items-center justify-center rounded-xl border transition-colors',
                    FOCUS,
                )}
            >
                {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
            </button>
        </div>
    );
}
