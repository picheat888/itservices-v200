// Form-level server error for FormErrorBanner: the message plus a key that changes on every failed submit, so it shakes each time.
import { useCallback, useState } from 'react';

export function useFormError() {
    const [message, setMessage] = useState('');
    const [shakeKey, setShakeKey] = useState(0);

    const show = useCallback((next: string) => {
        setMessage(next);
        setShakeKey((n) => n + 1);
    }, []);
    const clear = useCallback(() => setMessage(''), []);

    return { message, shakeKey, show, clear };
}
