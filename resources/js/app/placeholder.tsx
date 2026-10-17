import { useT } from '@/lang';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ titleKey }: { titleKey: string }) {
    const t = useT();

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
            <div className="border-border flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
                <Construction className="text-muted-foreground h-10 w-10" />
                <div className="mt-3 font-medium">{t('cmn_placeholder_later')}</div>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">{t('cmn_placeholder_ready')}</p>
            </div>
        </div>
    );
}
