import { lazyPage } from '@/shared/lib/lazy-page';
export { contractApi } from './api/contractApi';
export type { ContractPageMeta, ContractPageResponse, ContractPayload } from './api/contractApi';
export { useContract, useContractMutations, useContracts, useContractSummary } from './hooks/use-contracts';
export { CONTRACT_TYPE_TONE } from './lib/tones';
export const ContractsPage = lazyPage(() => import('./pages'));
