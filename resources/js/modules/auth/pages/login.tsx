import { useT } from '@/lang';
import type { DeviceLimitResponse } from '@/modules/auth/api/authApi';
import { DeviceLimitDialog } from '@/modules/auth/components/device-limit-dialog';
import { LoginBrandPanel } from '@/modules/auth/components/login-brand-panel';
import { LoginToolbar } from '@/modules/auth/components/login-toolbar';
import { useAuth, useLogin } from '@/modules/auth/hooks/use-auth';
import { deviceLimitOf, isPendingExpired, signedOutByLine } from '@/modules/auth/lib/device-limit';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { PasswordInput } from '@/shared/components/password-input';
import { SaveButton } from '@/shared/components/save-button';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { markShownInline } from '@/shared/lib/http-errors';
import { loginNoticeReason, readSignedOutBy, serverFileTarget, type SignedOutBy, type SignedOutReason } from '@/shared/lib/login-redirect';
import { focusFirstError } from '@/shared/lib/utils';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useUiStore } from '@/stores/ui';
import { ArrowBigUpDash, Clock, Lock, LogOut, MonitorSmartphone, Shield, User, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';

// Notice shown for each reason a device was signed out
const NOTICES: Record<SignedOutReason, { icon: LucideIcon; text: string }> = {
    session_expired: { icon: Clock, text: 'login_session_expired' },
    signed_out: { icon: LogOut, text: 'login_signed_out' },
    third_device: { icon: MonitorSmartphone, text: 'login_notice_third_device' },
    profile: { icon: LogOut, text: 'login_notice_profile' },
    limit: { icon: Shield, text: 'login_notice_limit' },
    account_closed: { icon: Lock, text: 'login_err_closed' },
};

// Field ids stay fixed so a rejected password can be selected again
const LOGIN_ID = 'login';
const PASSWORD_ID = 'password';

// Tall fields with room for the leading icon; 16px text keeps iPad Safari from zooming in
const INPUT = 'touch:h-13 h-12 rounded-lg pl-10 text-base md:text-base';
const FIELD_ICON = 'text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 z-10 size-[18px] -translate-y-1/2';

type FieldErrors = { login?: string; password?: string };

// A touch screen lets the server label an iPad that reports itself as a Mac (display only)
const hasTouchScreen = (): boolean => navigator.maxTouchPoints > 1;

export default function LoginPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    useDocumentTitle('login_title');
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const fmt = useDateFormat();
    const { isAuthenticated, isLoading } = useAuth();
    const login = useLogin();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(false);
    // Lang keys of the required-field errors
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    // Each rejected attempt shakes the banner again
    const [errorCount, setErrorCount] = useState(0);
    const [capsOn, setCapsOn] = useState(false);
    const [forgotOpen, setForgotOpen] = useState(false);
    const capsId = useId();
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
    const notice = signedOutReason && bannerText === null && !dialogOpen ? NOTICES[signedOutReason] : null;

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
        setErrorCount((n) => n + 1);
        // Rejected credentials are retyped from the password field; a lockout or an outage is not
        if ((error as { response?: { status?: number } })?.response?.status === 422) {
            (document.getElementById(PASSWORD_ID) as HTMLInputElement | null)?.select();
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
        setErrorCount((n) => n + 1);
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (login.isPending) {
            return;
        }

        // Required check first: red fields, caret on the first one once its error is linked
        const errs: FieldErrors = {};
        if (!loginId.trim()) {
            errs.login = 'login_err_username';
        }
        if (!password) {
            errs.password = 'login_err_password';
        }
        setFieldErrors(errs);
        setSignedOutReason(null);
        setSignedOutBy(null);
        setPendingExpired(false);
        login.reset();
        if (Object.keys(errs).length > 0) {
            focusFirstError(errs as Record<string, string>);
            return;
        }

        login.mutate({ login: loginId, password, remember, touch: hasTouchScreen() }, { onError: (error) => onSignInError(error, false) });
    };

    const readCaps = (e: React.KeyboardEvent) => setCapsOn(e.getModifierState('CapsLock'));

    return (
        <div className="bg-background text-foreground split:grid split:grid-cols-2 relative min-h-dvh w-full">
            <LoginBrandPanel />

            <main className="relative flex min-h-dvh min-w-0 flex-col">
                <LoginToolbar />

                <div className="touch:px-8 flex flex-1 justify-center px-6 pt-[max(5.5rem,calc(50dvh-18rem))] pb-12">
                    <div className="animate-in fade-in split:max-w-[25rem] w-full max-w-[30rem] [animation-duration:var(--motion-open)]">
                        {/* Brand header where the panel is hidden (iPad, narrow windows); short screens tighten the gaps */}
                        <div className="split:hidden mb-10 flex items-center gap-4 [@media(max-height:50rem)]:mb-7">
                            <img src={logoUrl || '/logo.svg'} alt="" className="size-16 shrink-0 object-contain" />
                            <div>
                                <div className="text-2xl leading-tight font-bold">{brandName}</div>
                                <div className="text-muted-foreground text-base">{brandSub}</div>
                            </div>
                        </div>

                        <h1 className="touch:text-[2rem] text-[1.875rem] leading-tight font-bold">{t('login_title')}</h1>
                        <p className="text-muted-foreground touch:text-base mt-1.5 text-[0.9375rem]">{t('login_sub')}</p>

                        {/* Why the reader is here, or why the last attempt failed: read before the fields */}
                        {(notice || bannerText) && (
                            <div className="mt-6 grid gap-2.5 [@media(max-height:50rem)]:mt-[18px]">
                                {notice && (
                                    <p
                                        role="status"
                                        className="bg-brand/10 border-brand/25 text-brand-ink flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm"
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
                                <FormErrorBanner message={bannerText ?? ''} shakeKey={errorCount} />
                            </div>
                        )}

                        <form
                            onSubmit={submit}
                            noValidate
                            className="mt-7 grid gap-[18px] [@media(max-height:50rem)]:mt-[22px] [@media(max-height:50rem)]:gap-3.5"
                        >
                            <Field label={t('login_field')} name="login" controlId={LOGIN_ID} error={fieldErrors.login && t(fieldErrors.login)}>
                                {(control) => (
                                    <div className="relative">
                                        <User className={FIELD_ICON} aria-hidden />
                                        <Input
                                            {...control}
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
                                            placeholder={t('login_field_placeholder')}
                                            className={INPUT}
                                        />
                                    </div>
                                )}
                            </Field>

                            <Field
                                label={t('login_password')}
                                name="password"
                                controlId={PASSWORD_ID}
                                error={fieldErrors.password && t(fieldErrors.password)}
                            >
                                {(control) => (
                                    <div className="relative" onKeyDown={readCaps} onKeyUp={readCaps} onBlur={() => setCapsOn(false)}>
                                        <Lock className={FIELD_ICON} aria-hidden />
                                        <PasswordInput
                                            {...control}
                                            aria-describedby={
                                                [control['aria-describedby'], capsOn ? capsId : null].filter(Boolean).join(' ') || undefined
                                            }
                                            large
                                            inputClassName={INPUT}
                                            value={password}
                                            visible={showPassword}
                                            onToggle={() => setShowPassword((v) => !v)}
                                            onChange={(value) => {
                                                setPassword(value);
                                                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                                            }}
                                            autoComplete="current-password"
                                            placeholder={t('login_password')}
                                        />
                                        {capsOn && (
                                            <p id={capsId} className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
                                                <ArrowBigUpDash className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                {t('login_caps_on')}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </Field>

                            <div className="flex flex-wrap items-center justify-between gap-x-4">
                                <div className="flex min-h-11 items-center gap-2.5">
                                    <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                                    <Label htmlFor="remember" className="touch:text-[0.9375rem] cursor-pointer font-normal">
                                        {t('login_remember')}
                                    </Label>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setForgotOpen((open) => !open)}
                                    aria-expanded={forgotOpen}
                                    aria-controls="login-forgot-help"
                                    className="text-brand-ink focus-visible:ring-ring touch:text-[0.9375rem] min-h-11 cursor-pointer rounded-sm text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
                                >
                                    {t('login_forgot')}
                                </button>
                            </div>

                            <SaveButton
                                type="submit"
                                loading={login.isPending}
                                loadingLabel={t('login_signing_in')}
                                className="touch:h-13 touch:text-base h-12 w-full rounded-lg text-[0.9375rem] font-semibold"
                            >
                                {t('login_submit')}
                            </SaveButton>
                            <p
                                id="login-forgot-help"
                                hidden={!forgotOpen}
                                className="border-border bg-muted/50 rounded-lg border px-3.5 py-3 text-sm leading-relaxed"
                            >
                                {t('login_forgot_help')}
                            </p>
                        </form>
                    </div>
                </div>

                <div className="split:hidden text-muted-foreground pb-5 text-center text-xs">
                    © {new Date().getFullYear()} {brandName}
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
