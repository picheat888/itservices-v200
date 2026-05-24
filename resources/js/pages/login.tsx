import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useLogin } from '@/hooks/use-auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';

export default function LoginPage() {
    const t = useT();
    useDocumentTitle('login_title');
    const brandName = useUiStore((s) => s.brandName);
    const brandSub = useUiStore((s) => s.brandSub);
    const logoUrl = useUiStore((s) => s.logoUrl);
    const { isAuthenticated, isLoading } = useAuth();
    const login = useLogin();
    const [loginId, setLoginId] = useState('super@inaba.co.th');
    const [password, setPassword] = useState('password');

    if (!isLoading && isAuthenticated) return <Navigate to="/" replace />;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        login.mutate({ login: loginId, password });
    };

    const demoAccounts = [
        { role: 'Super Admin', user: 'super' },
        { role: 'IT Technician', user: 'it' },
        { role: 'HR Officer', user: 'hr' },
        { role: 'Employee', user: 'user' },
    ];

    return (
        <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
                <div className="mb-6 flex items-center gap-3">
                    {logoUrl ? (
                        <img src={logoUrl} alt={brandName} className="h-11 w-11 rounded-xl object-contain" />
                    ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-foreground">
                            {brandName.slice(0, 2).toUpperCase()}
                        </div>
                    )}
                    <div>
                        <div className="text-base font-bold">{brandName}</div>
                        <div className="text-xs text-muted-foreground">{brandSub}</div>
                    </div>
                </div>

                <h1 className="text-xl font-bold">{t('login_title')}</h1>
                <p className="mb-6 mt-1 text-sm text-muted-foreground">{t('login_sub')}</p>

                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="login">{t('login_field')}</Label>
                        <Input id="login" value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus placeholder={t('login_field')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="password">{t('login_password')}</Label>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>

                    {login.isError && <p className="text-sm text-destructive">{t('login_error')}</p>}

                    <Button type="submit" className="w-full" disabled={login.isPending}>
                        {login.isPending ? '…' : t('login_submit')}
                    </Button>
                </form>

                <div className="mt-6 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                    <div className="mb-2 font-medium text-foreground">Demo accounts · password: password</div>
                    <div className="space-y-1">
                        {demoAccounts.map((a) => (
                            <button
                                key={a.user}
                                type="button"
                                onClick={() => {
                                    setLoginId(a.user);
                                    setPassword('password');
                                }}
                                className="flex w-full items-center justify-between rounded px-1.5 py-1 hover:bg-accent"
                            >
                                <span>{a.role}</span>
                                <span className="font-mono text-foreground">{a.user}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
