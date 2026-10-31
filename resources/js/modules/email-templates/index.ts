import { lazyPage } from '@/shared/lib/lazy-page';
export { emailTemplateApi } from './api/emailTemplateApi';
export type { EmailTemplate, EmailTemplateListResponse, EmailTemplatePayload, EmailTemplateStats } from './api/emailTemplateApi';
export { useEmailTemplateMutations, useEmailTemplates } from './hooks/use-email-templates';
export const EmailTemplatesPage = lazyPage(() => import('./pages'));
