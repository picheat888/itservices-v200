// Settings → System "About this system": release, build time and the PHP, Laravel and database versions, read only.
import { useT } from '@/lang';
import { LoadFailed } from '@/shared/components/load-failed';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { FRESH_VIEW } from '@/shared/lib/freshness';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { settingsApi } from '../api/settingsApi';

const SYSTEM_INFO_KEY = ['settings', 'system-info'] as const;
const ROW_COUNT = 5;

export function AboutSystemSection() {
    const t = useT();
    const formatDate = useDateFormat();
    const { data, isLoading, isError, refetch } = useQuery({ queryKey: SYSTEM_INFO_KEY, queryFn: settingsApi.getSystemInfo, ...FRESH_VIEW });
    const [copied, setCopied] = useState(false);
    // No clipboard on a plain-http address: hide the button rather than let it do nothing
    const canCopy = typeof navigator.clipboard?.writeText === 'function';

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    const rows: [string, string][] = data
        ? [
              [t('set_about_version'), data.version],
              [t('set_about_build'), data.built_at ? formatDate.dateTime(data.built_at) : '—'],
              [t('set_about_php'), data.php],
              [t('set_about_laravel'), data.laravel],
              [t('set_about_database'), data.database],
          ]
        : [];

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(rows.map(([label, value]) => `${label} ${value}`).join('\n'));
        } catch {
            return;
        }
        setCopied(true);
    };

    return (
        <section>
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold">{t('set_about')}</h2>
                    <p className="text-muted-foreground text-sm">{t('set_about_desc')}</p>
                </div>
                {canCopy && (
                    <Button variant="outline" size="sm" onClick={copy} disabled={!data} className="shrink-0">
                        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                        {copied ? t('set_about_copied') : t('set_about_copy')}
                    </Button>
                )}
            </div>

            {isError ? (
                <div className="border-border flex justify-center rounded-md border px-4 py-6">
                    <LoadFailed onRetry={() => void refetch()} />
                </div>
            ) : (
                <dl className="border-border divide-border grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] divide-y rounded-md border text-sm">
                    {isLoading
                        ? Array.from({ length: ROW_COUNT }).map((_, i) => (
                              <div key={i} className="col-span-2 grid grid-cols-subgrid px-4 py-3" aria-hidden="true">
                                  <Skeleton className="h-4 w-20" />
                                  <Skeleton className="h-4 w-32" />
                              </div>
                          ))
                        : rows.map(([label, value], i) => (
                              <div key={label} className="col-span-2 grid grid-cols-subgrid px-4 py-2.5">
                                  <dt className="text-muted-foreground">{label}</dt>
                                  <dd className={i === 0 ? 'font-semibold' : undefined}>{value}</dd>
                              </div>
                          ))}
                </dl>
            )}
        </section>
    );
}
