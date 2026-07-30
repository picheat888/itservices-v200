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
 * Chrome for a `<input type="date">` paired with an overlaid <Calendar> icon button:
 * a right-padded, mono-digit field with the brand focus latch and the native
 * calendar-picker indicator hidden. The indicator is intentionally NOT stretched to
 * cover the field — a full-cover indicator opens the native picker on every click and
 * the picker steals focus, so the ring never latched. With it hidden, clicking the
 * field just focuses it (ring shows); the picker is opened via the icon button's
 * `showPicker()` in <DateInput>.
 */
export const dateFieldClass = `pr-9 font-mono ${datePickerFocusClass} [&::-webkit-calendar-picker-indicator]:hidden`;

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
