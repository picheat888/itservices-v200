// Staggered row entrance shared by the Dashboard and the module Overview tabs: class "row-in" (app.css) plus this delay.

/** Animation delay for the i-th row, 40 ms apart. */
export const rowDelay = (i: number) => ({ animationDelay: `${i * 40}ms` });
