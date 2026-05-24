import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { departmentApi } from '@/services/orgApi';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Department } from '@/types';
import { useQuery } from '@tanstack/react-query';

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function DepartmentMembersDrawer({ department, onClose }: { department: Department | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const { data: members = [], isLoading } = useQuery({
        queryKey: ['departments', department?.id, 'members'],
        queryFn: () => departmentApi.members(department!.id),
        enabled: !!department,
    });

    return (
        <Sheet open={!!department} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="w-[420px] sm:max-w-[420px]">
                <SheetHeader>
                    <SheetTitle>{department ? (lang === 'th' ? department.name_th ?? department.name : department.name) : ''}</SheetTitle>
                    <SheetDescription>
                        {department?.location} · {members.length} {t('dept_members')}
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-2">
                    {isLoading && <div className="text-sm text-muted-foreground">…</div>}
                    {!isLoading && members.length === 0 && (
                        <div className="rounded-lg bg-muted/50 py-8 text-center text-sm text-muted-foreground">{t('dept_no_members')}</div>
                    )}
                    {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                            <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-brand/10 text-xs font-semibold text-brand">{initials(m.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{lang === 'th' ? m.name_th ?? m.name : m.name}</div>
                                <div className="truncate text-xs text-muted-foreground">{m.position}</div>
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
