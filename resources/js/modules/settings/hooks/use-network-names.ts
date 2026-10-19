// React Query hooks for Settings → Security network names: the list and its create / update / delete writes.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type NetworkNamePayload } from '../api/settingsApi';

const NETWORK_NAMES = ['network-names'] as const;

export const useNetworkNames = () => useQuery({ queryKey: NETWORK_NAMES, queryFn: settingsApi.getNetworkNames });

export function useNetworkNameMutations() {
    const qc = useQueryClient();
    const inv = () => qc.invalidateQueries({ queryKey: NETWORK_NAMES });
    return {
        create: useMutation({ mutationFn: (p: NetworkNamePayload) => settingsApi.createNetworkName(p), onSuccess: inv }),
        update: useMutation({
            mutationFn: (v: { id: number } & NetworkNamePayload) => settingsApi.updateNetworkName(v.id, { cidr: v.cidr, name: v.name }),
            onSuccess: inv,
        }),
        remove: useMutation({ mutationFn: (id: number) => settingsApi.deleteNetworkName(id), onSuccess: inv }),
    };
}
