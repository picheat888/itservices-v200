import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useEmployeeMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Employee } from '@/types';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Dialog for a permitted user (employees.set_credentials) to provision a
 * login account — username + password — for an employee who has none yet.
 */
export function SetCredentialsModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { setCredentials } = useEmployeeMutations();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');

    // Reset the form whenever a different employee is opened.
    useEffect(() => {
        setUsername('');
        setPassword('');
        setConfirm('');
        setError('');
    }, [employee?.id]);

    const handleSubmit = async () => {
        if (!employee) return;
        setError('');
        if (!username.trim()) { setError(t('cred_err_username_required')); return; }
        if (password.length < 6) { setError(t('cred_err_password_short')); return; }
        if (password !== confirm) { setError(t('cred_err_no_match')); return; }
        try {
            await setCredentials.mutateAsync({ id: employee.id, username: username.trim(), password, password_confirmation: confirm });
            onClose();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(msg ?? t('cred_err_generic'));
        }
    };

    const empName = employee ? (lang === 'th' ? employee.name_th ?? employee.name : employee.name) : '';

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-brand" />
                        {t('cred_set_title')}
                    </DialogTitle>
                    <DialogDescription>
                        {empName}
                        {employee?.code ? ` (${employee.code})` : ''}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 py-1">
                    <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t('cred_username')}
                        autoComplete="off"
                    />
                    <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('cred_password')}
                        autoComplete="new-password"
                    />
                    <Input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={t('cred_confirm_password')}
                        autoComplete="new-password"
                    />
                    {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={setCredentials.isPending}>
                        <ShieldCheck className="h-4 w-4" />
                        {setCredentials.isPending ? t('cred_saving') : t('cred_save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
