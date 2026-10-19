// Grid lens on the login brand panel: under a mouse the lines swell a few pixels and the nearest cells brighten along their bent edges.
// Draws over the panel's still CSS grid only for a fine pointer without reduced motion; colours come from the panel's --grid / --tile.
import { useEffect, useRef } from 'react';

const SPACE = 72;
const RADIUS = 150;
const BEND = 7;
const STEP = 12;

export function LoginGridLens({ dark }: { dark: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const panel = canvas?.parentElement;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !panel || !ctx) return;
        const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!fine || reduced) return;

        let width = 0;
        let height = 0;
        let x = 0;
        let y = 0;
        let targetX = 0;
        let targetY = 0;
        let energy = 0;
        let hovered = false;
        let frame = 0;
        // Read at paint time: the theme class can land after this effect runs
        const colour = (name: string) => getComputedStyle(panel).getPropertyValue(name).trim();

        const bend = (px: number, py: number): [number, number] => {
            if (energy < 0.005) return [px, py];
            const dx = px - x;
            const dy = py - y;
            const d = Math.hypot(dx, dy);
            if (d >= RADIUS || d < 0.001) return [px, py];
            const falloff = 1 - (d / RADIUS) ** 2;
            const push = BEND * energy * falloff * falloff;
            return [px + (dx / d) * push, py + (dy / d) * push];
        };

        // One cell traced along its bent edges, so its fill swells with the lines around it
        const cellPath = (cx: number, cy: number) => {
            ctx.beginPath();
            for (let i = 0; i <= SPACE; i += STEP) {
                const [px, py] = bend(cx + i, cy);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            for (let i = STEP; i <= SPACE; i += STEP) ctx.lineTo(...bend(cx + SPACE, cy + i));
            for (let i = SPACE - STEP; i >= 0; i -= STEP) ctx.lineTo(...bend(cx + i, cy + SPACE));
            for (let i = SPACE - STEP; i > 0; i -= STEP) ctx.lineTo(...bend(cx, cy + i));
            ctx.closePath();
        };

        const paint = () => {
            if (!width || !height) return;
            ctx.clearRect(0, 0, width, height);
            if (energy > 0.01) {
                ctx.save();
                ctx.fillStyle = colour('--tile');
                const first = (v: number) => Math.floor((v - RADIUS) / SPACE) * SPACE;
                for (let cx = first(x); cx <= x + RADIUS; cx += SPACE) {
                    for (let cy = first(y); cy <= y + RADIUS; cy += SPACE) {
                        const d = Math.hypot(cx + SPACE / 2 - x, cy + SPACE / 2 - y);
                        if (d >= RADIUS) continue;
                        ctx.globalAlpha = 0.5 * energy * (1 - d / RADIUS) ** 2;
                        cellPath(cx, cy);
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
            ctx.strokeStyle = colour('--grid');
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let gx = 0; gx <= width + SPACE; gx += SPACE) {
                for (let gy = 0; gy <= height + STEP; gy += STEP) {
                    const [px, py] = bend(gx, gy);
                    if (gy === 0) ctx.moveTo(px + 0.5, py);
                    else ctx.lineTo(px + 0.5, py);
                }
            }
            for (let gy = 0; gy <= height + SPACE; gy += SPACE) {
                for (let gx = 0; gx <= width + STEP; gx += STEP) {
                    const [px, py] = bend(gx, gy);
                    if (gx === 0) ctx.moveTo(px, py + 0.5);
                    else ctx.lineTo(px, py + 0.5);
                }
            }
            ctx.stroke();
        };

        const tick = () => {
            frame = 0;
            const lastX = x;
            const lastY = y;
            const lastEnergy = energy;
            x += (targetX - x) * 0.16;
            y += (targetY - y) * 0.16;
            energy += ((hovered ? 1 : 0) - energy) * 0.13;
            if (energy < 0.003 && !hovered) energy = 0;
            paint();
            if (Math.abs(x - lastX) > 0.08 || Math.abs(y - lastY) > 0.08 || Math.abs(energy - lastEnergy) > 0.003) queue();
        };
        const queue = () => {
            if (!frame) frame = requestAnimationFrame(tick);
        };

        const resize = () => {
            width = panel.clientWidth;
            height = panel.clientHeight;
            if (!width || !height) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            paint();
        };

        const move = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
            const rect = panel.getBoundingClientRect();
            targetX = event.clientX - rect.left;
            targetY = event.clientY - rect.top;
            if (!hovered && energy < 0.01) {
                x = targetX;
                y = targetY;
            }
            hovered = true;
            queue();
        };
        const release = () => {
            if (!hovered) return;
            hovered = false;
            queue();
        };

        const observer = new ResizeObserver(resize);
        observer.observe(panel);
        panel.addEventListener('pointermove', move, { passive: true });
        panel.addEventListener('pointerleave', release);
        window.addEventListener('blur', release);
        panel.dataset.lens = 'on';

        return () => {
            observer.disconnect();
            panel.removeEventListener('pointermove', move);
            panel.removeEventListener('pointerleave', release);
            window.removeEventListener('blur', release);
            cancelAnimationFrame(frame);
            delete panel.dataset.lens;
        };
    }, [dark]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 group-data-[lens=on]/panel:opacity-100"
        />
    );
}
