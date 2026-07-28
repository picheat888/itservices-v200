import { useT } from '@/lang';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useEmployeeMutations } from '../hooks/use-org';

export function ResetPasswordModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { resetPassword } = useEmployeeMutations();
    const [newPassword, setNewPassword] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleClose = () => {
        setNewPassword(null);
        setError(null);
        setCopied(false);
        onClose();
    };

    const handleReset = async () => {
        if (!employee) return;
        setError(null);
        try {
            const result = await resetPassword.mutateAsync(employee.id);
            setNewPassword(result.new_password);
        } catch {
            setError(t('reset_password_no_account'));
        }
    };

    const handleCopy = () => {
        if (!newPassword) return;
        navigator.clipboard.writeText(newPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const empName = employee ? (lang === 'th' ? (employee.name_th ?? employee.name) : employee.name) : '';

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="text-brand h-5 w-5" />
                        {t('reset_password_title')}
                    </DialogTitle>
                    <DialogDescription>{empName}</DialogDescription>
                </DialogHeader>

                {/* Before reset: confirmation view */}
                {!newPassword && (
                    <div className="space-y-3 py-1">
                        <p className="text-muted-foreground text-sm">{t('reset_password_desc')}</p>
                        {error && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{error}</div>}
                    </div>
                )}

                {/* After reset: show new password */}
                {newPassword && (
                    <div className="space-y-3 py-1">
                        <p className="text-muted-foreground text-sm">{t('reset_password_success')}</p>
                        <div>
                            <div className="text-muted-foreground mb-1 text-xs font-medium">{t('reset_password_new')}</div>
                            <div className="border-border bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2">
                                <span className="flex-1 font-mono text-sm font-semibold tracking-wider">{newPassword}</span>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    title="Copy"
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                            {copied && <p className="text-brand mt-1 text-xs">{lang === 'th' ? 'คัดลอกแล้ว' : 'Copied!'}</p>}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    {!newPassword ? (
                        <>
                            <Button variant="ghost" onClick={handleClose}>
                                {t('cancel')}
                            </Button>
                            <Button onClick={handleReset} disabled={resetPassword.isPending}>
                                <KeyRound className="h-4 w-4" />
                                {t('reset_password')}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleClose} className="w-full">
                            {t('close')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
