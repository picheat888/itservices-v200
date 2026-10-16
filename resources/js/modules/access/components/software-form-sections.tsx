// Software add/edit form sections used by ResourceModal: licence type, seat count
// (number or unlimited) and the product key switch.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { SoftwareLicenseType } from '@/shared/types';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { AlertCircle, Code2, Eye, EyeOff, Gift, InfinityIcon, Lock, Minus, Plus, RotateCw, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

/** License types shown as cards; `expectsKey` = paid licence (key on, seats counted by default). */
export const LICENSE_CARDS: { value: SoftwareLicenseType; icon: LucideIcon; expectsKey: boolean }[] = [
    { value: 'subscription', icon: RotateCw, expectsKey: true },
    { value: 'perpetual', icon: ShieldCheck, expectsKey: true },
    { value: 'open_source', icon: Code2, expectsKey: false },
    { value: 'free', icon: Gift, expectsKey: false },
];

export function isFreeLicense(type: SoftwareLicenseType): boolean {
    return !(LICENSE_CARDS.find((c) => c.value === type)?.expectsKey ?? true);
}

/** Four licence-type cards: icon on the left, name + one-line hint on the right. */
export function LicenseTypePicker({ value, onChange }: { value: SoftwareLicenseType; onChange: (type: SoftwareLicenseType) => void }) {
    const t = useT();
    return (
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('access_license_type')}>
            {LICENSE_CARDS.map(({ value: type, icon: Icon }) => {
                const on = value === type;
                return (
                    <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(type)}
                        className={cn(
                            'focus-visible:ring-brand/40 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden',
                            on ? 'border-brand bg-brand/10 ring-brand ring-1 ring-inset' : 'border-input hover:border-brand/40',
                        )}
                    >
                        <Icon className={cn('h-4 w-4 shrink-0', on ? 'text-brand' : 'text-muted-foreground')} />
                        <span className="min-w-0">
                            <span className={cn('block text-[13px] leading-tight font-bold', on && 'text-brand')}>{t(`access_lic_${type}`)}</span>
                            <span className="text-muted-foreground block text-[11px] leading-snug">{t(`access_lic_hint_${type}`)}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** Seat count: a limited/unlimited segment beside a − n + stepper. */
export function SeatsField({
    seats,
    unlimited,
    autoUnlimited,
    min = 1,
    error,
    onSeatsChange,
    onUnlimitedChange,
}: {
    seats: string;
    unlimited: boolean;
    autoUnlimited: boolean;
    min?: number;
    error?: string;
    onSeatsChange: (value: string) => void;
    onUnlimitedChange: (unlimited: boolean) => void;
}) {
    const t = useT();
    const current = parseInt(seats, 10) || 0;
    const step = (delta: 1 | -1) => onSeatsChange(String(Math.max(min, current + delta)));
    const modes = [
        { unlimited: false, icon: Users, label: t('access_seats_limited') },
        { unlimited: true, icon: InfinityIcon, label: t('access_seats_unlimited') },
    ];

    return (
        <div data-field="seats" className="space-y-1.5">
            <span id="sw-seats-label" className="block text-sm font-medium">
                {t('access_seats')}
                <span className="text-destructive ml-0.5">*</span>
            </span>
            <div className="grid grid-cols-2 items-start gap-2.5">
                <div
                    role="radiogroup"
                    aria-labelledby="sw-seats-label"
                    className="bg-muted border-border grid h-10 grid-cols-2 gap-[3px] rounded-md border p-[3px]"
                >
                    {modes.map((mode) => {
                        const on = mode.unlimited === unlimited;
                        return (
                            <button
                                key={String(mode.unlimited)}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => onUnlimitedChange(mode.unlimited)}
                                className={cn(
                                    'focus-visible:ring-brand/40 inline-flex items-center justify-center gap-1.5 rounded-[5px] text-[13px] font-semibold transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden',
                                    on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <mode.icon className="h-[15px] w-[15px]" />
                                {mode.label}
                            </button>
                        );
                    })}
                </div>

                {unlimited ? (
                    <div className="border-input bg-muted text-muted-foreground flex h-10 items-center gap-2 rounded-md border border-dashed px-3 text-[13px]">
                        <InfinityIcon className="text-brand h-4 w-4 shrink-0" />
                        {t('access_seats_unlimited_box')}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <div
                            className={cn(
                                'bg-background flex h-10 items-center gap-1 rounded-md border px-1 transition-colors focus-within:ring-[3px]',
                                error
                                    ? 'border-destructive focus-within:ring-destructive/25'
                                    : 'border-input hover:border-brand/50 focus-within:border-brand focus-within:ring-brand/15',
                            )}
                        >
                            <StepButton icon={Minus} label={t('access_seats_dec')} disabled={current <= min} onClick={() => step(-1)} />
                            <input
                                id="sw-seats"
                                type="number"
                                min={min}
                                inputMode="numeric"
                                value={seats}
                                onChange={(e) => onSeatsChange(e.target.value)}
                                placeholder="0"
                                aria-labelledby="sw-seats-label"
                                aria-invalid={!!error}
                                aria-describedby={error ? 'sw-seats-error' : undefined}
                                className="placeholder:text-muted-foreground min-w-0 flex-1 [appearance:textfield] bg-transparent text-center text-sm font-semibold tabular-nums outline-hidden [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="text-muted-foreground shrink-0 text-xs">{t('access_seats_unit')}</span>
                            <StepButton icon={Plus} label={t('access_seats_inc')} onClick={() => step(1)} />
                        </div>
                        {error && (
                            <p id="sw-seats-error" className="text-destructive flex items-start gap-1.5 text-xs leading-snug">
                                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                                {error}
                            </p>
                        )}
                    </div>
                )}
            </div>
            {autoUnlimited && <p className="text-muted-foreground text-xs">{t('access_seats_auto_unlimited')}</p>}
        </div>
    );
}

function StepButton({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="bg-muted hover:bg-brand/10 text-foreground focus-visible:ring-brand/40 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-40"
        >
            <Icon className="h-3.5 w-3.5" />
        </button>
    );
}

/** Product key: label row with an on/off switch; the masked field shows when on. */
export function ProductKeySection({
    enabled,
    onEnabledChange,
    value,
    onChange,
}: {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    value: string;
    onChange: (value: string) => void;
}) {
    const t = useT();
    const [showKey, setShowKey] = useState(false);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{t('access_key_title')}</span>
                <label className="text-muted-foreground flex shrink-0 cursor-pointer items-center gap-2.5 text-[13px] font-semibold">
                    {enabled ? t('access_key_on') : t('access_key_off')}
                    <Switch checked={enabled} onChange={onEnabledChange} aria-label={t('access_store_key')} />
                </label>
            </div>
            {enabled && (
                <>
                    <div className="relative">
                        <Input
                            type={showKey ? 'text' : 'password'}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={t('access_ph_product_key')}
                            aria-label={t('access_key_title')}
                            autoComplete="off"
                            className="pr-11 tracking-wider"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey((v) => !v)}
                            aria-label={showKey ? t('access_key_hide') : t('access_key_show')}
                            className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-brand/40 absolute top-1/2 right-1.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-hidden"
                        >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Lock className="h-3 w-3 shrink-0" />
                        {t('access_key_secure')}
                    </p>
                </>
            )}
        </div>
    );
}
