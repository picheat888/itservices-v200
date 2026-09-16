import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emailTemplateApi, type EmailLogParams, type EmailTemplatePayload } from '../api/emailTemplateApi';

const KEY = ['email-templates'] as const;

export const useEmailTemplates = () => useQuery({ queryKey: KEY, queryFn: emailTemplateApi.list });

/**
 * The delivery log, paginated server-side — it gains a row per email and is never pruned.
 * Keeps the previous page on screen while the next one loads, so paging does not blink.
 */
/** One log entry, fetched only while its drawer is open. */
export const useEmailLog = (id: number | null) =>
    useQuery({
        queryKey: ['email-log', id],
        queryFn: () => emailTemplateApi.log(id as number),
        enabled: id != null,
    });

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
            mutationFn: (v: { id: number; draft?: EmailTemplatePayload }) => emailTemplateApi.test(v.id, v.draft),
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
