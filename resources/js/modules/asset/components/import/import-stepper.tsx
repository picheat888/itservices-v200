// Stepper of the asset import dialog: finished steps go back with a click, the next ones wait, the current one is marked.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Check } from 'lucide-react';
import type { StepId } from '../../lib/import-wizard';

export function ImportStepper({ steps, current, locked, onGo }: { steps: StepId[]; current: StepId; locked: boolean; onGo: (step: StepId) => void }) {
    const t = useT();
    const at = steps.indexOf(current);

    return (
        <nav aria-label={t('asset_import_title')} className="border-border/60 flex items-start border-b px-6 pb-4">
            <ol className="flex w-full items-start">
                {steps.map((step, i) => {
                    const active = i === at;
                    const done = i < at;
                    const label = t(`asset_import_step_${step}`);
                    const mark = (
                        <>
                            <span
                                className={cn(
                                    'bg-background z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-xs font-bold tabular-nums transition-colors',
                                    active && 'border-brand bg-brand text-brand-foreground',
                                    done && 'border-brand/40 bg-brand/10 text-brand',
                                    !active && !done && 'border-input text-muted-foreground',
                                )}
                            >
                                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                            </span>
                            <span
                                className={cn(
                                    'text-xs leading-tight font-semibold transition-colors',
                                    active ? 'text-brand' : done ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            >
                                {label}
                            </span>
                        </>
                    );
                    return (
                        <li
                            key={step}
                            aria-current={active ? 'step' : undefined}
                            className="relative flex min-w-0 flex-1 flex-col items-center text-center"
                        >
                            {/* Line to the next step */}
                            {i < steps.length - 1 && (
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'absolute top-[13px] right-[calc(-50%+17px)] left-[calc(50%+17px)] h-0.5 rounded-full',
                                        done ? 'bg-brand' : 'bg-border',
                                    )}
                                />
                            )}
                            {done ? (
                                <button
                                    type="button"
                                    disabled={locked}
                                    onClick={() => onGo(step)}
                                    className="hover:bg-accent focus-visible:ring-ring flex min-h-8 flex-col items-center gap-2 rounded-md px-1 focus-visible:ring-2 focus-visible:outline-hidden disabled:pointer-events-none"
                                >
                                    {mark}
                                </button>
                            ) : (
                                <span className="flex flex-col items-center gap-2">{mark}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
