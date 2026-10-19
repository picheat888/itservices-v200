import { useT } from '@/lang';
import type { Lang } from '@/lang/types';
import type { DeviceLimitResponse } from '@/modules/auth/api/authApi';
import { DeviceLimitDialog } from '@/modules/auth/components/device-limit-dialog';
import { useAuth, useLogin } from '@/modules/auth/hooks/use-auth';
import { deviceLimitOf, isPendingExpired, signedOutByLine } from '@/modules/auth/lib/device-limit';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { markShownInline } from '@/shared/lib/http-errors';
import { loginNoticeReason, readSignedOutBy, serverFileTarget, type SignedOutBy, type SignedOutReason } from '@/shared/lib/login-redirect';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useUiStore } from '@/stores/ui';
import { AlertCircle, Clock, Eye, EyeOff, Loader2, Lock, LogOut, MonitorSmartphone, Moon, Shield, Sun, User, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';

const LANGUAGES: { code: Lang; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'th', label: 'ไทย' },
];

// Notice shown for each reason a device was signed out
const NOTICES: Record<SignedOutReason, { icon: LucideIcon; text: string }> = {
    session_expired: { icon: Clock, text: 'login_session_expired' },
    signed_out: { icon: LogOut, text: 'login_signed_out' },
    third_device: { icon: MonitorSmartphone, text: 'login_notice_third_device' },
    profile: { icon: LogOut, text: 'login_notice_profile' },
    limit: { icon: Shield, text: 'login_notice_limit' },
};

// A touch screen lets the server label an iPad that reports itself as a Mac (display only)
const hasTouchScreen = (): boolean => navigator.maxTouchPoints > 1;

export default function LoginPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    useDocumentTitle('login_title');
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const lang = useUiStore((s) => s.lang);
    const dark = useUiStore((s) => s.dark);
    const setLang = useUiStore((s) => s.setLang);
    const toggleDark = useUiStore((s) => s.toggleDark);
    const markLoginPref = useUiStore((s) => s.markLoginPref);

    // A deliberate language / theme choice here wins over the account's saved one after sign-in
    const chooseLang = (next: Lang) => {
        setLang(next);
        markLoginPref('lang');
    };
    const chooseDark = () => {
        toggleDark();
        markLoginPref('dark');
    };
    const fmt = useDateFormat();
    const { isAuthenticated, isLoading } = useAuth();
    const login = useLogin();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(false);
    // Focus targets for failed submits (see submit()).
    const loginRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    // Per-field required-validation messages (red border + red text, like the mockup).
    const [fieldErrors, setFieldErrors] = useState<{ login?: string; password?: string }>({});
    // Briefly shake the error banner on a rejected sign-in attempt.
    const [shake, setShake] = useState(false);
    // The 409 answer that opens the device dialog, and a confirmation that ran out
    const [deviceLimit, setDeviceLimit] = useState<DeviceLimitResponse | null>(null);
    const [pendingExpired, setPendingExpired] = useState(false);

    // Back to the page the reader was headed for (set by ProtectedRoute), else the dashboard
    const location = useLocation();
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    const target = from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/';

    // Signed out by the idle timer or from elsewhere: say so once, then drop ?reason= so a reload does not repeat it
    const [searchParams, setSearchParams] = useSearchParams();
    const [signedOutReason, setSignedOutReason] = useState(() => loginNoticeReason(searchParams.get('reason')));
    const [signedOutBy, setSignedOutBy] = useState<SignedOutBy | null>(() =>
        loginNoticeReason(searchParams.get('reason')) === 'third_device' ? readSignedOutBy() : null,
    );
    useEffect(() => {
        if (!searchParams.has('reason')) return;
        const reason = loginNoticeReason(searchParams.get('reason'));
        if (reason) setSignedOutReason(reason);
        const by = reason === 'third_device' ? readSignedOutBy() : null;
        if (by) setSignedOutBy(by);
        setSearchParams(
            (p) => {
                p.delete('reason');
                return p;
            },
            { replace: true, state: location.state },
        );
    }, [searchParams, setSearchParams, location.state]);

    // A server file link (an emailed report file) opened while signed out: reopen it after sign-in
    const fileTarget = serverFileTarget(searchParams.get('next'));
    useEffect(() => {
        if (!isLoading && isAuthenticated && fileTarget) window.location.replace(fileTarget);
    }, [isLoading, isAuthenticated, fileTarget]);

    if (!isLoading && isAuthenticated) return fileTarget ? null : <Navigate to={target} replace />;

    // A failed sign-in in the reader's language: lockout, wrong credentials, closed account, expired confirmation or no server
    const errorMessage = (error: unknown): string => {
        const res = (
            error as {
                response?: { status?: number; data?: { retry_after?: number; message?: string }; headers?: Record<string, string> };
            } | null
        )?.response;
        if (!res) {
            return t('login_err_server');
        }
        if (res.status === 429) {
            // The sign-in lockout sends retry_after; the app-wide limiter only sends the Retry-After header
            const header = Number(res.headers?.['retry-after']);
            const seconds = res.data?.retry_after ?? (Number.isFinite(header) ? header : 0);
            if (seconds <= 0) {
                return t('login_err_throttled_wait');
            }
            const wait =
                seconds >= 60
                    ? t('login_time_minutes').replace('{n}', fmtN(Math.ceil(seconds / 60)))
                    : t('login_time_seconds').replace('{n}', fmtN(seconds));

            return t('login_err_throttled').replace('{time}', wait);
        }
        // A right password on a closed account is not a typo
        if (res.status === 403 && res.data?.message === 'account_closed') {
            return t('login_err_closed');
        }
        if (isPendingExpired(error)) {
            return t('login_pending_expired');
        }
        if (res.status === 422) {
            return t('login_error');
        }

        return t('login_err_server');
    };

    // The device dialog is open while a 409 answer or a failure of its own sign-in is on screen
    const failure = login.isError && deviceLimitOf(login.error) === null ? login.error : null;
    const dialogOpen = deviceLimit !== null;
    const bannerText = dialogOpen ? null : pendingExpired ? t('login_pending_expired') : failure ? errorMessage(failure) : null;
    const notice = signedOutReason ? NOTICES[signedOutReason] : null;

    const shakeBanner = () => {
        setShake(true);
        setTimeout(() => setShake(false), 450);
    };

    // The same handler serves the password sign-in and the one that finishes the dialog
    const onSignInError = (error: unknown, fromDialog: boolean) => {
        const refusal = deviceLimitOf(error);
        if (refusal) {
            setDeviceLimit(refusal);
            return;
        }
        if (fromDialog && !isPendingExpired(error)) {
            // The dialog words this one
            markShownInline(error);
            return;
        }
        setDeviceLimit(null);
        shakeBanner();
        // Rejected credentials are retyped from the password field; a lockout or an outage is not
        if ((error as { response?: { status?: number } })?.response?.status === 422) {
            passwordRef.current?.select();
        }
    };

    const finishSignIn = () => {
        if (!deviceLimit || login.isPending) {
            return;
        }
        setPendingExpired(false);
        login.mutate({ pending: deviceLimit.pending, remember, touch: hasTouchScreen() }, { onError: (error) => onSignInError(error, true) });
    };

    const cancelDeviceLimit = () => {
        setDeviceLimit(null);
        login.reset();
    };

    const expireDeviceLimit = () => {
        setDeviceLimit(null);
        setPendingExpired(true);
        shakeBanner();
    };

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
        setSignedOutReason(null);
        setSignedOutBy(null);
        setPendingExpired(false);
        login.reset(); // clear any previous "invalid credentials" banner
        if (Object.keys(errs).length > 0) {
            // Caret goes to the first field that needs fixing
            (errs.login ? loginRef : passwordRef).current?.focus();
            return;
        }

        login.mutate({ login: loginId, password, remember, touch: hasTouchScreen() }, { onError: (error) => onSignInError(error, false) });
    };

    return (
        <div className="bg-background text-foreground relative min-h-dvh w-full lg:grid lg:grid-cols-[1.05fr_1fr]">
            {/* ── Brand panel (desktop only) ───────────────────────────────── */}
            <aside className="bg-brand text-brand-foreground relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
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
            <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-12">
                {/* Language + theme toggles */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    {/* Both languages stay visible, the active one filled in */}
                    <div role="group" aria-label={t('login_language')} className="border-border flex h-9 items-center rounded-lg border p-0.5">
                        {LANGUAGES.map(({ code, label }) => (
                            <button
                                key={code}
                                type="button"
                                onClick={() => chooseLang(code)}
                                aria-pressed={lang === code}
                                className={cn(
                                    'focus-visible:ring-ring ring-offset-background inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-hidden',
                                    lang === code ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground cursor-pointer',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={chooseDark}
                        aria-label={t('login_theme')}
                        className="border-border text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring ring-offset-background inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
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
                                    ref={loginRef}
                                    value={loginId}
                                    onChange={(e) => {
                                        setLoginId(e.target.value);
                                        if (fieldErrors.login) setFieldErrors((p) => ({ ...p, login: undefined }));
                                    }}
                                    autoFocus
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    placeholder={t('login_field')}
                                    aria-invalid={!!fieldErrors.login}
                                    aria-describedby={fieldErrors.login ? 'login-error' : undefined}
                                    className={cn(
                                        'pl-9',
                                        // Same look as the shared Field error
                                        fieldErrors.login && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                    )}
                                />
                            </div>
                            {fieldErrors.login && (
                                <p
                                    id="login-error"
                                    className="text-destructive animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 text-xs"
                                >
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
                                    ref={passwordRef}
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                                    }}
                                    autoComplete="current-password"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    placeholder={t('login_password')}
                                    aria-invalid={!!fieldErrors.password}
                                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                                    className={cn(
                                        'pr-10 pl-9',
                                        fieldErrors.password &&
                                            'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? t('login_hide_password') : t('login_show_password')}
                                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {fieldErrors.password && (
                                <p
                                    id="password-error"
                                    className="text-destructive animate-in fade-in slide-in-from-top-1 flex items-center gap-1.5 text-xs"
                                >
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    {fieldErrors.password}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5">
                            <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                            <Label htmlFor="remember" className="cursor-pointer font-normal">
                                {t('login_remember')}
                            </Label>
                        </div>

                        {notice && bannerText === null && !dialogOpen && (
                            <p
                                role="status"
                                className="bg-brand/10 border-brand/25 text-brand-ink flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                            >
                                <notice.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                                <span>
                                    {t(notice.text)}
                                    {signedOutReason === 'third_device' && signedOutBy && (
                                        <span className="mt-0.5 block text-xs">{signedOutByLine(signedOutBy, t, fmt.dateTime)}</span>
                                    )}
                                </span>
                            </p>
                        )}

                        {bannerText !== null && (
                            <p
                                role="alert"
                                className={cn(
                                    'bg-destructive/10 dark:text-destructive border-destructive/25 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-red-700',
                                    shake && 'animate-shake',
                                )}
                            >
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                {bannerText}
                            </p>
                        )}

                        <Button type="submit" className="mt-1 w-full active:translate-y-px" disabled={login.isPending}>
                            {login.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('login_signing_in')}
                                </>
                            ) : (
                                t('login_submit')
                            )}
                        </Button>
                    </form>
                </div>
            </main>

            {/* Account at its device limit */}
            <DeviceLimitDialog
                open={deviceLimit !== null}
                limit={deviceLimit}
                completing={login.isPending && deviceLimit !== null}
                errorText={dialogOpen && failure ? errorMessage(failure) : undefined}
                failureText={errorMessage}
                onContinue={finishSignIn}
                onCancel={cancelDeviceLimit}
                onExpired={expireDeviceLimit}
            />
        </div>
    );
}
