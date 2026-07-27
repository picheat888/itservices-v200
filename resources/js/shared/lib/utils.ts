import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Brand focus ring for native date/time `<input>`s. Uses `:focus` (not `focus-visible`)
 * on purpose: the browser's focus-visible heuristic covers typed text fields but not
 * date/time controls, so without this the brand ring never shows when the field is
 * clicked or its picker is open. Layered on top of the shared <Input> focus-visible ring.
 */
export const datePickerFocusClass = 'focus:border-brand focus:ring-[3px] focus:ring-brand/15 focus:outline-hidden';

/**
 * Full chrome for a `<input type="date">` paired with an overlaid <Calendar> icon:
 * a right-padded, mono-digit field whose native calendar-picker indicator is stretched
 * to cover the whole control and made invisible (so a click anywhere opens the picker),
 * plus the brand focus latch above.
 */
export const dateFieldClass = `pr-9 font-mono ${datePickerFocusClass} [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`;

/**
 * Scroll the first errored field into view and focus its control. Pass the validation
 * `errors` object; fields must be wrapped in <Field name="<key>"> (renders data-field).
 */
export function focusFirstError(errors: Record<string, string>) {
    const firstKey = Object.keys(errors)[0];
    if (!firstKey) return;
    // Defer so the error UI has rendered; query the just-opened/portaled dialog.
    setTimeout(() => {
        const field = document.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
        if (!field) return;
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field.querySelector<HTMLElement>('input, textarea, button, [tabindex]')?.focus();
    }, 0);
}
