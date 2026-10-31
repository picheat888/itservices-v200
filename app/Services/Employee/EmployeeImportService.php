<?php

// Bulk employee import from a CSV: matches text to master data, all-or-nothing, preview with the same rules, no login accounts.

namespace App\Services\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\GroupRole;
use App\Models\User;
use App\Support\CsvReader;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class EmployeeImportService
{
    /**
     * The template columns in CSV order; the old `code` header is still read as employee_code.
     *
     * @var list<string>
     */
    public const COLUMNS = [
        'employee_code', 'first_name', 'last_name', 'first_name_th', 'last_name_th',
        'email', 'phone', 'department', 'section', 'position', 'joined_at',
        'report_to_employee_code',
    ];

    /** Preview rows sent back to the dialog; the counts still cover the whole file. */
    public const PREVIEW_LIMIT = 500;

    /** Similarity (percent) a typed value needs before the error suggests a real name. */
    private const SUGGEST_MIN_SIMILARITY = 65.0;

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
        $resignedCodes = Employee::whereNotNull('code')->where('status', EmployeeStatus::Resigned)->pluck('code')
            ->mapWithKeys(fn ($code) => [strtoupper($code) => true]);
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
            // The reader's own count when it kept one; otherwise the array position,
            // which is only right for a file with no blank lines in it.
            $line = CsvReader::lineOf($row, $i);
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
                $rowErrors[] = self::issue('required', 'first_name');
            }
            if ($lastName === '') {
                $rowErrors[] = self::issue('required', 'last_name');
            }

            if ($code !== '') {
                if (isset($existingIdByCode[strtoupper($code)])) {
                    $rowErrors[] = self::issue('exists', 'employee_code', $code);
                }
                if (isset($seenCodes[strtoupper($code)])) {
                    $rowErrors[] = self::issue('dup_in_file', 'employee_code', $code);
                }
                $seenCodes[strtoupper($code)] = true;
            }

            if ($email !== '') {
                $lower = strtolower($email);
                if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $rowErrors[] = self::issue('email_invalid', 'email', $email);
                }
                if (isset($existingEmails[$lower])) {
                    $rowErrors[] = self::issue('exists', 'email', $email);
                }
                if (isset($existingUserEmails[$lower])) {
                    $rowErrors[] = self::issue('email_taken_by_account', 'email', $email);
                }
                if (isset($seenEmails[$lower])) {
                    $rowErrors[] = self::issue('dup_in_file', 'email', $email);
                }
                $seenEmails[$lower] = true;
            }

            $departmentId = null;
            if ($departmentText !== '') {
                $matches = $departmentIndex[$this->normalize($departmentText)] ?? [];
                if (count($matches) === 0) {
                    $rowErrors[] = self::issue('not_found', 'department', $departmentText, ['closest' => $this->didYouMean($departmentText, $departments->pluck('name')->all())]);
                } elseif (count($matches) > 1) {
                    $rowErrors[] = self::issue('ambiguous', 'department', $departmentText);
                } else {
                    $departmentId = $matches[0];
                }
            }

            $sectionId = null;
            if ($sectionText !== '') {
                if ($departmentId === null) {
                    $rowErrors[] = self::issue('section_needs_department', 'section', $sectionText);
                } else {
                    $matches = $sectionIndex[$departmentId.'|'.$this->normalize($sectionText)] ?? [];
                    if (count($matches) === 0) {
                        $departmentName = $departmentNameById[$departmentId]->name;
                        // Only the sections of THIS department are candidates — the same
                        // rule the match itself follows.
                        $closest = $this->didYouMean(
                            $sectionText,
                            $sections->where('department_id', $departmentId)->pluck('name')->all(),
                        );
                        $rowErrors[] = self::issue('section_not_in_department', 'section', $sectionText, ['department' => $departmentName, 'closest' => $closest]);
                    } elseif (count($matches) > 1) {
                        $rowErrors[] = self::issue('ambiguous', 'section', $sectionText);
                    } else {
                        $sectionId = $matches[0];
                    }
                }
            }

            $positionId = null;
            if ($positionText !== '') {
                $matches = $positionIndex[$this->normalize($positionText)] ?? [];
                if (count($matches) === 0) {
                    $rowErrors[] = self::issue('not_found', 'position', $positionText, ['closest' => $this->didYouMean($positionText, $positions->pluck('title')->all())]);
                } elseif (count($matches) > 1) {
                    $rowErrors[] = self::issue('ambiguous', 'position', $positionText);
                } else {
                    $positionId = $matches[0];
                }
            }

            if ($reportTo !== '') {
                $key = strtoupper($reportTo);
                if ($code !== '' && $key === strtoupper($code)) {
                    $rowErrors[] = self::issue('report_to_self', 'report_to_employee_code', $reportTo);
                } elseif (! isset($existingIdByCode[$key]) && ! isset($codesInFile[$key])) {
                    $rowErrors[] = self::issue('report_to_not_found', 'report_to_employee_code', $reportTo);
                } elseif (isset($resignedCodes[$key])) {
                    $rowErrors[] = self::issue('report_to_resigned', 'report_to_employee_code', $reportTo);
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
                    $rowErrors[] = self::issue('position_needs', 'position', null, ['position' => $position->title, 'fields' => implode(', ', $missing)]);
                }
            }

            if ($joined !== '') {
                $date = \DateTime::createFromFormat('Y-m-d', $joined);
                if (! $date || $date->format('Y-m-d') !== $joined) {
                    $rowErrors[] = self::issue('date_format', 'joined_at', $joined);
                }
            }

            // Same limits as the employee form (StoreEmployeeRequest).
            $limits = ['employee_code' => 50, 'first_name' => 255, 'last_name' => 255, 'first_name_th' => 255, 'last_name_th' => 255, 'email' => 255, 'phone' => 50];
            foreach ($limits as $column => $max) {
                $text = $column === 'employee_code' ? $code : $this->value($row, $column);
                if (mb_strlen($text) > $max) {
                    $rowErrors[] = self::issue('too_long', $column, null, ['max' => $max]);
                }
            }
            $phone = $this->value($row, 'phone');
            if ($phone !== '' && ! preg_match('/(\D*\d){3,}/', $phone)) {
                $rowErrors[] = self::issue('phone_digits', 'phone', $phone);
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
            $preview[$loop['row']]['errors'][] = $loop['issue'];
        }

        foreach ($preview as $line => $entry) {
            foreach ($entry['errors'] as $issue) {
                $errors[] = ['row' => $line, 'issue' => $issue];
            }
        }

        // One entry per row, in file order — the dialog words each issue in the reader's language.
        $errors = collect($errors)
            ->groupBy('row')
            ->map(fn ($group, $row) => ['row' => (int) $row, 'issues' => $group->pluck('issue')->all()])
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
     * Creates the employees, then the reporting lines in a second pass, in one transaction.
     *
     * @param  list<array{line: int, code: string, report_to: string, data: array<string, mixed>}>  $prepared
     * @param  array<string, int>  $existingIdByCode  upper-cased employee code => id
     */
    private function persist(array $prepared, array $existingIdByCode): void
    {
        $group = GroupRole::defaultForNewEmployees();

        // Reserve the file's own codes before minting codes for blank rows
        $reserved = [];
        foreach ($prepared as $entry) {
            if ($entry['code'] !== '') {
                $reserved[strtoupper($entry['code'])] = true;
            }
        }
        $blankRows = count(array_filter($prepared, fn (array $entry) => $entry['code'] === ''));
        $minted = Employee::nextFreeCodes($blankRows, $reserved);

        DB::transaction(function () use ($prepared, $existingIdByCode, $group, $minted) {
            $idByCode = $existingIdByCode;
            $created = [];

            foreach ($prepared as $entry) {
                $data = $entry['data'];
                if ($data['code'] === null) {
                    $data['code'] = array_shift($minted);
                }
                $employee = Employee::create($data);
                $idByCode[strtoupper($employee->code)] = $employee->id;
                $created[] = ['id' => $employee->id, 'report_to' => $entry['report_to']];
            }

            // One write for the whole batch — this used to be a sync per employee.
            $group?->employees()->syncWithoutDetaching(array_column($created, 'id'));

            foreach ($created as $entry) {
                if ($entry['report_to'] === '') {
                    continue;
                }
                $managerId = $idByCode[strtoupper($entry['report_to'])] ?? null;
                if ($managerId) {
                    Employee::whereKey($entry['id'])->update(['manager_id' => $managerId, 'updated_by' => Auth::id()]);
                }
            }
        });
    }

    /**
     * Rows in the file whose reporting line loops back on itself.
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
                // Only a chain that comes back to THIS row makes this row the problem.
                // Reaching a cycle further up the line is somebody else's row to fix —
                // flagging it here sent people to correct a line that was already right.
                if ($cursor === $start) {
                    $loops[] = [
                        'row' => $entry['line'],
                        'issue' => self::issue('report_to_loop', 'report_to_employee_code', $entry['report_to']),
                    ];
                    break;
                }
                if (isset($visited[$cursor])) {
                    break; // a loop that does not contain this row — walk no further
                }
                $visited[$cursor] = true;
            }
        }

        return $loops;
    }

    /**
     * The first of the given columns present in the row, trimmed.
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
     * Adds one spelling to a lookup index, keeping every id it points at so ambiguity shows.
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

    /**
     * One problem on a row as a code the dialog words: the CSV column, the value typed, and any figures it quotes.
     *
     * @param  array<string, string|int|null>  $extra
     * @return array<string, string|int>
     */
    private static function issue(string $code, string $column, ?string $value = null, array $extra = []): array
    {
        return array_filter(['code' => $code, 'column' => $column, 'value' => $value, ...$extra], fn ($v) => $v !== null);
    }

    /**
     * The display name a value almost matches (never the aliases), or null.
     *
     * @param  list<string>  $candidates
     */
    private function didYouMean(string $typed, array $candidates): ?string
    {
        $best = null;
        $bestScore = 0.0;
        $needle = $this->normalize($typed);

        foreach ($candidates as $candidate) {
            if ($candidate === '') {
                continue;
            }
            similar_text($needle, $this->normalize($candidate), $percent);
            if ($percent > $bestScore) {
                $bestScore = $percent;
                $best = $candidate;
            }
        }

        return $bestScore >= self::SUGGEST_MIN_SIMILARITY ? $best : null;
    }

    /**
     * Dry-runs the rows: counts cover the whole file, the listing is capped with bad rows first.
     *
     * @param  array<int, array<string, string>>  $rows
     * @return array{data: list<array<string, mixed>>, errors: list<array{row: int, message: string}>, meta: array<string, mixed>}
     */
    public function preview(array $rows): array
    {
        $result = $this->importRows($rows, dryRun: true);
        $valid = count(array_filter($result['rows'], fn (array $row) => $row['errors'] === []));
        $total = count($result['rows']);

        $listed = collect($result['rows'])
            ->sortBy(fn (array $row) => $row['errors'] === [] ? 1 : 0)
            ->take(self::PREVIEW_LIMIT)
            ->sortBy('row')
            ->values()
            ->all();

        return [
            'data' => $listed,
            'errors' => $result['errors'],
            'meta' => [
                'total' => $total,
                'valid' => $valid,
                'invalid' => $total - $valid,
                'shown' => count($listed),
                'ignored_columns' => $this->unknownColumns($rows),
            ],
        ];
    }

    /**
     * Columns the import has no field for: ignored, but named in the preview.
     *
     * @param  array<int, array<string, string>>  $rows
     * @return list<string>
     */
    public function unknownColumns(array $rows): array
    {
        // 'code' = the old name of the employee_code column, still accepted
        return CsvReader::unknownColumns($rows, array_merge(self::COLUMNS, ['code']));
    }

    /**
     * Every spelling the import accepts for department, section and position, one CSV row each.
     *
     * @return list<array{string, string, string, string}>
     */
    public function referenceRows(): array
    {
        $rows = [];
        foreach (Department::orderBy('name')->get() as $department) {
            $rows[] = ['department', $department->name, '', $this->alsoAccepted([
                $department->tag, $department->code, $department->name_th,
            ])];
        }
        foreach (Section::with('department')->orderBy('name')->get() as $section) {
            // A section name resolves only inside its own department
            $rows[] = ['section', $section->name, $section->department?->name ?? '', $this->alsoAccepted([
                $section->code, $section->name_th,
            ])];
        }
        foreach (Position::orderBy('title')->get() as $position) {
            $rows[] = ['position', $position->title, '', $this->alsoAccepted([$position->code])];
        }

        return $rows;
    }

    /**
     * The template's example row: real master-data spellings, placeholders on a bare install.
     *
     * @return list<string>
     */
    public function sampleRow(): array
    {
        $department = Department::orderBy('id')->first();
        $section = $department ? Section::where('department_id', $department->id)->orderBy('id')->first() : null;
        $position = Position::where('allow_special_position', false)->orderBy('id')->first();
        // Someone at the top of the tree is the safest example of a person to report to
        $manager = Employee::whereNotNull('code')->whereNull('manager_id')->orderBy('id')->first();

        return [
            '',                                        // employee_code — blank lets the system assign EMP-####
            'John',
            'Doe',
            'จอห์น',
            'โด',
            'john.doe@abcd.co.th',
            '+66 81 000 0000',
            $department->tag ?? 'It',
            $section->name ?? 'Support',
            $position->title ?? 'Staff/Officer',
            '2024-01-15',
            $manager->code ?? 'EMP-1001',
        ];
    }

    /** The other spellings of one record, as one cell: "IT | DEP-0003 | ฝ่ายไอที". */
    private function alsoAccepted(array $aliases): string
    {
        return implode(' | ', array_filter(array_map('trim', array_map('strval', $aliases))));
    }
}
