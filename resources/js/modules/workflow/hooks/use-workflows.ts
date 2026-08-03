import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowApi, type WorkflowUpdatePayload } from '../api/workflowApi';

/** All ten workflow definitions with their steps (admin page). */
export const useWorkflows = () =>
    useQuery({
        queryKey: ['workflows'],
        queryFn: workflowApi.list,
    });

export function useWorkflowMutations() {
    const qc = useQueryClient();
    return {
        update: useMutation({
            mutationFn: (v: { id: number; payload: WorkflowUpdatePayload }) => workflowApi.update(v.id, v.payload),
            onSuccess: () => {
                qc.invalidateQueries({ queryKey: ['workflows'] });
                // The New Request dialog previews routes from the same definitions.
                qc.invalidateQueries({ queryKey: ['request-options'] });
            },
        }),
        preview: useMutation({ mutationFn: workflowApi.preview }),
    };
}
