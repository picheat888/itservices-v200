<?php

namespace App\Http\Resources\Report;

use App\Models\Report\ReportExport;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One queued report file on "ไฟล์ Export ของฉัน". The stored filters are not sent back —
 * the list names the report and when it was asked for; the file itself carries the rest.
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
            'rows_count' => $this->rows_count,
            'size_bytes' => $this->size_bytes,
            'error' => $this->error,
            'created_at' => $this->created_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
        ];
    }
}
