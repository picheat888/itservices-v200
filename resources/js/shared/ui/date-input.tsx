import { Calendar } from 'lucide-react';
import * as React from 'react';

import { cn, dateFieldClass } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';

/**
 * Native `<input type="date">` with the shared date chrome and a Calendar icon button.
 *
 * The native calendar-picker indicator is hidden (see `dateFieldClass`) so clicking the
 * field only focuses it — the brand focus ring latches like any other input, instead of
 * the picker opening and stealing focus on every click. The picker is opened deliberately
 * via the icon button, which calls the standard `HTMLInputElement.showPicker()`.
 */
export const DateInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    // Keep our own ref (to drive showPicker) while still honoring a forwarded ref.
    const setRefs = (el: HTMLInputElement | null) => {
        innerRef.current = el;
        if (typeof ref === 'function') {
            ref(el);
        } else if (ref) {
            (ref as React.RefObject<HTMLInputElement | null>).current = el;
        }
    };

    const openPicker = () => {
        const el = innerRef.current;
        if (!el) {
            return;
        }
        el.focus();
        el.showPicker?.();
    };

    return (
        <div className="relative">
            <Input ref={setRefs} type="date" className={cn(dateFieldClass, className)} {...props} />
            <button
                type="button"
                tabIndex={-1}
                aria-hidden
                onClick={openPicker}
                className="text-muted-foreground hover:text-brand absolute top-1/2 right-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-colors"
            >
                <Calendar className="h-4 w-4" />
            </button>
        </div>
    );
});

DateInput.displayName = 'DateInput';
