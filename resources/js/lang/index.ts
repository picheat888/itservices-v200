import type { Dict, Lang } from '@/lang/types';
import { useUiStore } from '@/stores/ui';

import { access as enAccess } from '@/lang/en/access';
import { asset as enAssets } from '@/lang/en/asset';
import { auth as enAuth } from '@/lang/en/auth';
import { common as enCommon } from '@/lang/en/common';
import { contract as enContracts } from '@/lang/en/contract';
import { dashboard as enDashboard } from '@/lang/en/dashboard';
import { email as enEmail } from '@/lang/en/email';
import { employee as enEmployees } from '@/lang/en/employee';
import { notification as enNotifications } from '@/lang/en/notification';
import { permission as enPermissions } from '@/lang/en/permission';
import { requests as enRequests } from '@/lang/en/requests';
import { settings as enSettings } from '@/lang/en/settings';
import { stock as enStock } from '@/lang/en/stock';
import { ticket as enTickets } from '@/lang/en/ticket';
import { workflow as enWorkflow } from '@/lang/en/workflow';

import { access as thAccess } from '@/lang/th/access';
import { asset as thAssets } from '@/lang/th/asset';
import { auth as thAuth } from '@/lang/th/auth';
import { common as thCommon } from '@/lang/th/common';
import { contract as thContracts } from '@/lang/th/contract';
import { dashboard as thDashboard } from '@/lang/th/dashboard';
import { email as thEmail } from '@/lang/th/email';
import { employee as thEmployees } from '@/lang/th/employee';
import { notification as thNotifications } from '@/lang/th/notification';
import { permission as thPermissions } from '@/lang/th/permission';
import { requests as thRequests } from '@/lang/th/requests';
import { settings as thSettings } from '@/lang/th/settings';
import { stock as thStock } from '@/lang/th/stock';
import { ticket as thTickets } from '@/lang/th/ticket';
import { workflow as thWorkflow } from '@/lang/th/workflow';

const en: Dict = {
    ...enCommon,
    ...enEmployees,
    ...enTickets,
    ...enRequests,
    ...enWorkflow,
    ...enAssets,
    ...enContracts,
    ...enStock,
    ...enPermissions,
    ...enAccess,
    ...enSettings,
    ...enEmail,
    ...enNotifications,
    ...enAuth,
    ...enDashboard,
};
const th: Dict = {
    ...thCommon,
    ...thEmployees,
    ...thTickets,
    ...thRequests,
    ...thWorkflow,
    ...thAssets,
    ...thContracts,
    ...thStock,
    ...thPermissions,
    ...thAccess,
    ...thSettings,
    ...thEmail,
    ...thNotifications,
    ...thAuth,
    ...thDashboard,
};

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
