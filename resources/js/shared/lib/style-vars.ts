// Sets CSS custom properties through a ref, so computed sizes and positions reach Tailwind classes like `h-(--plot-h)` without a style prop.

export type StyleVars = Record<`--${string}`, string>;

export function styleVars(vars: StyleVars): (el: HTMLElement | null) => void {
    return (el) => {
        if (!el) return;
        for (const [name, value] of Object.entries(vars)) {
            el.style.setProperty(name, value);
        }
    };
}
