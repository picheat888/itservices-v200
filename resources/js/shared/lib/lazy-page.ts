// React.lazy for a route page, plus preload() so a menu hover or tap can start the download early.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isChunkLoadError, reloadForNewBuild } from './chunk-reload';

type PageModule = { default: ComponentType };

export type LazyPage = LazyExoticComponent<ComponentType> & { preload: () => void };

export function lazyPage(load: () => Promise<PageModule>): LazyPage {
    let pending: Promise<PageModule> | null = null;
    // One download shared by preload and render; a failed one is forgotten so the next try fetches again
    const fetchPage = () =>
        (pending ??= load().catch((error: unknown) => {
            pending = null;
            throw error;
        }));

    const Page = lazy(() =>
        fetchPage().catch((error: unknown) => {
            // Old build's file gone after a deploy: reload once instead of the error screen
            if (isChunkLoadError(error) && reloadForNewBuild()) return new Promise<never>(() => {});
            throw error;
        }),
    );

    return Object.assign(Page, { preload: () => void fetchPage().catch(() => undefined) });
}
