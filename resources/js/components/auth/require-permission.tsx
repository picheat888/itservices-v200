import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import { ArrowRight, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

/** Seconds the NoAccess screen waits before redirecting to the dashboard. */
const REDIRECT_SECONDS = 15;

/**
 * Gates a route's content. The user passes when they are the super admin or hold
 * at least one of the `anyOf` permission keys; otherwise an inline NoAccess screen
 * is shown (the URL is left unchanged — no redirect).
 */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: React.ReactNode }) {
    const { user } = useAuth();
    const allowed = user?.role === 'super' || anyOf.some((p) => user?.permissions?.includes(p));

    if (allowed) {
        return <>{children}</>;
    }

    return <NoAccess />;
}

/**
 * "System lockout" 403 screen — a terminal-flavoured access-denied state that fits
 * the Service Desk's monospace/brand identity. Counts down and auto-redirects to
 * the dashboard; the manual button leaves immediately. The timer is cleared on
 * unmount to avoid a stray redirect.
 */
function NoAccess() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const navigate = useNavigate();
    const location = useLocation();
    const [count, setCount] = useState(REDIRECT_SECONDS);

    useEffect(() => {
        if (count <= 0) {
            navigate('/');
            return;
        }
        const id = setTimeout(() => setCount((c) => c - 1), 1000);
        return () => clearTimeout(id);
    }, [count, navigate]);

    const pct = (count / REDIRECT_SECONDS) * 100;

    return (
        <div className="relative isolate grid min-h-[72vh] place-items-center overflow-hidden px-4">
            <style>{naStyles}</style>

            {/* Atmosphere: grid lines + a brand glow, both fading toward the edges. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                    backgroundImage:
                        'linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px)',
                    backgroundSize: '44px 44px',
                    maskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 80%)',
                    WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 80%)',
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: 'radial-gradient(60% 50% at 50% 38%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%)' }}
            />

            {/* Ghosted 403 behind the panel. */}
            <span
                aria-hidden
                className="na-ghost pointer-events-none absolute -z-10 font-mono leading-none font-extrabold tracking-tighter select-none"
                style={{ fontSize: 'min(34vw, 22rem)', color: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}
            >
                403
            </span>

            {/* Terminal-style panel. */}
            <div className="na-panel border-border bg-background/70 relative w-full max-w-md overflow-hidden rounded-xl border shadow-2xl backdrop-blur-md">
                <div className="border-border bg-muted/40 flex items-center gap-2 border-b px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ec6a5e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#f4bf4f]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#61c454]" />
                    <span className="text-muted-foreground ml-auto truncate font-mono text-xs">GET {location.pathname}</span>
                </div>

                <div className="flex flex-col gap-5 px-6 py-7 text-left">
                    <div
                        className="na-stagger text-destructive flex items-center gap-2 font-mono text-[11px] tracking-[0.22em] uppercase"
                        style={{ animationDelay: '60ms' }}
                    >
                        <span className="na-blink bg-destructive h-1.5 w-1.5 rounded-full" />
                        403 · forbidden
                    </div>

                    <div className="na-stagger flex items-center gap-3" style={{ animationDelay: '120ms' }}>
                        <span className="bg-destructive/10 text-destructive ring-destructive/15 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1">
                            <Lock className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold tracking-tight">{t('noaccess_title')}</h1>
                    </div>

                    <p className="na-stagger text-muted-foreground text-sm leading-relaxed" style={{ animationDelay: '180ms' }}>
                        {t('noaccess_desc')}
                    </p>

                    <div
                        className="na-stagger text-muted-foreground border-border/70 rounded-md border border-dashed px-3 py-2 font-mono text-xs"
                        style={{ animationDelay: '240ms' }}
                    >
                        <span className="text-brand">$</span> access --check <span className="text-destructive">denied</span>
                        <span className="na-blink ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-current align-middle" />
                    </div>

                    <div className="na-stagger flex flex-col gap-1.5" style={{ animationDelay: '300ms' }}>
                        <div className="text-muted-foreground flex items-center justify-between font-mono text-[11px]">
                            <span>{lang === 'th' ? 'กำลังกลับหน้า Dashboard' : 'auto-redirect → dashboard'}</span>
                            <span className="tabular-nums">{count}s</span>
                        </div>
                        <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                            <div className="bg-brand h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
                        </div>
                    </div>

                    <Link
                        to="/"
                        className="na-stagger bg-brand text-brand-foreground hover:bg-brand/90 group mt-1 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors"
                        style={{ animationDelay: '360ms' }}
                    >
                        {t('noaccess_back')}
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </div>
        </div>
    );
}

/** Scoped keyframes for the lockout screen (entrance, blink, slow drift). */
const naStyles = `
@keyframes na-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes na-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes na-float { 0%, 100% { transform: translateY(-1.5%); } 50% { transform: translateY(1.5%); } }
.na-panel { animation: na-fade-up .5s cubic-bezier(.22,1,.36,1) both; }
.na-stagger { animation: na-fade-up .5s cubic-bezier(.22,1,.36,1) both; }
.na-blink { animation: na-blink 1.1s steps(1,end) infinite; }
.na-ghost { animation: na-float 7s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .na-panel, .na-stagger, .na-blink, .na-ghost { animation: none; }
}
`;
