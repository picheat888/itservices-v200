<?php

// One schedule in the admin's "จัดการ" dialog: the owner's own fields plus who owns it and
// which recipients have an account (the rest are outside addresses).

namespace App\Http\Resources\Report;

use App\Models\Report\ReportSchedule;
use Illuminate\Http\Request;

/**
 * @mixin ReportSchedule
 */
class ManagedReportScheduleResource extends ReportScheduleResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $department = $this->user?->employee?->department;
        $accounts = $this->getAttribute('recipient_accounts') ?? [];

        return [
            ...parent::toArray($request),
            'owner' => [
                'id' => $this->user_id,
                'name' => $this->user?->name,
                'department' => $department ? ['name' => $department->name, 'name_th' => $department->name_th] : null,
            ],
            'recipient_list' => array_map(
                fn (string $email) => ['email' => $email, 'has_account' => in_array(mb_strtolower($email), $accounts, true)],
                $this->recipients ?? [],
            ),
        ];
    }
}
