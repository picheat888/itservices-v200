import { useT } from '@/lang';
import { PhotoCropDialog } from '@/modules/employee';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useFormRebase } from '@/shared/hooks/use-form-rebase';
import { useSeedOnce } from '@/shared/hooks/use-seed-once';
import { useSelectRefresh } from '@/shared/hooks/use-select-refresh';
import { hasFieldError, serverMessage } from '@/shared/lib/api-errors';
import type { AssetModel, Brand } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Boxes } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAssetModelMutations, useBrands } from '../hooks/use-master-data';
import { ModelPhotoPicker } from './model-photo-picker';

// "No brand" is a real option in the list, so it has its own value
const NO_BRAND = '__none__';

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// The picked file may be a phone photo; the crop shrinks it to an 800px webp before it is sent
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** ModelModal — add or edit an asset model with an optional brand and photo; Save shows a spinner, then a tick, then the dialog closes. */
export function ModelModal({ open, model, onClose }: { open: boolean; model?: AssetModel | null; onClose: () => void }) {
    const t = useT();
    // The header keeps the record being edited while the dialog closes
    const [shown, setShown] = useState(model ?? null);
    useEffect(() => {
        if (open) setShown(model ?? null);
    }, [open, model]);
    const view = open ? (model ?? null) : shown;
    const confirmEdit = useConfirmEdit();
    const { create, update } = useAssetModelMutations();
    const brandsQuery = useBrands();
    const refreshBrands = useSelectRefresh(brandsQuery);
    const brands = useMemo(() => brandsQuery.data ?? [], [brandsQuery.data]);
    // Fields in one state, so a refresh of the row rebases them together
    const [form, setForm] = useState({ name: '', brandId: NO_BRAND });
    const { name, brandId } = form;
    const setName = (next: string) => setForm((f) => ({ ...f, name: next }));
    const setBrandId = (next: string) => setForm((f) => ({ ...f, brandId: next }));
    // What the form opened with, moved along by refreshes of the row
    const [base, setBase] = useState({ name: '', brandId: NO_BRAND });
    const [nameError, setNameError] = useState<string | undefined>();
    // Photo: a newly cropped file, or a request to drop the saved one
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [photoError, setPhotoError] = useState<string | undefined>();
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    const toValues = (m?: AssetModel | null) => ({ name: m?.name ?? '', brandId: m?.brand_id ? String(m.brand_id) : NO_BRAND });
    useSeedOnce(open ? (model?.id ?? 'new') : null, () => {
        const values = toValues(model);
        setForm(values);
        setBase(values);
        setNameError(undefined);
        setPhotoFile(null);
        setRemovePhoto(false);
        setPhotoError(undefined);
        setSaved(false);
        clearFormError();
    });
    useFormRebase({ fresh: open && model ? toValues(model) : null, base, setBase, setForm });

    // Preview: the new file first, then the saved photo unless it is being removed
    const filePreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
    useEffect(
        () => () => {
            if (filePreview) URL.revokeObjectURL(filePreview);
        },
        [filePreview],
    );
    const preview = filePreview ?? (removePhoto ? null : (view?.photo_url ?? null));

    /** Check a picked file, then open the crop dialog on it. */
    const pickPhoto = (file?: File) => {
        setPhotoError(undefined);
        if (!file) return;
        if (!PHOTO_TYPES.includes(file.type)) {
            setPhotoError(t('md_photo_err_type'));
            return;
        }
        if (file.size > PHOTO_MAX_BYTES) {
            setPhotoError(t('md_photo_err_size'));
            return;
        }
        setCropSrc(URL.createObjectURL(file));
    };

    const dropPhoto = () => {
        setPhotoFile(null);
        setPhotoError(undefined);
        setRemovePhoto(!!model?.photo_url);
    };

    const closeCrop = () => {
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);
    };

    // Dirty = differs from the values the dialog was seeded with (create = blank), or the photo changed.
    const isDirty = !saved && (name !== base.name || brandId !== base.brandId || photoFile !== null || removePhoto);
    const guardClose = useDiscardGuard(open && isDirty);

    const submit = async () => {
        if (saving || saved) {
            return;
        }
        if (!name.trim()) {
            setNameError(t('set_err_required'));
            nameRef.current?.focus();
            return;
        }
        setNameError(undefined);
        if (model && isDirty && !(await confirmEdit({ name: model.name, sub: model.brand?.name }))) return;
        const payload = {
            name: name.trim(),
            brand_id: brandId === NO_BRAND ? null : Number(brandId),
            ...(photoFile ? { photo: photoFile } : removePhoto ? { remove_photo: true } : {}),
        };
        formError.clear();
        try {
            if (model) {
                await update.mutateAsync({ id: model.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setSaved(true);
            closeAfterSave();
        } catch (err) {
            if (hasFieldError(err, 'name')) {
                setNameError(t('md_name_taken'));
                nameRef.current?.focus();
            } else if (hasFieldError(err, 'photo')) {
                setPhotoError(t('md_photo_err_type'));
            } else {
                formError.show(serverMessage(err) ?? t('cd_error'));
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Boxes}
                    eyebrow={t('set_master_data')}
                    title={view ? t('md_edit_model') : t('md_add_model')}
                    code={view?.name}
                    srDescription={t('md_modal_desc')}
                />
                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-5">
                        <Field label={t('md_photo')} error={photoError}>
                            {(control) => (
                                <ModelPhotoPicker
                                    preview={preview}
                                    inputId={control.id}
                                    invalid={!!photoError}
                                    onPick={pickPhoto}
                                    onRemove={dropPhoto}
                                />
                            )}
                        </Field>
                        <div className="min-w-0 space-y-6">
                            <Field label={t('md_brand')} controlId="model-brand">
                                <SearchableSelect
                                    id="model-brand"
                                    value={brandId}
                                    onChange={(value) => {
                                        setBrandId(value);
                                        setNameError(undefined);
                                    }}
                                    refresh={refreshBrands}
                                    flagRemoved
                                    options={[
                                        { value: NO_BRAND, label: t('md_no_brand'), search: t('md_no_brand') },
                                        ...brands.map((b: Brand) => ({ value: String(b.id), label: b.name, search: b.name })),
                                    ]}
                                />
                            </Field>
                            <Field label={t('md_model_name')} required error={nameError}>
                                <Input
                                    ref={nameRef}
                                    autoComplete="off"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        setNameError(undefined);
                                    }}
                                    autoFocus
                                    maxLength={120}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                            submit();
                                        }
                                    }}
                                />
                            </Field>
                            <p className="text-muted-foreground text-xs">{t('md_photo_shared_hint')}</p>
                        </div>
                    </div>
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} />
                </DialogFooterBar>
            </FormDialogContent>

            {/* Photo crop — square, opens on the whole picture */}
            <PhotoCropDialog
                imageSrc={cropSrc}
                variant="product"
                eyebrow={t('set_master_data')}
                onConfirm={(cropped) => {
                    setPhotoFile(cropped);
                    setRemovePhoto(false);
                    closeCrop();
                }}
                onCancel={closeCrop}
            />
        </Dialog>
    );
}
