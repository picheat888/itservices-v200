// Rounded y-axis for small count charts: a 1/2/5 step with at most four steps above zero.
// Pure (no imports) so node tests can load it.

const STEP_SHAPES = [1, 2, 5];
const MAX_STEPS = 4;

/** The axis top and its tick values from 0 up, e.g. a peak of 9 gives top 10 and ticks 0, 5, 10. */
export function countAxis(peak: number): { top: number; ticks: number[] } {
    const highest = Math.max(1, Math.ceil(peak));

    for (let magnitude = 1; ; magnitude *= 10) {
        for (const shape of STEP_SHAPES) {
            const step = shape * magnitude;
            const steps = Math.ceil(highest / step);
            if (steps <= MAX_STEPS) {
                return { top: steps * step, ticks: Array.from({ length: steps + 1 }, (_, i) => i * step) };
            }
        }
    }
}
