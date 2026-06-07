import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useLogin } from '@/hooks/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, ArrowRight, Eye, EyeOff, Languages, Loader2, Lock, Moon, Sun, User } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function LoginPage() {
    const t = useT();
    useDocumentTitle('login_title');
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const lang = useUiStore((s) => s.lang);
    const dark = useUiStore((s) => s.dark);
    const toggleLang = useUiStore((s) => s.toggleLang);
    const toggleDark = useUiStore((s) => s.toggleDark);
    const markLoginPref = useUiStore((s) => s.markLoginPref);

    // A language / theme switch on the login screen is a deliberate choice:
    // flag that field so it wins over (and is saved to) the account after sign-in.
    const chooseLang = () => {
        toggleLang();
        markLoginPref('lang');
    };
    const chooseDark = () => {
        toggleDark();
        markLoginPref('dark');
    };
    const { isAuthenticated, isLoading } = useAuth();
    const login = useLogin();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // Per-field required-validation messages (red border + red text, like the mockup).
    const [fieldErrors, setFieldErrors] = useState<{ login?: string; password?: string }>({});
    // Briefly shake the error banner on a rejected sign-in attempt.
    const [shake, setShake] = useState(false);

    // Bounce back to the page the user was headed for (set by ProtectedRoute when a
    // Quick link / deep URL was opened while signed out), else the dashboard.
    const location = useLocation();
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    const target = from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/';

    if (!isLoading && isAuthenticated) return <Navigate to={target} replace />;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (login.isPending) {
            return;
        }

        // Client-side required check first — show red field errors and stop.
        const errs: { login?: string; password?: string } = {};
        if (!loginId.trim()) {
            errs.login = t('login_err_username');
        }
        if (!password) {
            errs.password = t('login_err_password');
        }
        setFieldErrors(errs);
        login.reset(); // clear any previous "invalid credentials" banner
        if (Object.keys(errs).length > 0) {
            return;
        }

        login.mutate(
            { login: loginId, password },
            {
                // Wrong credentials → shake the banner once (matches the mockup UX).
                onError: () => {
                    setShake(true);
                    setTimeout(() => setShake(false), 450);
                },
            },
        );
    };

    return (
        <div className="bg-background text-foreground relative min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr]">
            {/* ── Brand panel (desktop only) ───────────────────────────────── */}
            <aside className="bg-brand relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
                {/* Blueprint grid texture */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{
                        backgroundImage:
                            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
                        backgroundSize: '40px 40px',
                    }}
                />
                {/* Depth: a tinted gradient wash + two soft light wells */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/25" />
                <div aria-hidden className="pointer-events-none absolute -top-28 -right-28 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
                <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-black/20 blur-3xl" />

                <div className="animate-in fade-in slide-in-from-top-2 relative flex items-center gap-3 duration-700">
                    <img
                        src={logoUrl || '/logo.svg'}
                        alt={brandName}
                        className="h-12 w-12 rounded-xl bg-white/15 object-contain p-1.5 ring-1 ring-white/25"
                    />
                    <div>
                        <div className="text-lg font-bold tracking-tight">{brandName}</div>
                        <div className="text-sm text-white/70">{brandSub}</div>
                    </div>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-3 relative max-w-md duration-700">
                    <h2 className="text-4xl leading-tight font-bold tracking-tight whitespace-pre-line">{t('login_tagline')}</h2>
                </div>

                <div className="relative text-xs text-white/55">
                    © {new Date().getFullYear()} {brandName}
                </div>
            </aside>

            {/* ── Sign-in form ─────────────────────────────────────────────── */}
            <main className="relative flex min-h-screen flex-col items-center justify-center px-5 py-12">
                {/* Language + theme toggles */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={chooseLang}
                        aria-label={t('login_language')}
                        className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors"
                    >
                        <Languages className="h-4 w-4" />
                        {lang === 'en' ? 'EN' : 'ไทย'}
                    </button>
                    <button
                        type="button"
                        onClick={chooseDark}
                        aria-label={t('login_theme')}
                        className="border-border text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
                    >
                        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                </div>

                {/* Compact brand header (mobile only — panel is hidden) */}
                <div className="mb-8 flex items-center gap-3 lg:hidden">
                    <img src={logoUrl || '/logo.svg'} alt={brandName} className="h-11 w-11 rounded-xl object-contain" />
                    <div>
                        <div className="text-base font-bold">{brandName}</div>
                        <div className="text-muted-foreground text-xs">{brandSub}</div>
                    </div>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-3 w-full max-w-sm duration-700">
                    {/* System logo above the heading (desktop only — mobile shows it in the brand header above) */}
                    <img src={logoUrl || '/logo.svg'} alt={brandName} className="mb-5 hidden h-14 w-14 rounded-xl object-contain lg:block" />
                    <h1 className="text-2xl font-bold tracking-tight">{t('login_title')}</h1>
                    <p className="text-muted-foreground mt-1.5 mb-7 text-sm">{t('login_sub')}</p>

                    <form onSubmit={submit} className="space-y-4" noValidate>
                        <div className="space-y-1.5">
                            <Label htmlFor="login">{t('login_field')}</Label>
                            <div className="relative">
                                <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    id="login"
                                    value={loginId}
                                    onChange={(e) => {
                                        setLoginId(e.target.value);
                                        if (fieldErrors.login) setFieldErrors((p) => ({ ...p, login: undefined }));
                                    }}
                                    autoFocus
                                    autoComplete="username"
                                    placeholder={t('login_field')}
                                    aria-invalid={!!fieldErrors.login}
                                    className={cn('pl-9', fieldErrors.login && 'border-destructive focus-visible:ring-destructive')}
                                />
                            </div>
                            {fieldErrors.login && (
                                <p className="text-destructive animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 text-xs">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    {fieldErrors.login}
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password">{t('login_password')}</Label>
                            <div className="relative">
                                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                                    }}
                                    autoComplete="current-password"
                                    placeholder={t('login_password')}
                                    aria-invalid={!!fieldErrors.password}
                                    className={cn('pr-10 pl-9', fieldErrors.password && 'border-destructive focus-visible:ring-destructive')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? t('login_hide_password') : t('login_show_password')}
                                    className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {fieldErrors.password && (
                                <p className="text-destructive animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 text-xs">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    {fieldErrors.password}
                                </p>
                            )}
                        </div>

                        {login.isError && (
                            <p
                                className={cn(
                                    'bg-destructive/10 text-destructive border-destructive/25 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                                    shake && 'animate-shake',
                                )}
                            >
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {t('login_error')}
                            </p>
                        )}

                        <Button type="submit" className="mt-1 w-full active:translate-y-px" disabled={login.isPending}>
                            {login.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('login_signing_in')}
                                </>
                            ) : (
                                <>
                                    {t('login_submit')}
                                    <ArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </form>
                </div>
            </main>
        </div>
    );
}
