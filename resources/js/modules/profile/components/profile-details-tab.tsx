// Details tab of the My Profile drawer: HR-set facts as text and the fields the user edits themselves.
import { useT } from '@/lang';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import type { Employee } from '@/shared/types';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';

export type ProfileFormKey = 'firstName' | 'lastName' | 'firstNameTh' | 'lastNameTh' | 'phone';

export function ProfileDetailsTab({
    fields,
    errors,
    canEdit,
    emp,
    empLoading,
    formError,
    formErrorCount,
    onEdit,
}: {
    fields: Record<ProfileFormKey, string>;
    errors: Partial<Record<ProfileFormKey, string>>;
    canEdit: boolean;
    emp: Employee | undefined;
    empLoading: boolean;
    formError: string;
    formErrorCount: number;
    onEdit: (key: ProfileFormKey) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
    const t = useT();
    const fmt = useDateFormat();

    const textField = (key: ProfileFormKey, label: string, props: React.ComponentProps<typeof Input> = {}) => (
        <Field label={label} name={key} error={errors[key]} required={key === 'firstName' || key === 'lastName'}>
            <Input value={fields[key]} onChange={onEdit(key)} disabled={!canEdit} {...props} />
        </Field>
    );

    // Set by HR, so shown as text rather than an input
    const readFact = (label: string, value: string | null | undefined) => (
        <div className="min-w-0 space-y-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            {empLoading && !value ? <Skeleton className="mt-1 h-3.5 w-24" /> : <dd className="truncate text-sm font-medium">{value || '—'}</dd>}
        </div>
    );

    return (
        <div className="space-y-5">
            <FormErrorBanner message={formError} shakeKey={formErrorCount} />
            <dl className="grid grid-cols-2 gap-3">
                {readFact(t('emp_employee_id'), emp?.code)}
                {readFact(t('joined'), emp?.joined_at ? fmt.date(emp.joined_at) : null)}
            </dl>
            <div className="grid grid-cols-2 gap-3">
                {textField('firstName', t('emp_first_name'), { autoComplete: 'given-name' })}
                {textField('lastName', t('emp_last_name'), { autoComplete: 'family-name' })}
                {textField('firstNameTh', t('emp_first_name_th'), { autoComplete: 'off' })}
                {textField('lastNameTh', t('emp_last_name_th'), { autoComplete: 'off' })}
                {textField('phone', t('emp_phone'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
            </div>
        </div>
    );
}
