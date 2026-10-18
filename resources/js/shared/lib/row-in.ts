// Staggered row entrance shared by the Dashboard and the module Overview tabs: class "row-in" (app.css) plus this delay.

/** Animation delay for the i-th row, 40 ms apart; rows past the 8th share the last step. */
export const rowDelay = (i: number) => ({ animationDelay: `${Math.min(i, 8) * 40}ms` });
