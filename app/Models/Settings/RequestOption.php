<?php

namespace App\Models\Settings;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * One selectable choice of a request-form list (Settings → Master data →
 * Request data). Which lists are editable is declared by `managed` on the
 * field in App\Support\RequestSchemas.
 *
 * A submitted request stores this row's id in its `fields` json, so the labels
 * stay freely editable and the link survives any rename.
 */
class RequestOption extends Model
{
    protected $fillable = ['request_type', 'field_key', 'label_en', 'label_th', 'sort_order', 'active'];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'active' => 'boolean',
        ];
    }

    /** Choices of one list, in display order. */
    public function scopeForField(Builder $query, string $requestType, string $fieldKey): Builder
    {
        return $query->where('request_type', $requestType)
            ->where('field_key', $fieldKey)
            ->orderBy('sort_order')
            ->orderBy('label_en');
    }
}
