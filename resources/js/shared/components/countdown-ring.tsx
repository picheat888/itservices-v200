// Progress ring with a clock label inside; fills as time passes. Decorative: the caller announces the time in words.
import { cn } from '@/shared/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface Props {
    /** 0 to 1, how much of the ring is filled. */
    progress: number;
    label: string;
    /** Text colour class for the arc and the label. */
    toneClass: string;
    icon: LucideIcon;
}

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownRing({ progress, label, toneClass, icon: Icon }: Props) {
    return (
        <div className="relative flex h-24 w-24 items-center justify-center" aria-hidden>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
                <circle
                    cx="44"
                    cy="44"
                    r={RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                    className={cn(toneClass, 'transition-[stroke-dashoffset,color] duration-1000 ease-linear motion-reduce:transition-none')}
                />
            </svg>
            <div className="z-10 flex flex-col items-center">
                <Icon className="text-muted-foreground mb-0.5 h-4 w-4" />
                <span className={cn('text-2xl leading-none font-bold tabular-nums', toneClass)}>{label}</span>
            </div>
        </div>
    );
}
