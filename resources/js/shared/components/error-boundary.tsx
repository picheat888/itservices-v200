// Catches a React render crash: reports it to logs/frontend and shows a reload message instead of a blank page.
// The app-wide one covers the screen; the one around page content (inline) keeps the menu and clears on the next page.
import { translate } from '@/lang';
import { reportClientError } from '@/shared/lib/client-error-report';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useUiStore } from '@/stores/ui';
import { MonitorX, RotateCw } from 'lucide-react';
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
}

function CrashScreen({ inline }: { inline?: boolean }) {
    const lang = useUiStore((s) => s.lang);

    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-5 px-6 text-center',
                inline ? 'min-h-[72dvh]' : 'bg-background fixed inset-0 z-[200]',
            )}
        >
            <span className="bg-destructive/10 text-destructive flex h-16 w-16 items-center justify-center rounded-2xl">
                <MonitorX className="h-8 w-8" />
            </span>
            <div className="space-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight">{translate(lang, 'err_render_title')}</h1>
                <p className="text-muted-foreground max-w-md text-sm">{translate(lang, 'err_render_body')}</p>
            </div>
            <Button onClick={() => window.location.reload()}>
                <RotateCw className="h-4 w-4" />
                {translate(lang, 'session_reload')}
            </Button>
        </div>
    );
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { crashed: false };

    static getDerivedStateFromError(): State {
        return { crashed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        reportClientError('render', error, { stack: info.componentStack ?? null });
    }

    componentDidUpdate(prevProps: Props): void {
        if (this.state.crashed && prevProps.resetKey !== this.props.resetKey) this.setState({ crashed: false });
    }

    render(): ReactNode {
        return this.state.crashed ? <CrashScreen inline={this.props.inline} /> : this.props.children;
    }
}
