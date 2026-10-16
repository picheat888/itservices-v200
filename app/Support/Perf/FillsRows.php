<?php

namespace App\Support\Perf;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Schema;

/** Shared by perf steps: builds a full row in the table's own column order, so rows match any already written. */
trait FillsRows
{
    private PerfContext $ctx;

    /** @var array<string, list<string>> */
    private array $columnCache = [];

    /** @return array<string, mixed> */
    private function fill(string $table, array $data): array
    {
        $this->columnCache[$table] ??= Schema::connection($this->ctx->sourceConnection)->getColumnListing($table);

        return array_replace(array_fill_keys($this->columnCache[$table], null), $data);
    }

    private function stamp(): string
    {
        return $this->ctx->clock->start()->format('Y-m-d H:i:s');
    }

    private function dateBetween(CarbonImmutable $from, CarbonImmutable $to): CarbonImmutable
    {
        return $from->addDays($this->ctx->rng->int(0, max(0, (int) floor($from->diffInDays($to)))))->startOfDay();
    }
}
