import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailTemplateApi, type EmailLogParams, type EmailTemplatePayload } from '../api/emailTemplateApi';

const KEY = ['email-templates'] as const;

export const useEmailTemplates = () => useQuery({ queryKey: KEY, queryFn: emailTemplateApi.list });

/**
 * The delivery log, paginated server-side — it gains a row per email and is never pruned.
 * Keeps the previous page on screen while the next one loads, so paging does not blink.
 */
export const useEmailLogs = (params: EmailLogParams, enabled: boolean) =>
    useQuery({
        queryKey: ['email-logs', params],
        queryFn: () => emailTemplateApi.logs(params),
        enabled,
        placeholderData: keepPreviousData,
    });

export function useEmailTemplateMutations() {
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: KEY });
    return {
        update: useMutation({
            mutationFn: (v: { id: number; payload: EmailTemplatePayload }) => emailTemplateApi.update(v.id, v.payload),
            onSuccess: invalidate,
        }),
        test: useMutation({
            mutationFn: (id: number) => emailTemplateApi.test(id),
            onSuccess: invalidate,
        }),
        reset: useMutation({
            mutationFn: (id: number) => emailTemplateApi.reset(id),
            onSuccess: invalidate,
        }),
        resetAll: useMutation({
            mutationFn: () => emailTemplateApi.resetAll(),
            onSuccess: invalidate,
        }),
    };
}
