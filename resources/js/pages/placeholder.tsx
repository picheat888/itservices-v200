import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ titleKey }: { titleKey: string }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
                <Construction className="h-10 w-10 text-muted-foreground" />
                <div className="mt-3 font-medium">{lang === 'th' ? 'โมดูลนี้จะพัฒนาในเฟสถัดไป' : 'This module ships in a later phase'}</div>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    {lang === 'th'
                        ? 'รากฐานของระบบ (โครง ธีม ภาษา สิทธิ์ตาม role) พร้อมแล้ว'
                        : 'The foundation (shell, theme, i18n, role-aware access) is ready.'}
                </p>
            </div>
        </div>
    );
}
