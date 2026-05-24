import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useEmployeeMutations } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Employee } from '@/types';
import { AlertTriangle, Box, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ResignModal({ employee, onClose, onDone }: { employee: Employee | null; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { resign } = useEmployeeMutations();
    const [reason, setReason] = useState('');
    const [lastDay, setLastDay] = useState('');
    const [errors, setErrors] = useState<{ reason?: string; lastDay?: string }>({});

    useEffect(() => {
        if (employee) {
            setReason('');
            setLastDay('');
            setErrors({});
        }
    }, [employee]);

    const submit = async () => {
        const e: typeof errors = {};
        if (!lastDay) e.lastDay = t('resign_err_lastday');
        if (!reason.trim()) e.reason = t('resign_err_reason');
        setErrors(e);
        if (Object.keys(e).length) return;

        if (!employee) return;
        await resign.mutateAsync({ id: employee.id, reason, lastDay });
        onDone();
    };

    return (
        <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        {t('resign_title')}
                    </DialogTitle>
                    {employee && (
                        <DialogDescription>{lang === 'th' ? employee.name_th ?? employee.name : employee.name}</DialogDescription>
                    )}
                </DialogHeader>

                <div className="space-y-4">
                    {/* Warning banner */}
                    <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{t('resign_warn')}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('resign_last_day')} required error={errors.lastDay}>
                            <Input className="font-mono" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
                        </Field>
                        <div>
                            <div className="mb-1.5 text-sm font-medium">{t('resign_assets_to_return')}</div>
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                                <Box className="h-3.5 w-3.5" />
                                {t('coming_soon')}
                            </span>
                        </div>
                    </div>

                    <Field label={t('resign_reason')} required error={errors.reason}>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            placeholder={lang === 'th' ? 'เช่น โอนย้ายตำแหน่ง ลาออกโดยสมัครใจ ฯลฯ' : 'e.g. Voluntary resignation, role change…'}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    </Field>

                    {/* Assets list — pending the Assets module */}
                    <div>
                        <div className="mb-2 text-xs text-muted-foreground">{t('resign_assets_flagged')}</div>
                        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground">
                            <Box className="h-4 w-4" />
                            {t('coming_soon')} (Assets)
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={resign.isPending}>
                        <UserMinus className="h-4 w-4" />
                        {t('resign_submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
