<?php

// Validates the holiday list saved for one calendar year (route {year}).

namespace App\Http\Requests\Settings;

use Illuminate\Foundation\Http\FormRequest;

class SaveSlaHolidaysRequest extends FormRequest
{
    public function authorize(): bool
    {
        abort_unless($this->year() >= 2000 && $this->year() <= 2100, 404);

        return true;
    }

    public function year(): int
    {
        return (int) $this->route('year');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $year = $this->year();

        return [
            'holidays' => ['present', 'array', 'max:60'],
            'holidays.*.date' => ['required', 'date_format:Y-m-d', 'distinct', "after_or_equal:{$year}-01-01", "before_or_equal:{$year}-12-31"],
            'holidays.*.name' => ['required', 'string', 'max:100'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'holidays.*.date.required' => 'holiday_date_required',
            'holidays.*.date.date_format' => 'holiday_date_required',
            'holidays.*.date.distinct' => 'holiday_date_taken',
            'holidays.*.date.after_or_equal' => 'holiday_date_other_year',
            'holidays.*.date.before_or_equal' => 'holiday_date_other_year',
            'holidays.*.name.required' => 'holiday_name_required',
            'holidays.*.name.string' => 'holiday_name_required',
            'holidays.*.name.max' => 'holiday_name_required',
        ];
    }
}
