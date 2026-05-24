import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import type { Role } from '@/types';

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const { user } = useAuth();
    if (!user) return null;
    const role = user.role as Role;

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
                <SheetHeader>
                    <SheetTitle>{t('profile')}</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-6 px-1">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
                            <AvatarFallback className="bg-brand/10 text-lg font-semibold text-brand">{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-lg font-bold">{user.name}</div>
                            <div className="text-sm text-muted-foreground">{t(`role_${role}` as const)}</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>{t('login_email')}</Label>
                            <Input className="font-mono" defaultValue={user.email} disabled />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('profile')}</Label>
                            <Input defaultValue={user.name} disabled />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-border pt-4">
                        <Button variant="outline" onClick={onClose}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={onClose}>{t('save')}</Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
