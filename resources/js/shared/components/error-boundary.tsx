// Catches a React render crash: reports it to logs/frontend and shows the shared error screen with the report's reference.
// The app-wide one covers the screen; the one around page content (inline) keeps the menu and clears on the next page.
import { translate } from '@/lang';
import { ErrorIcon, ErrorState } from '@/shared/components/error-state';
import { reportClientError } from '@/shared/lib/client-error-report';
import { Button } from '@/shared/ui/button';
import { useUiStore } from '@/stores/ui';
import { MonitorX } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** Show the message in the page area instead of over the whole screen. */
    inline?: boolean;
    /** A crash clears when this changes (the page address). */
    resetKey?: string;
}

interface State {
    crashed: boolean;
    reference: string | null;
}

function CrashScreen({ inline, reference }: { inline?: boolean; reference: string | null }) {
    const lang = useUiStore((s) => s.lang);

    return (
        <div
            className={
                inline ? 'grid min-h-[72dvh] place-items-center px-4' : 'bg-background fixed inset-0 z-[200] flex items-center justify-center px-6'
            }
        >
            <ErrorState
                variant="page"
                visual={<ErrorIcon icon={MonitorX} tone="danger" />}
                title={translate(lang, 'err_render_title')}
                lines={[translate(lang, 'err_render_body'), translate(lang, 'err_render_report_it')]}
                reference={reference}
                actions={
                    <Button className="w-full" onClick={() => window.location.reload()}>
                        {translate(lang, 'session_reload')}
                    </Button>
                }
            />
        </div>
    );
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { crashed: false, reference: null };

    private unmounted = false;

    private crashId = 0;

    static getDerivedStateFromError(): Partial<State> {
        return { crashed: true, reference: null };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        const crashId = ++this.crashId;
        void reportClientError('render', error, { stack: info.componentStack ?? null }).then((reference) => {
            // Only the crash still showing gets the reference
            if (reference && !this.unmounted && crashId === this.crashId && this.state.crashed) this.setState({ reference });
        });
    }

    componentDidUpdate(prevProps: Props): void {
        if (this.state.crashed && prevProps.resetKey !== this.props.resetKey) {
            this.crashId++;
            this.setState({ crashed: false, reference: null });
        }
    }

    componentWillUnmount(): void {
        this.unmounted = true;
    }

    render(): ReactNode {
        return this.state.crashed ? <CrashScreen inline={this.props.inline} reference={this.state.reference} /> : this.props.children;
    }
}
