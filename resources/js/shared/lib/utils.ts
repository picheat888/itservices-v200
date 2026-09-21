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

/**
 * Address syntax check for the UX pass — Laravel re-validates every submission,
 * so this only exists to fail a typo in the field the user is standing in rather
 * than on the round trip. Deliberately loose: one @, something either side, a dot
 * in the domain.
 */
export function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * A `?view=<id>` deep link turned into a record id, or null when the parameter is
 * not one.
 *
 * `Number('abc')` is NaN and NaN passes an `!= null` guard, so a mistyped link used
 * to reach the API as /<resource>/NaN and leave the detail dialog on its skeleton.
 * Anything that is not a positive integer opens no dialog at all; an id that IS
 * well-formed but has no record behind it is the dialog's own not-found state.
 */
export function toRecordId(param: string | null): number | null {
    if (param === null || param.trim() === '') {
        return null;
    }

    const id = Number(param);

    return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Hands the browser a generated file to save.
 *
 * The anchor has to be IN the document for Firefox to honour the click, and the
 * object URL has to outlive the click — revoking it on the same tick cancels the
 * download in Chrome often enough to matter. Both were wrong in the two import
 * dialogs that used to carry their own copy of this.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
