// Search-as-you-type and by-id lookups behind every employee picker (no screen loads the whole directory).
import { useT } from '@/lang';
import { normalizeSearch, useDebouncedSearch } from '@/shared/hooks/use-debounced-search';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { employeeApi, type EmployeeOptionsParams } from '../api/employeeApi';
import { EMP_OPTIONS } from './query-keys';

type SearchFilters = Pick<EmployeeOptionsParams, 'exclude' | 'status' | 'match' | 'limit'>;

const sortedIds = (ids: readonly (number | null | undefined)[]): number[] =>
    [...new Set(ids.filter((id): id is number => id != null))].sort((a, b) => a - b);

/** One page of matches for the typed text (debounced); keeps the previous page on screen while the next loads. */
export function useEmployeeSearch(term: string, options: SearchFilters & { enabled?: boolean } = {}) {
    const { enabled = true, exclude, ...filters } = options;
    const search = useDebouncedSearch(term);
    const excludeIds = exclude ? sortedIds(exclude) : undefined;
    const query = useQuery({
        queryKey: [...EMP_OPTIONS, 'search', search, excludeIds ?? null, filters],
        queryFn: () => employeeApi.options({ search, exclude: excludeIds, ...filters }),
        enabled,
        placeholderData: (prev) => prev,
        staleTime: 30_000,
    });
    // True while the typed text has not reached the server yet or its answer is in flight.
    const pending = normalizeSearch(term) !== search || query.isFetching;
    return { ...query, pending };
}

/** Exactly these people (for showing current selections and member rows); a stale list stays until the next arrives. */
export function useEmployeesByIds(ids: readonly (number | null | undefined)[]) {
    const list = sortedIds(ids);
    return useQuery({
        queryKey: [...EMP_OPTIONS, 'ids', list],
        queryFn: () => employeeApi.options({ ids: list }),
        enabled: list.length > 0,
        placeholderData: (prev) => prev,
    });
}

/** Wires a SearchableSelect: spread `pickerProps` on it and build its options from `employees`. */
export function useEmployeePicker(filters: SearchFilters = {}) {
    const t = useT();
    const [term, setTerm] = useState('');
    const [open, setOpen] = useState(false);
    const { data, pending } = useEmployeeSearch(term, { ...filters, enabled: open });
    const searchPlaceholder = t(
        filters.match === 'position' ? 'emp_search_by_position' : filters.match === 'none' ? 'emp_search_by_name' : 'emp_search_by_department',
    );
    const pickerProps = useMemo(
        () => ({ onSearch: setTerm, onOpenChange: setOpen, loading: pending, searchPlaceholder }),
        [pending, searchPlaceholder],
    );
    return { employees: data ?? [], pickerProps };
}
