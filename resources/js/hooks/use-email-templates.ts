import {
    emailTemplateApi,
    type CreateEmailTemplatePayload,
    type EmailTemplatePayload,
} from '@/services/emailTemplateApi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const KEY = ['email-templates'] as const;

export const useEmailTemplates = () => useQuery({ queryKey: KEY, queryFn: emailTemplateApi.list });

export function useEmailTemplateMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
    return {
        update: useMutation({
            mutationFn: (v: { id: number; payload: EmailTemplatePayload }) => emailTemplateApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        create: useMutation({
            mutationFn: (payload: CreateEmailTemplatePayload) => emailTemplateApi.create(payload),
            onSuccess: invalidate,
        }),
        test: useMutation({
            mutationFn: (id: number) => emailTemplateApi.test(id),
            onSuccess: invalidate,
        }),
    };
}
