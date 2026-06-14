import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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
