import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEmployeeMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Employee } from '@/types';
import { Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';

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

    const empName = employee ? (lang === 'th' ? employee.name_th ?? employee.name : employee.name) : '';

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-brand" />
                        {t('reset_password_title')}
                    </DialogTitle>
                    <DialogDescription>{empName}</DialogDescription>
                </DialogHeader>

                {/* Before reset: confirmation view */}
                {!newPassword && (
                    <div className="space-y-3 py-1">
                        <p className="text-sm text-muted-foreground">{t('reset_password_desc')}</p>
                        {error && (
                            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
                        )}
                    </div>
                )}

                {/* After reset: show new password */}
                {newPassword && (
                    <div className="space-y-3 py-1">
                        <p className="text-sm text-muted-foreground">{t('reset_password_success')}</p>
                        <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">{t('reset_password_new')}</div>
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                                <span className="flex-1 font-mono text-sm font-semibold tracking-wider">{newPassword}</span>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    title="Copy"
                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                            {copied && <p className="mt-1 text-xs text-brand">{lang === 'th' ? 'คัดลอกแล้ว' : 'Copied!'}</p>}
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
