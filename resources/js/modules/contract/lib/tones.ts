// Contract type colours: the one source for the /contracts pages and the contract reports.
import type { ContractType } from '@/shared/types';

export const CONTRACT_TYPE_TONE: Record<ContractType, 'blue' | 'violet' | 'amber' | 'green' | 'gray'> = {
    software: 'blue',
    hardware: 'violet',
    service: 'amber',
    connectivity: 'green',
    other: 'gray',
};
