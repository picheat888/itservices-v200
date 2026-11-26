// Step 4 of the asset import dialog (rented only): leave the new assets waiting for a contract, or link them all to an open one.
// Two real radios in a fieldset; the contract picker shows only while linking.
import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import type { SelectRefresh } from '@/shared/hooks/use-select-refresh';

interface Props {
    count: number;
    linkContract: boolean;
    contractId: number | null;
    /** Open contracts only. */
    options: SearchOption[];
    loading: boolean;
    refresh: SelectRefresh;
    onChange: (linkContract: boolean, contractId: number | null) => void;
}

const CARD =
    'border-border hover:border-brand/50 has-[:checked]:border-brand has-[:focus-visible]:ring-ring group relative flex min-h-16 cursor-pointer gap-4 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2';

// Words of one choice and its ring, filled when the radio before it is checked
function CardWords({ title, desc }: { title: string; desc: string }) {
    return (
        <>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="text-muted-foreground mt-0.5 block text-sm leading-relaxed">{desc}</span>
            </span>
            <span
                aria-hidden="true"
                className="border-input group-has-[:checked]:border-brand mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2"
            >
                <span className="bg-brand h-2.5 w-2.5 scale-0 rounded-full transition-transform group-has-[:checked]:scale-100 motion-reduce:transition-none" />
            </span>
        </>
    );
}

export function ImportContractStep({ count, linkContract, contractId, options, loading, refresh, onChange }: Props) {
    const t = useT();
    const fmtN = useNumberFormat();

    return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
            <div>
                <h3 tabIndex={-1} className="text-lg font-bold tracking-tight text-balance">
                    {t('asset_import_contract_heading').replace('{count}', fmtN(count))}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-sm">{t('asset_import_contract_sub')}</p>
            </div>

            <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">{t('asset_import_step_contract')}</legend>
                {/* Not yet */}
                <label className={CARD}>
                    <input
                        type="radio"
                        name="asset-import-contract"
                        checked={!linkContract}
                        onChange={() => onChange(false, null)}
                        className="sr-only"
                    />
                    <CardWords title={t('asset_import_contract_later')} desc={t('asset_import_contract_later_desc')} />
                </label>
                {/* Link to a contract */}
                <label className={CARD}>
                    <input
                        type="radio"
                        name="asset-import-contract"
                        checked={linkContract}
                        onChange={() => onChange(true, contractId)}
                        className="sr-only"
                    />
                    <CardWords title={t('asset_import_contract_link')} desc={t('asset_import_contract_link_desc')} />
                </label>
            </fieldset>

            {/* Contract picker */}
            {linkContract && (
                <Field label={t('asset_import_contract_field')} required help={t('asset_import_contract_hint')}>
                    <SearchableSelect
                        value={contractId === null ? '' : String(contractId)}
                        onChange={(next) => onChange(true, next === '' ? null : Number(next))}
                        options={options}
                        loading={loading}
                        refresh={refresh}
                        preferDown
                        placeholder={t('asset_select_lease_contract')}
                    />
                </Field>
            )}
        </div>
    );
}
