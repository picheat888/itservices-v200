// "Version 2.0.0 Build <date time>" beside the © line on the login page; the build is the bundle this browser loaded.
import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { APP_BUILT_AT } from '@/shared/lib/app-build';
import { APP_VERSION } from '@/stores/ui';

export function AppVersionLine({ className }: { className?: string }) {
    const t = useT();
    const formatDate = useDateFormat();
    if (!APP_VERSION) return null;

    const text = APP_BUILT_AT
        ? t('login_version_build').replace('{version}', APP_VERSION).replace('{build}', formatDate.dateTime(APP_BUILT_AT))
        : t('login_version').replace('{version}', APP_VERSION);

    return <span className={className}>{text}</span>;
}
