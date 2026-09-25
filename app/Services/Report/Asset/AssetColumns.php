<?php

namespace App\Services\Report\Asset;

use App\Models\Asset\Asset;

/**
 * Shared "who holds it" / "which department" column resolvers used by both asset tabular
 * reports (AssetRegisterReport, WarrantyExpiringReport), so the two never drift on how a
 * holder or a department is read off an asset.
 */
trait AssetColumns
{
    /**
     * The current holder for display: the employee's name + (code) when an employee holds
     * it, else the free-text shared/common-use label on the asset, else an em dash for a
     * pooled asset with nobody holding it.
     */
    private function resolveHolder(Asset $asset): string
    {
        if ($asset->ownerEmployee) {
            return "{$asset->ownerEmployee->name} ({$asset->ownerEmployee->code})";
        }

        return $asset->owner ?: '—';
    }

    /**
     * The holder's department, localized — null when the asset has no employee holder or
     * that employee has no department assigned.
     *
     * @return array{name: string, name_th: ?string}|null
     */
    private function resolveDepartment(Asset $asset): ?array
    {
        $department = $asset->ownerEmployee?->department;

        return $department ? ['name' => $department->name, 'name_th' => $department->name_th] : null;
    }
}
