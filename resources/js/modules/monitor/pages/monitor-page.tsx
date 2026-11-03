// /monitor: a signed-in user with tickets.view_all or a paired TV sees the board; any other browser shows a pairing code.
import { useAuth } from '@/modules/auth';
import { unlockSoundOnFirstGesture } from '@/modules/notification';
import { useDocumentTitle } from '@/shared/hooks/use-document-title';
import { useEffect, useState } from 'react';
import { MonitorBoard } from '../components/monitor-board';
import { MonitorStage } from '../components/monitor-stage';
import { PairingScreen } from '../components/pairing-screen';
import { StartScreen } from '../components/start-screen';
import { readMonitorToken, useMonitorBoard, usePairingCode, usePairingPoll, writeMonitorToken } from '../hooks/use-monitor';
import { useNow } from '../hooks/use-now';

export default function MonitorPage() {
    useDocumentTitle('mon_title');
    const { isLoading, isAuthenticated, can } = useAuth();
    const [token, setToken] = useState<string | null>(readMonitorToken);
    const [wasUnpaired, setWasUnpaired] = useState(false);
    const [justPaired, setJustPaired] = useState(false);
    const [started, setStarted] = useState(false);
    const [soundOn, setSoundOn] = useState(false);

    useEffect(() => unlockSoundOnFirstGesture(), []);

    const viaSession = isAuthenticated && can('tickets.view_all');
    const showsBoard = token !== null || viaSession;
    const board = useMonitorBoard(token, showsBoard && !(isLoading && token === null));

    // The server forgot this TV: drop the token and go back to the code screen
    useEffect(() => {
        if (board.unpaired && token !== null) {
            writeMonitorToken(null);
            setToken(null);
            setStarted(false);
            setWasUnpaired(true);
        }
    }, [board.unpaired, token]);

    const pairingMode = !showsBoard && !isLoading;
    const code = usePairingCode(pairingMode);
    const poll = usePairingPoll(pairingMode ? (code.data?.pairing_id ?? null) : null);
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

    return (
        <MonitorStage>
            {pairingMode && <PairingScreen pairing={code.data} now={now} unpaired={wasUnpaired} failed={code.isError} />}
            {showsBoard && !started && (
                <StartScreen
                    justPaired={justPaired}
                    onStart={(withSound) => {
                        setSoundOn(withSound);
                        setStarted(true);
                    }}
                />
            )}
            {showsBoard && started && board.data && (
                <MonitorBoard
                    board={board.data}
                    fetchedAt={board.dataUpdatedAt}
                    failures={board.failures}
                    lastOkAt={board.lastOkAt}
                    soundOn={soundOn}
                    onToggleSound={() => setSoundOn((on) => !on)}
                />
            )}
        </MonitorStage>
    );
}
