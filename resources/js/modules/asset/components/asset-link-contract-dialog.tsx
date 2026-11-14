// Link the ticked rented assets that have no contract to one open hardware contract (Inventory bulk bar).
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useHeldWhileOpen } from '@/shared/hooks/use-held-while-open';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { useSelectRefresh } from '@/shared/hooks/use-select-refresh';
import { serverMessage } from '@/shared/lib/api-errors';
import { localPair } from '@/shared/lib/local-name';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAssetContractOptions, useAssetMutations } from '../hooks/use-assets';

export function AssetLinkContractDialog({ ids, open, onClose, onDone }: { ids: number[]; open: boolean; onClose: () => void; onDone?: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const fmtN = useNumberFormat();
    const fmt = useDateFormat();
    const { linkContract } = useAssetMutations();
    const contractsQuery = useAssetContractOptions(open);
    const refreshContracts = useSelectRefresh(contractsQuery);
    const shownCount = useHeldWhileOpen(ids.length, open);

    // Only open contracts can take assets
    const contractOptions = useMemo(
        () =>
            (contractsQuery.data ?? [])
                .filter((c) => !c.closed)
                .map((c) => ({
                    value: String(c.id),
                    label: `${c.code} - ${localPair(c.vendor, c.vendor_th, lang) ?? ''}`,
                    search: `${c.code} ${c.vendor ?? ''} ${c.vendor_th ?? ''} ${c.details ?? ''}`,
                    sub: c.end_date ? t('asset_contract_ends').replace('{date}', fmt.date(c.end_date)) : undefined,
                })),
        [contractsQuery.data, lang, t, fmt],
    );

    const [contract, setContract] = useState('');
    const [err, setErr] = useState<string | undefined>();
    const formError = useFormError();
    const clearFormError = formError.clear;

    useSeedOnce(open ? 'bulk' : null, () => {
        setContract('');
        setErr(undefined);
        clearFormError();
    });

    const guardClose = useDiscardGuard(open && contract !== '');

    const submit = async () => {
        if (!contract) {
            setErr(t('asset_err_required'));
            return;
        }
        if (!ids.length) return;

        formError.clear();
        try {
            await linkContract.mutateAsync({ ids, contract_id: Number(contract) });
            (onDone ?? onClose)();
        } catch (error) {
            formError.show(serverMessage(error, t, 'asset_refusal_') ?? t('asset_link_contract_failed'));
        }
    };

    const countText = t('asset_bulk_count').replace('{count}', fmtN(shownCount));

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader icon={Link2} eyebrow={countText} title={t('asset_link_contract_title')} srDescription={countText} />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

                    <Field label={t('asset_linked_contract')} required error={err} help={t('asset_link_contract_hint')}>
                        <SearchableSelect
                            value={contract}
                            refresh={refreshContracts}
                            onChange={(v) => {
                                setContract(v);
                                setErr(undefined);
                            }}
                            options={contractOptions}
                            loading={contractsQuery.isLoading}
                            preferDown
                            placeholder={t('asset_select_lease_contract')}
                        />
                    </Field>
                    <p className="text-muted-foreground text-xs">{t('asset_rented_from_contract')}</p>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={linkContract.isPending}>
                        <Link2 className="h-4 w-4" />
                        {t('asset_link_contract')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
