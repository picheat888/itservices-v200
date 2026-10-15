/**
 * Contract report colours, shared by the three contract reports; type colours come from the contract module.
 */
import { CONTRACT_TYPE_TONE as MODULE_TYPE_TONE } from '@/modules/contract';
import type { ChartTone } from '../types';

export type ContractTypeKey = 'software' | 'hardware' | 'service' | 'connectivity' | 'other';

/** Display order of the types, as the /contracts type filter lists them. */
export const CONTRACT_TYPES: ContractTypeKey[] = ['software', 'hardware', 'service', 'connectivity', 'other'];

export const CONTRACT_TYPE_TONE: Record<ContractTypeKey, ChartTone> = MODULE_TYPE_TONE;

/** Where an asset on a hardware contract came from: rented (violet, as on the asset pages) or bought. */
export const CONTRACT_SOURCE_TONE: Record<'rent' | 'buy' | 'none', ChartTone> = {
    rent: 'violet',
    buy: 'orange',
    none: 'gray',
};
