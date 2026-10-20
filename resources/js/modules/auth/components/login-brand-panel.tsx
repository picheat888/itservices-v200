// Login brand panel, shown only on a wide screen with a mouse: brand, tagline, a sample ticket and the grid lens.
// Dark mode mixes the brand into a deep ground instead of filling half the screen with the light dark-mode brand.
import { useT } from '@/lang';
import { LoginGridLens } from '@/modules/auth/components/login-grid-lens';
import { SampleTicketCard } from '@/modules/auth/components/sample-ticket-card';
import { useUiStore } from '@/stores/ui';

export function LoginBrandPanel() {
    const t = useT();
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const dark = useUiStore((s) => s.dark);

    return (
        <aside className="group/panel bg-brand text-brand-foreground split:flex relative isolate hidden min-w-0 flex-col overflow-hidden px-16 pt-12 pb-9 [--edge:rgb(255_255_255/0.26)] [--grid:rgb(255_255_255/0.13)] [--tile:rgb(255_255_255/0.14)] dark:bg-[color-mix(in_oklab,var(--brand)_30%,hsl(225_42%_7%))] dark:text-[hsl(220_40%_97%)] dark:[--edge:rgb(175_195_245/0.18)] dark:[--grid:rgb(175_195_245/0.085)] dark:[--tile:rgb(175_195_245/0.08)]">
            {/* Still grid; the lens canvas takes over under a mouse */}
            <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid)_1px,transparent_1px)] bg-[size:72px_72px] group-data-[lens=on]/panel:opacity-0"
            />
            <LoginGridLens dark={dark} />

            <div className="flex items-center gap-3.5">
                <div className="grid size-[52px] shrink-0 place-items-center rounded-[14px] border border-(--edge) bg-(--tile)">
                    <img src={logoUrl || '/logo.svg'} alt="" className="size-9 object-contain" />
                </div>
                <div>
                    <div className="text-xl leading-tight font-bold">{brandName}</div>
                    <div className="text-sm dark:text-[hsl(220_30%_84%)]">{brandSub}</div>
                </div>
            </div>

            {/* Starts on the form title's line (--login-top, set on the page; 6.25rem = top padding + logo row) */}
            <div className="mt-[calc(var(--login-top)-6.25rem)] grid max-w-[560px] gap-9">
                <div className="grid gap-3.5">
                    <p className="text-[2.625rem] leading-[1.38] font-semibold text-balance whitespace-pre-line [&:lang(en)]:leading-[1.18]">
                        {t('login_tagline')}
                    </p>
                    <p className="max-w-[44ch] text-base leading-relaxed dark:text-[hsl(220_30%_84%)]">{t('login_hero_desc')}</p>
                </div>
                <SampleTicketCard />
            </div>

            <div className="mt-auto pt-8 text-xs dark:text-[hsl(220_30%_84%)]">
                © {new Date().getFullYear()} {brandName}
            </div>
        </aside>
    );
}
