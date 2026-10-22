// Routes a clicked push inside the app when the service worker asks this tab, so unsaved forms are asked about first.
import { pushOpenTarget } from '@/modules/notification';
import { guardNavigation } from '@/shared/hooks/use-navigation-guard';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function serviceWorkerContainer(): ServiceWorkerContainer | null {
    try {
        return window.isSecureContext && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    } catch {
        return null;
    }
}

/** Listens for the worker's "open" message; call once inside the router. */
export function usePushOpen(): void {
    const navigate = useNavigate();
    const location = useLocation();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const locationRef = useRef(location);
    locationRef.current = location;

    useEffect(() => {
        const container = serviceWorkerContainer();
        if (!container) return;

        const onMessage = (event: MessageEvent) => {
            const target = pushOpenTarget(event.data, window.location.origin);
            if (!target) return;
            if (target.kind === 'bell') {
                const { pathname, search } = locationRef.current;
                const params = new URLSearchParams(search);
                params.set('bell', '1');
                navigateRef.current({ pathname, search: `?${params}` }, { replace: true });
                return;
            }
            guardNavigation(target.to, () => navigateRef.current(target.to));
        };
        container.addEventListener('message', onMessage);
        return () => container.removeEventListener('message', onMessage);
    }, []);
}
