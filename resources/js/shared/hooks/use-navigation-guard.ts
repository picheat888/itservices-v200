// Asks before in-app links, Back/Forward and guardNavigation() calls drop unsaved changes (BrowserRouter has no useBlocker).
// A page or form registers with useNavigationGuard(isDirty, watchParams); the newest one asks. AppShell mounts useNavigationGuardHost() once.
import { useT } from '@/lang';
import { discardConfirmOptions } from '@/shared/lib/discard-confirm';
import { isGuardedMove, isPlainLinkClick } from '@/shared/lib/navigation-guard';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';

type NavigationGuard = { watch: readonly string[]; ask: () => Promise<boolean> };

// A stack: a dirty dialog form over a dirty page asks for itself, and the page's guard is back once the form goes
const useNavigationGuardStore = create<{ guards: NavigationGuard[] }>(() => ({ guards: [] }));
const activeGuard = (): NavigationGuard | null => useNavigationGuardStore.getState().guards.at(-1) ?? null;

// The app's own step back (closing a dialog the reader already agreed to drop, or after a save) passes once
let passOwnPop = false;
export function passNextBack(): void {
    passOwnPop = true;
    window.setTimeout(() => (passOwnPop = false), 1000);
}

let asking = false;

/** Runs `ask` once at a time; a second move while the prompt is open is dropped. */
async function askOnce(guard: NavigationGuard, onDiscard: () => void) {
    if (asking) return;
    asking = true;
    let discard = false;
    try {
        discard = await guard.ask();
    } catch {
        discard = false;
    } finally {
        asking = false;
    }
    if (discard) onDiscard();
}

/** While `active`, leaving the page (or changing one of `watchParams`) asks with the discard words first. */
export function useNavigationGuard(active: boolean, watchParams: readonly string[] = []) {
    const confirm = useConfirm();
    const t = useT();
    const askRef = useRef(() => confirm(discardConfirmOptions(t)));
    askRef.current = () => confirm(discardConfirmOptions(t));
    const watchKey = watchParams.join('&');

    useEffect(() => {
        if (!active) return;
        const guard: NavigationGuard = { watch: watchKey === '' ? [] : watchKey.split('&'), ask: () => askRef.current() };
        useNavigationGuardStore.setState((s) => ({ guards: [...s.guards, guard] }));
        return () => useNavigationGuardStore.setState((s) => ({ guards: s.guards.filter((g) => g !== guard) }));
    }, [active, watchKey]);
}

/** For code that navigates itself (a bell item): `go` runs now, or after the reader agrees to discard. */
export function guardNavigation(to: string, go: () => void) {
    const guard = activeGuard();
    if (!guard || !isGuardedMove(new URL(window.location.href), new URL(to, window.location.href), guard.watch)) {
        go();
        return;
    }
    void askOnce(guard, go);
}

/** Intercepts link clicks and Back/Forward while a guard is registered. Mount once, inside the router. */
export function useNavigationGuardHost() {
    const location = useLocation();
    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const settled = useRef<{ href: string; state: unknown } | null>(null);

    // Where the router last settled, so a refused Back can put it back
    useEffect(() => {
        settled.current = { href: window.location.href, state: window.history.state };
    }, [location]);

    useEffect(() => {
        let replaying = false;
        let passNextPop = false;

        const onClick = (event: MouseEvent) => {
            const guard = activeGuard();
            if (!guard || replaying) return;
            const anchor = (event.target as Element | null)?.closest?.('a[href]');
            if (!(anchor instanceof HTMLAnchorElement) || !isPlainLinkClick(event, anchor)) return;
            const to = new URL(anchor.href);
            if (!isGuardedMove(new URL(window.location.href), to, guard.watch)) return;

            // Stopped at window capture, so the router link never sees this click
            event.preventDefault();
            event.stopPropagation();
            void askOnce(guard, () => {
                if (anchor.isConnected) {
                    replaying = true;
                    anchor.click();
                    replaying = false;
                } else {
                    navigateRef.current(to.pathname + to.search + to.hash);
                }
            });
        };

        const onPopState = (event: PopStateEvent) => {
            if (passNextPop || passOwnPop) {
                passNextPop = false;
                passOwnPop = false;
                return;
            }
            const guard = activeGuard();
            const from = settled.current;
            if (!guard || !from || !isGuardedMove(new URL(from.href), new URL(window.location.href), guard.watch)) return;

            // The browser has already moved: keep the router out of it and put the page's entry back
            event.stopImmediatePropagation();
            window.history.pushState(from.state, '', from.href);
            void askOnce(guard, () => {
                passNextPop = true;
                window.history.back();
            });
        };

        window.addEventListener('click', onClick, true);
        window.addEventListener('popstate', onPopState, true);
        return () => {
            window.removeEventListener('click', onClick, true);
            window.removeEventListener('popstate', onPopState, true);
        };
    }, []);
}
