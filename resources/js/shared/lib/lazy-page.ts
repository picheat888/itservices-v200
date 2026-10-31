// React.lazy for a route page, plus preload() so a menu hover or tap can start the download early.
import { createElement, lazy, useState, type ComponentType } from 'react';
import { trackPageLoad } from './chunk-reload';

type PageModule = { default: ComponentType };

export type LazyPage = ComponentType & { preload: () => void };

export function lazyPage(load: () => Promise<PageModule>): LazyPage {
    let loaded: ComponentType | null = null;
    let pending: Promise<PageModule | undefined> | null = null;
    // One download shared by preload and render; a failed or empty one is forgotten so the next try fetches again
    const fetchPage = () =>
        (pending ??= load().then(
            (module: PageModule | undefined) => {
                if (module) loaded = module.default;
                else pending = null;
                return module;
            },
            (error: unknown) => {
                pending = null;
                throw error;
            },
        ));

    // A fresh lazy after a failure, because React.lazy keeps a rejected load for good
    const makeLazy = () =>
        lazy(() =>
            trackPageLoad(fetchPage()).then(
                // Empty = the build-file handler is already reloading the page
                (module) => module ?? new Promise<never>(() => {}),
                (error: unknown) => {
                    current = makeLazy();
                    throw error;
                },
            ),
        );
    let current = makeLazy();

    const Page = () => {
        // Already downloaded: render it straight, skipping the Suspense round trip and React's 300ms fallback hold
        const [Component] = useState<ComponentType>(() => loaded ?? current);
        return createElement(Component);
    };
    return Object.assign(Page, { preload: () => void fetchPage().catch(() => undefined) });
}
