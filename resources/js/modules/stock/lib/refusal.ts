/**
 * The sentence for a stock action the server refused — a movement, a request's approve /
 * reject / fulfil, a count's save / commit / cancel, or an item delete.
 *
 * The server answers with a short reason and the figures it quotes (App\Support\Refusal):
 * `{ message: 'not_enough_stock', available: 3 }`. The words live in the `stock_refusal_<reason>`
 * lang keys, so both languages read them the same way; a reason with no sentence yet falls
 * back to `stock_refusal_forbidden` / `_invalid` / `_failed`.
 */
import { refusalText } from '@/shared/lib/api-errors';

export function stockRefusalText(error: unknown, t: (key: string) => string): string {
    return refusalText(error, t, 'stock_refusal_', (name, value) =>
        // A request's status is quoted by its key ('approved'); show the label the list shows.
        name === 'expected' || name === 'current' ? t(`stock_rq_${String(value)}`) : String(value ?? ''),
    );
}
