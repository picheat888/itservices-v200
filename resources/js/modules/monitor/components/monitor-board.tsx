// The monitor TV board: header, KPI row, rotating must-see list, team panel and the new-case popup with sound.
import { playNotificationSound } from '@/modules/notification';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMonitorT } from '../hooks/use-monitor-prefs';
import { useNow } from '../hooks/use-now';
import { togglesPause } from '../lib/monitor-mode';
import { boardChanges, newArrivals, paginateRows, popupOrder } from '../lib/monitor-rows';
import { serverNow } from '../lib/monitor-time';
import type { MonitorBoard as Board, MonitorRow } from '../types';
import { clockTime, connectionLabel } from './connection-label';
import { MonitorBrand } from './monitor-brand';
import { MonitorKpis } from './monitor-kpis';
import { MonitorMenu } from './monitor-menu';
import { MustSeeList } from './must-see-list';
import { NewCasePopup } from './new-case-popup';
import { TeamPanel } from './team-panel';

const PAGE_EVERY_MS = 15_000;
const POPUP_MS = 15_000;
const POPUP_MAX_MS = 30_000;
const NEW_TAG_MS = 60_000;
const MOTION_MS = 2_500;

interface Popup {
    rows: MonitorRow[];
    start: number;
    until: number;
    shownAt: string;
}

interface Props {
    board: Board;
    fetchedAt: number;
    failures: number;
    lastOkAt: number | null;
    soundOn: boolean;
}

export function MonitorBoard({ board, fetchedAt, failures, lastOkAt, soundOn }: Props) {
    const t = useMonitorT();
    const fmt = useDateFormat();
    const tick = useNow(1000);
    const offset = useMemo(() => Date.parse(board.server_now) - fetchedAt, [board, fetchedAt]);
    const now = serverNow(offset, tick);

    // Pages rotate every 15 s; Space pauses
    const pages = useMemo(() => paginateRows(board.rows), [board]);
    const [pageIndex, setPageIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const shownPage = pages.length === 0 ? 0 : Math.min(pageIndex, pages.length - 1);
    useEffect(() => {
        if (paused || pages.length < 2) return;
        const id = window.setInterval(() => setPageIndex((i) => (i + 1) % pages.length), PAGE_EVERY_MS);
        return () => window.clearInterval(id);
    }, [paused, pages.length]);

    // New cases since the previous board: popup, sound, "ใหม่" tag, one announcement
    const seenIds = useRef<Set<number> | null>(null);
    const newUntil = useRef(new Map<number, number>());
    // Rows to animate for a moment after the board that brought them: slide in when new, flash when just overdue
    const previousBoard = useRef<Board | null>(null);
    const [motions, setMotions] = useState(() => new Map<number, { cls: string; until: number }>());
    // Before paint, so a new row never shows once and then blinks into its slide-in
    useLayoutEffect(() => {
        const moved = boardChanges(previousBoard.current, board);
        previousBoard.current = board;
        if (moved.freshIds.length === 0 && moved.justOverdueIds.length === 0) return;
        const until = Date.now() + MOTION_MS;
        setMotions((current) => {
            const next = new Map(current);
            moved.freshIds.forEach((id) => next.set(id, { cls: 'row-in', until }));
            moved.justOverdueIds.forEach((id) => next.set(id, { cls: 'monitor-flash', until }));
            return next;
        });
    }, [board]);
    const [popup, setPopup] = useState<Popup | null>(null);
    const [announcement, setAnnouncement] = useState('');
    useEffect(() => {
        const fresh = newArrivals(seenIds.current, board);
        seenIds.current = new Set(board.rows.map((r) => r.id));
        if (fresh.length === 0) return;

        const at = Date.now();
        fresh.forEach((r) => newUntil.current.set(r.id, at + NEW_TAG_MS));
        // A burst of new cases extends the popup, but never past 30 s from when it opened
        setPopup((current) => {
            const open = current !== null && current.until > at;
            const start = open ? current.start : at;
            return {
                rows: popupOrder([...(open ? current.rows : []), ...fresh]),
                start,
                until: Math.min(at + POPUP_MS, start + POPUP_MAX_MS),
                shownAt: open ? current.shownAt : clockTime(at).slice(0, 5),
            };
        });
        setAnnouncement(
            t(fresh.length === 1 ? 'mon_announce_new_one' : 'mon_announce_new')
                .replace('{n}', String(fresh.length))
                .replace('{title}', fresh.map((r) => r.subject).join(', ')),
        );
        if (soundOn && board.sound.enabled) playNotificationSound(board.sound.key);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new board brings new cases
    }, [board]);

    const popupOpen = popup !== null && popup.until > tick;

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (togglesPause(event.key, (event.target as HTMLElement | null)?.tagName ?? '')) {
                event.preventDefault();
                setPaused((p) => !p);
            } else if (event.key === 'Escape') {
                setPopup(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const offline = connectionLabel(failures, lastOkAt, t);
    const date = fmt.date(new Date(now));

    return (
        <div className="relative flex flex-1 flex-col gap-5.5 px-10 py-8">
            <header className="flex h-16 items-center justify-between">
                <MonitorBrand sub={t('mon_subtitle')} />
                <div className="flex items-center gap-7">
                    <span role="status" className="text-[20px] text-amber-800 dark:text-amber-300">
                        {paused ? t('mon_paused') : ''}
                    </span>
                    <MonitorMenu paused={paused} onPausedChange={setPaused} />
                    <div
                        className={cn(
                            'flex items-center gap-2.5 text-[20px]',
                            offline ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground',
                        )}
                    >
                        <span
                            className={cn('size-3 rounded-full', offline ? 'bg-amber-600 dark:bg-amber-400' : 'bg-emerald-600 dark:bg-emerald-400')}
                            aria-hidden
                        />
                        {offline ?? t('mon_updated').replace('{t}', clockTime(Date.parse(board.generated_at)))}
                    </div>
                    <div className="text-right">
                        <span className="text-muted-foreground text-[20px]">{date}</span>
                        <b className="block text-[46px] leading-none">{clockTime(now).slice(0, 5)}</b>
                    </div>
                </div>
            </header>

            <MonitorKpis kpis={board.kpis} now={now} />

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_440px] gap-5">
                <MustSeeList
                    page={pages[shownPage] ?? []}
                    pageIndex={shownPage}
                    pageCount={pages.length}
                    now={now}
                    isNew={(id) => (newUntil.current.get(id) ?? 0) > tick}
                    motionFor={(id) => {
                        const motion = motions.get(id);
                        return motion && motion.until > tick ? motion.cls : undefined;
                    }}
                />
                <TeamPanel team={board.team} />
            </div>

            <div className="sr-only" aria-live="polite">
                {announcement}
            </div>

            {popupOpen && (
                <NewCasePopup
                    rows={popup.rows}
                    now={now}
                    shownAt={popup.shownAt}
                    leftRatio={(popup.until - tick) / (popup.until - popup.start)}
                    onClose={() => setPopup(null)}
                />
            )}
        </div>
    );
}
