<?php

// Record a resignation: an optional reason and a last day after the start date.

namespace App\Http\Requests\Employee;

use Illuminate\Auth\Access\Response;

class ResignEmployeeRequest extends EmployeeActionRequest
{
    public function authorize(): Response
    {
        return $this->guard()->canResign($this->user(), $this->employee());
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        $joinedAt = $this->employee()->joined_at;

        return [
            'reason' => ['nullable', 'string', 'max:500'],
            'last_day' => ['nullable', 'date', ...($joinedAt ? ['after:'.$joinedAt->toDateString()] : [])],
        ];
    }
}
