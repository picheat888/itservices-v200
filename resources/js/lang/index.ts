import { useUiStore } from '@/stores/ui';
import type { Dict, Lang } from '@/lang/types';

import { common as enCommon } from '@/lang/en/common';
import { employee as enEmployees } from '@/lang/en/employee';
import { ticket as enTickets } from '@/lang/en/ticket';
import { requests as enRequests } from '@/lang/en/requests';
import { asset as enAssets } from '@/lang/en/asset';
import { contract as enContracts } from '@/lang/en/contract';
import { stock as enStock } from '@/lang/en/stock';
import { permission as enPermissions } from '@/lang/en/permission';
import { access as enAccess } from '@/lang/en/access';
import { settings as enSettings } from '@/lang/en/settings';
import { email as enEmail } from '@/lang/en/email';
import { notification as enNotifications } from '@/lang/en/notification';
import { auth as enAuth } from '@/lang/en/auth';
import { dashboard as enDashboard } from '@/lang/en/dashboard';

import { common as thCommon } from '@/lang/th/common';
import { employee as thEmployees } from '@/lang/th/employee';
import { ticket as thTickets } from '@/lang/th/ticket';
import { requests as thRequests } from '@/lang/th/requests';
import { asset as thAssets } from '@/lang/th/asset';
import { contract as thContracts } from '@/lang/th/contract';
import { stock as thStock } from '@/lang/th/stock';
import { permission as thPermissions } from '@/lang/th/permission';
import { access as thAccess } from '@/lang/th/access';
import { settings as thSettings } from '@/lang/th/settings';
import { email as thEmail } from '@/lang/th/email';
import { notification as thNotifications } from '@/lang/th/notification';
import { auth as thAuth } from '@/lang/th/auth';
import { dashboard as thDashboard } from '@/lang/th/dashboard';

const en: Dict = { ...enCommon, ...enEmployees, ...enTickets, ...enRequests, ...enAssets, ...enContracts, ...enStock, ...enPermissions, ...enAccess, ...enSettings, ...enEmail, ...enNotifications, ...enAuth, ...enDashboard };
const th: Dict = { ...thCommon, ...thEmployees, ...thTickets, ...thRequests, ...thAssets, ...thContracts, ...thStock, ...thPermissions, ...thAccess, ...thSettings, ...thEmail, ...thNotifications, ...thAuth, ...thDashboard };

export const dictionaries: Record<Lang, Dict> = { en, th };

/**
 * Translate a key for the given language. Falls back to the key itself if not found.
 */
export function translate(lang: Lang, key: string): string {
    return dictionaries[lang][key] ?? key;
}

/**
 * React hook — returns a translator function bound to the current UI language.
 */
export function useT() {
    const lang = useUiStore((s) => s.lang);
    return (key: string) => translate(lang, key);
}
