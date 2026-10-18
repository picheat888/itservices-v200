<?php

// Who a Role Group write adds and removes: a full employee_ids list, or add_ids / remove_ids applied to the current members.
// No membership key at all leaves the members as they are.

namespace App\Services\Permission;

final class GroupMembershipChange
{
    /**
     * @param  list<int>  $current  members before the write
     * @param  list<int>  $next  members after the write
     * @param  list<int>  $added
     * @param  list<int>  $removed
     */
    private function __construct(
        public readonly array $current,
        public readonly array $next,
        public readonly array $added,
        public readonly array $removed,
    ) {}

    /**
     * @param  array<string, mixed>  $data  validated request data
     * @param  array<int|string>  $current  the group's members now, read under the group's row lock
     */
    public static function from(array $data, array $current): self
    {
        $current = self::ids($current);
        $next = self::nextMembers($data, $current);

        return new self(
            $current,
            $next,
            array_values(array_diff($next, $current)),
            array_values(array_diff($current, $next)),
        );
    }

    /**
     * Employees whose membership the write changes.
     *
     * @return list<int>
     */
    public function changed(): array
    {
        return [...$this->added, ...$this->removed];
    }

    /**
     * Every employee the write touches: the members after it and the ones it removes.
     *
     * @return list<int>
     */
    public function touched(): array
    {
        return array_values(array_unique([...$this->next, ...$this->removed]));
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  list<int>  $current
     * @return list<int>
     */
    private static function nextMembers(array $data, array $current): array
    {
        if (array_key_exists('employee_ids', $data)) {
            return self::ids($data['employee_ids']);
        }

        $added = self::ids($data['add_ids'] ?? []);
        $removed = self::ids($data['remove_ids'] ?? []);

        return array_values(array_diff(array_unique([...$current, ...$added]), $removed));
    }

    /**
     * @param  array<int|string>  $ids
     * @return list<int>
     */
    private static function ids(array $ids): array
    {
        return array_values(array_unique(array_map('intval', $ids)));
    }
}
