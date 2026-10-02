<?php

namespace App\Services\Report\Asset;

use App\Models\Asset\Asset;

/**
 * Shared "who holds it" / "which department" column resolvers and asset status wording used
 * by the asset tabular reports (AssetRegisterReport, WarrantyExpiringReport) and the
 * employee "leaver assets" report, so none of them drift on how an asset reads.
 */
trait AssetColumns
{
    private const STATUS_KEYS = [
        'ready' => 'asset_ready', 'pending_acceptance' => 'asset_pending_accept', 'deployed' => 'asset_deployed',
        'common' => 'asset_common', 'pending_return' => 'asset_pending_return', 'writeoff' => 'asset_writeoff',
    ];

    // Thai export labels mirror resources/js/lang/th/asset.ts (same asset_* keys) so the
    // Excel/PDF export never disagrees with the on-screen wording.
    private const STATUS_TH = [
        'ready' => 'พร้อมส่งมอบ', 'pending_acceptance' => 'รอรับมอบ', 'deployed' => 'ใช้งานอยู่',
        'common' => 'ส่วนกลาง', 'pending_return' => 'รอรับคืน', 'writeoff' => 'ตัดจำหน่าย',
    ];

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
