// A fixed 1920×1080 dark stage scaled to fit the window, so the TV layout is the same on any screen.
import { useUiStore } from '@/stores/ui';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';

const STAGE_W = 1920;
const STAGE_H = 1080;

function fitScale(): number {
    return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
}

export function MonitorStage({ children }: { children: ReactNode }) {
    const [scale, setScale] = useState(fitScale);
    const setForceDark = useUiStore((s) => s.setForceDark);

    useLayoutEffect(() => {
        setForceDark(true);
        return () => setForceDark(false);
    }, [setForceDark]);

    useEffect(() => {
        const onResize = () => setScale(fitScale());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    return (
        <div className="bg-background text-foreground fixed inset-0 overflow-hidden">
            <div
                className="absolute top-1/2 left-1/2 flex h-[1080px] w-[1920px] origin-center flex-col tabular-nums"
                style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
            >
                {children}
            </div>
        </div>
    );
}
