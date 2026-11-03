// /monitor: only a paired device sees the board; every other browser, signed in or not, shows a pairing code.
import { unlockSoundOnFirstGesture } from '@/modules/notification';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useEffect, useState } from 'react';
import { MonitorBoard } from '../components/monitor-board';
import { MonitorStage } from '../components/monitor-stage';
import { PairingScreen } from '../components/pairing-screen';
import { StartScreen } from '../components/start-screen';
import { readMonitorToken, useMonitorBoard, usePairingCode, usePairingPoll, writeMonitorToken } from '../hooks/use-monitor';
import { useMonitorPrefs, useMonitorT } from '../hooks/use-monitor-prefs';
import { useNow } from '../hooks/use-now';
import { codeLeftMs, monitorMode } from '../lib/monitor-mode';

export default function MonitorPage() {
    useDocumentTitle('mon_tab_title');
    const t = useMonitorT();
    const [token, setToken] = useState<string | null>(readMonitorToken);
    const [wasUnpaired, setWasUnpaired] = useState(false);
    const [justPaired, setJustPaired] = useState(false);
    const [started, setStarted] = useState(false);
    const soundOn = useMonitorPrefs((s) => s.sound);
    const setPrefs = useMonitorPrefs((s) => s.set);

    useEffect(() => unlockSoundOnFirstGesture(), []);

    const mode = monitorMode(token);
    const board = useMonitorBoard(token);

    // The server forgot this device: drop the token and go back to the code screen
    useEffect(() => {
        if (!board.unpaired || token === null) return;
        writeMonitorToken(null);
        setToken(null);
        setStarted(false);
        setWasUnpaired(true);
    }, [board.unpaired, token]);

    const code = usePairingCode(mode === 'pairing');
    const poll = usePairingPoll(mode === 'pairing' ? (code.data?.pairing_id ?? null) : null);
    useEffect(() => {
        if (poll.data?.status === 'paired') {
            writeMonitorToken(poll.data.device_token);
            setToken(poll.data.device_token);
            setWasUnpaired(false);
            setJustPaired(true);
        } else if (poll.data?.status === 'expired') {
            void code.refetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the poll answer only
    }, [poll.data]);

    const now = useNow(1000);
    const codeLeft = code.data ? codeLeftMs(code.dataUpdatedAt, code.data.expires_in, now) : 0;

    return (
        <MonitorStage>
            {mode === 'pairing' && <PairingScreen pairing={code.data} leftMs={codeLeft} unpaired={wasUnpaired} failed={code.isError} />}
            {mode === 'board' && !started && (
                <StartScreen
                    justPaired={justPaired}
                    onStart={(withSound) => {
                        setPrefs({ sound: withSound });
                        setStarted(true);
                    }}
                />
            )}
            {mode === 'board' && started && board.data && (
                <MonitorBoard
                    board={board.data}
                    fetchedAt={board.dataUpdatedAt}
                    failures={board.failures}
                    lastOkAt={board.lastOkAt}
                    soundOn={soundOn}
                />
            )}
            {mode === 'board' && started && !board.data && (
                <div className="text-muted-foreground flex flex-1 items-center justify-center text-[32px]" role="status">
                    {board.isError ? t('mon_connect_retry') : t('mon_connecting')}
                </div>
            )}
        </MonitorStage>
    );
}
