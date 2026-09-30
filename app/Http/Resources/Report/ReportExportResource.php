<?php

namespace App\Http\Resources\Report;

use App\Models\Report\ReportExport;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One queued report file on "ไฟล์ Export ของฉัน". The stored filters and the number of picked
 * columns come back so the row can say which file this is (its date range, "3 filters",
 * "5 columns") — two exports of one report are otherwise indistinguishable. They are the
 * owner's own input; nobody else ever sees the row.
 *
 * @mixin ReportExport
 */
class ReportExportResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'report_key' => $this->report_key,
            'format' => $this->format,
            'status' => $this->status,
            'file_name' => $this->file_name,
            'filters' => (object) ($this->filters ?? []),
            'columns_count' => is_array($this->columns) ? count($this->columns) : null,
            'rows_count' => $this->rows_count,
            'size_bytes' => $this->size_bytes,
            'error' => $this->error,
            'created_at' => $this->created_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
        ];
    }
}
