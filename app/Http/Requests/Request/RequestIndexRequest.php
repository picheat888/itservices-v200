<?php

// The request list's query string: the module gate, the filed-date filter and the list filters.

namespace App\Http\Requests\Request;

use App\Http\Requests\Permission\GatedPermissionRequest;
use App\Support\PerPage;

class RequestIndexRequest extends GatedPermissionRequest
{
    protected function gate(): string
    {
        return 'requests.module';
    }

    /**
     * Filed-date filter: ?filed_from=&filed_to= (inclusive days) or ?filed_days=N (the last N days to the minute).
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        if ($this->filled('filed_from') || $this->filled('filed_to')) {
            return [
                'filed_from' => ['required', 'date_format:Y-m-d'],
                'filed_to' => ['required', 'date_format:Y-m-d', 'after_or_equal:filed_from'],
            ];
        }
        if ($this->filled('filed_days')) {
            return ['filed_days' => ['integer', 'min:1', 'max:366']];
        }

        return [];
    }

    /**
     * @return array{sort: mixed, status: mixed, type: mixed, filed_from: ?string, filed_to: ?string, filed_days: ?int, search: mixed, scope: mixed, per_page: int}
     */
    public function filters(): array
    {
        $byRange = $this->filled('filed_from') || $this->filled('filed_to');

        return [
            'sort' => $this->query('sort'),
            'status' => $this->query('status'),
            'type' => $this->query('type'),
            'filed_from' => $byRange ? (string) $this->query('filed_from') : null,
            'filed_to' => $byRange ? (string) $this->query('filed_to') : null,
            'filed_days' => ! $byRange && $this->filled('filed_days') ? (int) $this->query('filed_days') : null,
            'search' => $this->query('search'),
            'scope' => $this->query('scope'),
            'per_page' => PerPage::from($this),
        ];
    }
}
