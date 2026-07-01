import { useUiStore } from '@/stores/ui';
import type { Dict, Lang } from '@/lang/types';

import { common as enCommon } from '@/lang/en/common';
import { employees as enEmployees } from '@/lang/en/employees';
import { tickets as enTickets } from '@/lang/en/tickets';
import { requests as enRequests } from '@/lang/en/requests';
import { assets as enAssets } from '@/lang/en/assets';
import { contracts as enContracts } from '@/lang/en/contracts';
import { stock as enStock } from '@/lang/en/stock';
import { permissions as enPermissions } from '@/lang/en/permissions';
import { access as enAccess } from '@/lang/en/access';
import { settings as enSettings } from '@/lang/en/settings';
import { email as enEmail } from '@/lang/en/email';
import { notifications as enNotifications } from '@/lang/en/notifications';
import { auth as enAuth } from '@/lang/en/auth';
import { dashboard as enDashboard } from '@/lang/en/dashboard';

import { common as thCommon } from '@/lang/th/common';
import { employees as thEmployees } from '@/lang/th/employees';
import { tickets as thTickets } from '@/lang/th/tickets';
import { requests as thRequests } from '@/lang/th/requests';
import { assets as thAssets } from '@/lang/th/assets';
import { contracts as thContracts } from '@/lang/th/contracts';
import { stock as thStock } from '@/lang/th/stock';
import { permissions as thPermissions } from '@/lang/th/permissions';
import { access as thAccess } from '@/lang/th/access';
import { settings as thSettings } from '@/lang/th/settings';
import { email as thEmail } from '@/lang/th/email';
import { notifications as thNotifications } from '@/lang/th/notifications';
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
