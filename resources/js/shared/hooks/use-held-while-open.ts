// The value a dialog showed while open, kept through its exit animation (a cleared selection must not read "0 selected").
import { createHold } from '@/shared/lib/held-while-open';
import { useState } from 'react';

export function useHeldWhileOpen<T>(value: T, open: boolean): T {
    const [hold] = useState(() => createHold(value));
    return hold(value, open);
}
