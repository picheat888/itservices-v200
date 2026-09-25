<?php

namespace App\Services\Report\Tabular;

use App\Models\Employee\Department;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;

/**
 * Option lists shared by tabular report filters (master data + day windows), so every
 * report offers the same departments / categories / vendors in the same order.
 */
final class Options
{
    /**
     * @param  list<int>  $days
     * @return list<array{value: int, label_key: string}>
     */
    public static function dayWindows(array $days = [30, 60, 90, 180]): array
    {
        return array_map(fn (int $d) => ['value' => $d, 'label_key' => "rep_opt_{$d}d"], $days);
    }

    /**
     * @return list<array{value: int, label: string, label_th: ?string}>
     */
    public static function departments(): array
    {
        return Department::query()->orderBy('name')->get(['id', 'name', 'name_th'])
            ->map(fn (Department $d) => ['value' => $d->id, 'label' => $d->name, 'label_th' => $d->name_th])->all();
    }

    /**
     * @return list<array{value: int, label: string, label_th: ?string}>
     */
    public static function categories(): array
    {
        return Category::query()->orderBy('name')->get(['id', 'name', 'name_th'])
            ->map(fn (Category $c) => ['value' => $c->id, 'label' => $c->name, 'label_th' => $c->name_th])->all();
    }

    /**
     * @return list<array{value: int, label: string, label_th: ?string}>
     */
    public static function vendors(): array
    {
        return Vendor::query()->orderBy('name')->get(['id', 'name', 'name_th'])
            ->map(fn (Vendor $v) => ['value' => $v->id, 'label' => $v->name, 'label_th' => $v->name_th])->all();
    }

    /**
     * @param  array<string, string>  $labelKeys  value → i18n key
     * @return list<array{value: string, label_key: string}>
     */
    public static function fromLabels(array $labelKeys): array
    {
        return array_map(fn (string $value) => ['value' => $value, 'label_key' => $labelKeys[$value]], array_keys($labelKeys));
    }
}
