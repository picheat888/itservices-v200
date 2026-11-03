// The monitor TV board: header, KPI row, rotating must-see list, team panel and the new-case popup with sound.
import { useT } from '@/lang';
import { playNotificationSound } from '@/modules/notification';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNow } from '../hooks/use-now';
import { newArrivals, paginateRows, popupOrder } from '../lib/monitor-rows';
import { serverNow } from '../lib/monitor-time';
import type { MonitorBoard as Board, MonitorRow } from '../types';
import { clockTime, connectionLabel } from './connection-label';
import { MonitorBrand } from './monitor-brand';
import { MonitorKpis } from './monitor-kpis';
import { MustSeeList } from './must-see-list';
import { NewCasePopup } from './new-case-popup';
import { TeamPanel } from './team-panel';

const PAGE_EVERY_MS = 15_000;
const POPUP_MS = 15_000;
const NEW_TAG_MS = 60_000;

interface Popup {
    rows: MonitorRow[];
    until: number;
    shownAt: string;
}

interface Props {
    board: Board;
    fetchedAt: number;
    failures: number;
    lastOkAt: number | null;
    soundOn: boolean;
    onToggleSound: () => void;
}

export function MonitorBoard({ board, fetchedAt, failures, lastOkAt, soundOn, onToggleSound }: Props) {
    const t = useT();
    const fmt = useDateFormat();
    const tick = useNow(1000);
    const offset = useMemo(() => Date.parse(board.generated_at) - fetchedAt, [board, fetchedAt]);
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
    const [popup, setPopup] = useState<Popup | null>(null);
    const [announcement, setAnnouncement] = useState('');
    useEffect(() => {
        const fresh = newArrivals(seenIds.current, board);
        seenIds.current = new Set(board.rows.map((r) => r.id));
        if (fresh.length === 0) return;

        const at = Date.now();
        fresh.forEach((r) => newUntil.current.set(r.id, at + NEW_TAG_MS));
        setPopup((current) => ({
            rows: popupOrder([...(current && current.until > at ? current.rows : []), ...fresh]),
            until: at + POPUP_MS,
            shownAt: clockTime(at).slice(0, 5),
        }));
        setAnnouncement(
            t('mon_announce_new')
                .replace('{n}', String(fresh.length))
                .replace('{title}', fresh.map((r) => r.subject).join(', ')),
        );
        if (soundOn && board.sound.enabled) playNotificationSound(board.sound.key);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new board brings new cases
    }, [board]);

    const popupOpen = popup !== null && popup.until > tick;

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === ' ' || event.code === 'Space') {
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
                    {paused && <span className="text-[20px] text-amber-300">{t('mon_paused')}</span>}
                    <button
                        type="button"
                        onClick={onToggleSound}
                        className={cn(
                            'flex h-12 items-center gap-2.5 rounded-xl border-2 px-4.5 text-[20px] font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white',
                            soundOn ? 'text-muted-foreground border-border' : 'border-blue-400 text-blue-300',
                        )}
                    >
                        {soundOn ? <Volume2 className="size-6" aria-hidden /> : <VolumeX className="size-6" aria-hidden />}
                        {soundOn ? t('mon_sound_on') : t('mon_sound_off')}
                    </button>
                    <div className={cn('flex items-center gap-2.5 text-[20px]', offline ? 'text-amber-300' : 'text-muted-foreground')}>
                        <span className={cn('size-3 rounded-full', offline ? 'bg-amber-400' : 'bg-emerald-400')} aria-hidden />
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
                />
                <TeamPanel team={board.team} />
            </div>

            <div className="sr-only" aria-live="polite">
                {announcement}
            </div>

            {popupOpen && <NewCasePopup rows={popup.rows} now={now} shownAt={popup.shownAt} leftRatio={(popup.until - tick) / POPUP_MS} />}
        </div>
    );
}
