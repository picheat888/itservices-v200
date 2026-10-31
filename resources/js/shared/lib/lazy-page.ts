// React.lazy for a route page, plus preload() so a menu hover or tap can start the download early.
import { createElement, lazy, type ComponentType } from 'react';
import { trackPageLoad } from './chunk-reload';

type PageModule = { default: ComponentType };

export type LazyPage = ComponentType & { preload: () => void };

export function lazyPage(load: () => Promise<PageModule>): LazyPage {
    let pending: Promise<PageModule | undefined> | null = null;
    // One download shared by preload and render; a failed or empty one is forgotten so the next try fetches again
    const fetchPage = () =>
        (pending ??= load().then(
            (module: PageModule | undefined) => {
                if (!module) pending = null;
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

    const Page = () => createElement(current);
    return Object.assign(Page, { preload: () => void fetchPage().catch(() => undefined) });
}
