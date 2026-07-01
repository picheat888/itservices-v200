export { default as EmailTemplatesPage } from './pages';
export { useEmailTemplates, useEmailTemplateMutations } from './hooks/use-email-templates';
export { emailTemplateApi } from './api/emailTemplateApi';
export type {
    EmailTemplate,
    EmailTemplateStats,
    EmailTemplateListResponse,
    EmailTemplatePayload,
    CreateEmailTemplatePayload,
} from './api/emailTemplateApi';
