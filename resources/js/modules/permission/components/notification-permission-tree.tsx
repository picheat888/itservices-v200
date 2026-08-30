import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// The module's only real key. Everything the page does — both tabs and the delivery log —
// is gated by this one permission, on the route, the sidebar entry and every endpoint.
const MASTER = 'system.configure_notifications';

/**
 * What the one switch actually opens.
 *
 * These are NOT permissions and carry no toggle. The card used to list four —
 * email.edit / enable / create / test — as locked "coming soon" rows, which was wrong twice
 * over: those capabilities shipped long ago, and none of them was ever a key in
 * App\Support\Permissions, so the switches could not have been saved even if the feature had
 * been missing. Naming the surfaces instead answers the question an administrator actually
 * has in front of this card — "what am I handing over?" — without inventing rights to grant.
 */
const OPENS: { en: string; th: string }[] = [
    { en: 'Email templates — wording, on/off, test sends', th: 'เทมเพลตอีเมล — ข้อความ เปิด/ปิด ส่งทดสอบ' },
    { en: 'In-app notifications — wording in both languages, on/off', th: 'การแจ้งเตือนในระบบ — ข้อความสองภาษา เปิด/ปิด' },
    { en: 'Delivery log — every send, and why one was skipped', th: 'ประวัติการส่ง — ทุกฉบับ และเหตุที่ข้ามไป' },
];

/** A single toggle, matching the matrix switch (h-5 w-9). */
function Switch({ on, locked, onClick }: { on: boolean; locked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={locked}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-brand' : 'bg-muted')}
        >
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="text-brand h-2.5 w-2.5" />}
                {locked && !on && <Lock className="text-muted-foreground h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

/**
 * The Email & Notification permission card: one master switch, and a plain statement of what
 * it covers.
 *
 * Every other module card is a tree because every other module has capabilities that can be
 * granted apart from each other. This one has exactly one key, so a tree would be a shape
 * with nothing in it. It keeps the same header, master band and layout as its neighbours —
 * the card should look like it belongs on the page, without pretending to offer choices the
 * system does not have.
 */
export function NotificationPermissionTree({
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const on = isSuper || draft.has(MASTER);
    const masterInfo = actionDescription('system', 'configure_notifications', lang);

    const toggle = () => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(MASTER)) {
                next.delete(MASTER);
            } else {
                next.add(MASTER);
            }

            return next;
        });
    };

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="email_templates" on={on ? 1 : 0} total={1} lang={lang} />

            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="flex items-center gap-1 text-sm font-semibold">
                        {actionLabel('system', 'configure_notifications', lang)}
                        {masterInfo && <InfoHint text={masterInfo} />}
                    </div>
                    <div className="text-muted-foreground text-[10.5px]">
                        {lang === 'th' ? 'ตัวหลัก · คุมทั้งหน้าและไอคอนใน sidebar' : 'Master · gates the whole page and the sidebar icon'}
                    </div>
                </div>
                <div className="ml-auto">
                    <Switch on={on} locked={isSuper} onClick={toggle} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity', !on && 'opacity-40')}>
                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="flex items-center gap-1 text-sm font-medium">
                            {lang === 'th' ? 'สิ่งที่เปิดให้' : 'What this opens'}
                            <InfoHint
                                text={
                                    lang === 'th'
                                        ? 'ทั้งหน้าอยู่หลังสวิตช์เดียว - ไม่มีสิทธิ์ย่อยให้แยกให้ทีละส่วน'
                                        : 'The whole page sits behind this one switch - there are no finer rights to hand out separately.'
                                }
                            />
                        </span>
                    </div>
                    <div className="border-border ml-2 space-y-0.5 border-l pb-1.5 pl-3">
                        {OPENS.map((item) => (
                            <div key={item.en} className="text-muted-foreground min-h-[26px] text-[12.5px] leading-relaxed">
                                {lang === 'th' ? item.th : item.en}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
