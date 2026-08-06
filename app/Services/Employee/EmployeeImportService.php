<?php

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\Settings\AppSetting;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Bulk employee import from a CSV.
 *
 * The file speaks plain text, not ids: `department`, `section` and `position` carry
 * whatever the person filling in the sheet knows the unit as, so every one of them is
 * matched against the master data before anything is written — a department by its tag,
 * code, English or Thai name; a section by code or name but ONLY within the department
 * named on the same row (the same rule the employee form enforces); a position by code
 * or title. Text matching two different records is an error, never a coin flip.
 *
 * The reporting line travels as `report_to_employee_code`, so a manager may appear
 * further down the file than their subordinates: employees are created first and the
 * reporting lines attached in a second pass, with loops rejected up front.
 *
 * Validation is all-or-nothing — one bad row and nothing is imported — so the caller
 * can preview a file (dryRun) with the exact same rules that the real import applies.
 *
 * No login accounts and no "credentials needed" notifications are created here: a bulk
 * import would spam every account provisioner. Accounts are set up afterwards through
 * the normal set-credentials flow.
 */
class EmployeeImportService
{
    /**
     * The template columns, in the order the downloaded CSV carries them. `employee_code`
     * was called `code` in the first version of the template; both are still accepted so
     * a sheet somebody downloaded months ago keeps working.
     *
     * @var list<string>
     */
    public const COLUMNS = [
        'employee_code', 'first_name', 'last_name', 'first_name_th', 'last_name_th',
        'email', 'phone', 'department', 'section', 'position', 'joined_at',
        'report_to_employee_code',
    ];

    /**
     * Validates CSV rows and — unless $dryRun — imports them.
     *
     * @param  array<int, array<string, string>>  $rows  each keyed by (lower-cased) column name
     * @return array{
     *     imported: int,
     *     errors: list<array{row: int, message: string}>,
     *     rows: list<array<string, mixed>>
     * }
     */
    public function importRows(array $rows, bool $dryRun = false): array
    {
        $departments = Department::all(['id', 'code', 'tag', 'name', 'name_th']);
        $sections = Section::all(['id', 'department_id', 'code', 'name', 'name_th']);
        $positions = Position::all(['id', 'code', 'title', 'allow_special_position']);

        $departmentIndex = [];
        foreach ($departments as $department) {
            foreach ([$department->tag, $department->code, $department->name, $department->name_th] as $text) {
                $this->index($departmentIndex, $text, $department->id);
            }
        }

        // Sections are indexed per department: two departments are free to own a section
        // of the same name, and a row's section is only ever looked for inside its own.
        $sectionIndex = [];
        foreach ($sections as $section) {
            foreach ([$section->code, $section->name, $section->name_th] as $text) {
                $this->index($sectionIndex, $text, $section->id, $section->department_id.'|');
            }
        }

        $positionIndex = [];
        foreach ($positions as $position) {
            foreach ([$position->code, $position->title] as $text) {
                $this->index($positionIndex, $text, $position->id);
            }
        }

        $departmentNameById = $departments->keyBy('id');
        $sectionNameById = $sections->keyBy('id');
        $positionById = $positions->keyBy('id');

        $existingIdByCode = Employee::whereNotNull('code')->pluck('id', 'code')
            ->mapWithKeys(fn ($id, $code) => [strtoupper($code) => $id]);
        $existingEmails = Employee::whereNotNull('email')->pluck('email')
            ->mapWithKeys(fn ($email) => [strtolower($email) => true]);
        // Imported rows never own a login account yet, so ANY user email is a conflict.
        $existingUserEmails = User::whereNotNull('email')->pluck('email')
            ->mapWithKeys(fn ($email) => [strtolower($email) => true]);

        // Codes declared anywhere in the file, so a row may report to a manager listed below it.
        $codesInFile = [];
        foreach ($rows as $index => $row) {
            $code = $this->value($row, 'employee_code', 'code');
            if ($code !== '') {
                $codesInFile[strtoupper($code)] = $index;
            }
        }

        $errors = [];
        $preview = [];
        $prepared = [];
        $seenCodes = [];
        $seenEmails = [];

        foreach ($rows as $i => $row) {
            $line = $i + 2; // +1 for the header, +1 because humans count from one
            $code = $this->value($row, 'employee_code', 'code');
            $firstName = $this->value($row, 'first_name');
            $lastName = $this->value($row, 'last_name');
            $email = $this->value($row, 'email');
            $departmentText = $this->value($row, 'department');
            $sectionText = $this->value($row, 'section');
            $positionText = $this->value($row, 'position');
            $joined = $this->value($row, 'joined_at');
            $reportTo = $this->value($row, 'report_to_employee_code');
            $rowErrors = [];

            if ($firstName === '') {
                $rowErrors[] = 'first_name ว่าง';
            }
            if ($lastName === '') {
                $rowErrors[] = 'last_name ว่าง';
            }

            if ($code !== '') {
                if (isset($existingIdByCode[strtoupper($code)])) {
                    $rowErrors[] = "employee_code '{$code}' ซ้ำกับที่มีอยู่";
                }
                if (isset($seenCodes[strtoupper($code)])) {
                    $rowErrors[] = "employee_code '{$code}' ซ้ำในไฟล์";
                }
                $seenCodes[strtoupper($code)] = true;
            }

            if ($email !== '') {
                $lower = strtolower($email);
                if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $rowErrors[] = "email '{$email}' ไม่ถูกต้อง";
                }
                if (isset($existingEmails[$lower])) {
                    $rowErrors[] = "email '{$email}' ซ้ำกับที่มีอยู่";
                }
                if (isset($existingUserEmails[$lower])) {
                    $rowErrors[] = "email '{$email}' ซ้ำกับบัญชีผู้ใช้ในระบบ";
                }
                if (isset($seenEmails[$lower])) {
                    $rowErrors[] = "email '{$email}' ซ้ำในไฟล์";
                }
                $seenEmails[$lower] = true;
            }

            $departmentId = null;
            if ($departmentText !== '') {
                $matches = $departmentIndex[$this->normalize($departmentText)] ?? [];
                if (count($matches) === 0) {
                    $rowErrors[] = "department '{$departmentText}' ไม่พบในระบบ";
                } elseif (count($matches) > 1) {
                    $rowErrors[] = "department '{$departmentText}' ไม่ชัดเจน (ตรงกับหลายแผนก)";
                } else {
                    $departmentId = $matches[0];
                }
            }

            $sectionId = null;
            if ($sectionText !== '') {
                if ($departmentId === null) {
                    $rowErrors[] = "section '{$sectionText}' ต้องระบุ department ที่ถูกต้องก่อน";
                } else {
                    $matches = $sectionIndex[$departmentId.'|'.$this->normalize($sectionText)] ?? [];
                    if (count($matches) === 0) {
                        $departmentName = $departmentNameById[$departmentId]->name;
                        $rowErrors[] = "section '{$sectionText}' ไม่อยู่ในแผนก {$departmentName}";
                    } elseif (count($matches) > 1) {
                        $rowErrors[] = "section '{$sectionText}' ไม่ชัดเจน (ตรงกับหลายหน่วยงานในแผนกเดียวกัน)";
                    } else {
                        $sectionId = $matches[0];
                    }
                }
            }

            $positionId = null;
            if ($positionText !== '') {
                $matches = $positionIndex[$this->normalize($positionText)] ?? [];
                if (count($matches) === 0) {
                    $rowErrors[] = "position '{$positionText}' ไม่พบในระบบ";
                } elseif (count($matches) > 1) {
                    $rowErrors[] = "position '{$positionText}' ไม่ชัดเจน (ตรงกับหลายตำแหน่ง)";
                } else {
                    $positionId = $matches[0];
                }
            }

            if ($reportTo !== '') {
                $key = strtoupper($reportTo);
                if ($code !== '' && $key === strtoupper($code)) {
                    $rowErrors[] = "report_to_employee_code '{$reportTo}' เป็นรหัสของแถวนี้เอง";
                } elseif (! isset($existingIdByCode[$key]) && ! isset($codesInFile[$key])) {
                    $rowErrors[] = "report_to_employee_code '{$reportTo}' ไม่พบ (ต้องเป็น employee_code ที่มีอยู่ หรือที่อยู่ในไฟล์นี้)";
                }
            }

            // Same rule as the employee form: a normal position needs a place in the org
            // chart, a special position (Vice President) may sit on its own at the top.
            $position = $positionId ? $positionById[$positionId] : null;
            if ($position && ! $position->allow_special_position) {
                $missing = [];
                if ($departmentText === '') {
                    $missing[] = 'department';
                }
                if ($sectionText === '') {
                    $missing[] = 'section';
                }
                if ($reportTo === '') {
                    $missing[] = 'report_to_employee_code';
                }
                if ($missing) {
                    $rowErrors[] = "ตำแหน่ง '{$position->title}' ต้องระบุ ".implode(', ', $missing);
                }
            }

            if ($joined !== '') {
                $date = \DateTime::createFromFormat('Y-m-d', $joined);
                if (! $date || $date->format('Y-m-d') !== $joined) {
                    $rowErrors[] = "joined_at '{$joined}' ต้องเป็นรูปแบบ YYYY-MM-DD";
                }
            }

            $preview[$line] = [
                'row' => $line,
                'employee_code' => $code !== '' ? $code : null,
                'name' => trim($firstName.' '.$lastName),
                'name_th' => trim($this->value($row, 'first_name_th').' '.$this->value($row, 'last_name_th')) ?: null,
                'email' => $email !== '' ? $email : null,
                'phone' => $this->value($row, 'phone') ?: null,
                'department' => $departmentId ? $departmentNameById[$departmentId]->name : ($departmentText ?: null),
                'section' => $sectionId ? $sectionNameById[$sectionId]->name : ($sectionText ?: null),
                'position' => $position ? $position->title : ($positionText ?: null),
                'joined_at' => $joined !== '' ? $joined : null,
                'report_to' => $reportTo !== '' ? $reportTo : null,
                'errors' => $rowErrors,
            ];

            if ($rowErrors) {
                continue;
            }

            $prepared[] = [
                'line' => $line,
                'code' => $code,
                'report_to' => $reportTo,
                'data' => [
                    'code' => $code !== '' ? $code : null,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'first_name_th' => $this->value($row, 'first_name_th') ?: null,
                    'last_name_th' => $this->value($row, 'last_name_th') ?: null,
                    'email' => $email !== '' ? $email : null,
                    'phone' => $this->value($row, 'phone') ?: null,
                    'department_id' => $departmentId,
                    'section_id' => $sectionId,
                    'position_id' => $positionId,
                    'joined_at' => $joined !== '' ? $joined : null,
                    'status' => EmployeeStatus::Active,
                ],
            ];
        }

        foreach ($this->reportingLoops($prepared) as $loop) {
            $preview[$loop['row']]['errors'][] = $loop['message'];
        }

        foreach ($preview as $line => $entry) {
            foreach ($entry['errors'] as $message) {
                $errors[] = ['row' => $line, 'message' => $message];
            }
        }

        // One message per row, in file order — the dialog lists them line by line.
        $errors = collect($errors)
            ->groupBy('row')
            ->map(fn ($group, $row) => ['row' => (int) $row, 'message' => $group->pluck('message')->implode(', ')])
            ->sortBy('row')
            ->values()
            ->all();

        if ($errors || $dryRun) {
            return ['imported' => 0, 'errors' => $errors, 'rows' => array_values($preview)];
        }

        $this->persist($prepared, $existingIdByCode->all());

        return ['imported' => count($prepared), 'errors' => [], 'rows' => array_values($preview)];
    }

    /**
     * Creates the employees, then attaches the reporting lines in a second pass so a
     * manager listed after their subordinates still resolves. Both passes share one
     * transaction: a failure anywhere leaves the table exactly as it was.
     *
     * @param  list<array{line: int, code: string, report_to: string, data: array<string, mixed>}>  $prepared
     * @param  array<string, int>  $existingIdByCode  upper-cased employee code => id
     */
    private function persist(array $prepared, array $existingIdByCode): void
    {
        $defaultGroupId = (int) AppSetting::get('default_employee_group_id', 0);
        $group = $defaultGroupId ? GroupRole::find($defaultGroupId) : null;

        DB::transaction(function () use ($prepared, $existingIdByCode, $group) {
            $idByCode = $existingIdByCode;
            $created = [];

            foreach ($prepared as $entry) {
                $employee = Employee::create($entry['data']); // code auto-generated when null
                $idByCode[strtoupper($employee->code)] = $employee->id;
                $created[] = ['id' => $employee->id, 'report_to' => $entry['report_to']];
                $group?->employees()->syncWithoutDetaching([$employee->id]);
            }

            foreach ($created as $entry) {
                if ($entry['report_to'] === '') {
                    continue;
                }
                $managerId = $idByCode[strtoupper($entry['report_to'])] ?? null;
                if ($managerId) {
                    Employee::whereKey($entry['id'])->update(['manager_id' => $managerId]);
                }
            }
        });
    }

    /**
     * Finds rows whose reporting line loops back on itself within the file. Only rows
     * in the file can form a new loop: a manager who already exists cannot report to
     * somebody who does not exist yet, so their chain is known to be sound.
     *
     * @param  list<array{line: int, code: string, report_to: string, data: array<string, mixed>}>  $prepared
     * @return list<array{row: int, message: string}>
     */
    private function reportingLoops(array $prepared): array
    {
        $parentByCode = [];
        foreach ($prepared as $entry) {
            if ($entry['code'] !== '' && $entry['report_to'] !== '') {
                $parentByCode[strtoupper($entry['code'])] = strtoupper($entry['report_to']);
            }
        }

        $loops = [];
        foreach ($prepared as $entry) {
            if ($entry['code'] === '' || $entry['report_to'] === '') {
                continue;
            }

            $start = strtoupper($entry['code']);
            $cursor = $start;
            $visited = [];
            while (isset($parentByCode[$cursor])) {
                $cursor = $parentByCode[$cursor];
                if ($cursor === $start || isset($visited[$cursor])) {
                    $loops[] = [
                        'row' => $entry['line'],
                        'message' => "report_to_employee_code '{$entry['report_to']}' ทำให้สายบังคับบัญชาวนกลับมาที่ตัวเอง",
                    ];
                    break;
                }
                $visited[$cursor] = true;
            }
        }

        return $loops;
    }

    /**
     * Reads the first column present out of a row and trims it. Several names are
     * accepted for the same field so older templates keep working.
     *
     * @param  array<string, string>  $row
     */
    private function value(array $row, string ...$names): string
    {
        foreach ($names as $name) {
            if (isset($row[$name]) && trim((string) $row[$name]) !== '') {
                return trim((string) $row[$name]);
            }
        }

        return '';
    }

    /**
     * Records one spelling of a master-data record in a lookup index. Every id that a
     * spelling points at is kept, which is how ambiguous text is detected rather than
     * silently resolved to whichever row happened to be indexed last.
     *
     * @param  array<string, list<int>>  $index
     */
    private function index(array &$index, ?string $text, int $id, string $prefix = ''): void
    {
        $key = $this->normalize((string) $text);
        if ($key === '') {
            return;
        }

        $key = $prefix.$key;
        if (! in_array($id, $index[$key] ?? [], true)) {
            $index[$key][] = $id;
        }
    }

    /** Lower-cases, trims, and collapses inner whitespace so "  Staff/Officer " matches "staff/officer". */
    private function normalize(string $text): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text)));
    }
}
