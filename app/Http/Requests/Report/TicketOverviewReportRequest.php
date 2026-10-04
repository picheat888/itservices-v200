<?php

namespace App\Http\Requests\Report;

use App\Enums\Ticket\TicketCategory;
use App\Enums\Ticket\TicketPriority;
use App\Enums\Ticket\TicketSource;
use App\Services\Report\TicketOverviewReportService;
use App\Support\ReportCatalogue;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Filters of the "Ticket & SLA overview" report (summary, rows and export share them).
 * Authorization comes from ReportCatalogue so the hub and the endpoint agree.
 */
class TicketOverviewReportRequest extends FormRequest
{
    /** Longest range one request may cover — keeps the in-PHP aggregation bounded. */
    public const MAX_RANGE_DAYS = 366;

    public function authorize(): bool
    {
        return ReportCatalogue::allows($this->user(), ReportCatalogue::TICKETS_OVERVIEW);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'categories' => ['nullable', 'array'],
            'categories.*' => [Rule::enum(TicketCategory::class)],
            'priority' => ['nullable', Rule::enum(TicketPriority::class)],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'source' => ['nullable', Rule::enum(TicketSource::class)],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->hasAny(['from', 'to'])) {
                    return;
                }

                $from = CarbonImmutable::parse($this->input('from'));
                $to = CarbonImmutable::parse($this->input('to'));
                if ($from->diffInDays($to) + 1 > self::MAX_RANGE_DAYS) {
                    $validator->errors()->add('to', 'ช่วงวันที่ต้องไม่เกิน '.self::MAX_RANGE_DAYS.' วัน');
                }
            },
        ];
    }

    /**
     * @return array{from: CarbonImmutable, to: CarbonImmutable, categories: list<string>, priority: ?string, department_id: ?int, assignee_id: ?int, source: ?string}
     */
    public function filters(): array
    {
        return TicketOverviewReportService::resolveFilters($this->validated());
    }

    /**
     * The validated filter input alone — what a queued export stores to rebuild the file.
     *
     * @return array<string, mixed>
     */
    public function filterInput(): array
    {
        return collect($this->validated())->except(['format', 'per_page'])->all();
    }
}
