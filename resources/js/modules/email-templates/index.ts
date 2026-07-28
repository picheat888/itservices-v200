export { emailTemplateApi } from './api/emailTemplateApi';
export type {
    CreateEmailTemplatePayload,
    EmailTemplate,
    EmailTemplateListResponse,
    EmailTemplatePayload,
    EmailTemplateStats,
} from './api/emailTemplateApi';
export { useEmailTemplateMutations, useEmailTemplates } from './hooks/use-email-templates';
export { default as EmailTemplatesPage } from './pages';
