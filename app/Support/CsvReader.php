<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;

/**
 * The one CSV reader every bulk import in the app parses its upload with.
 *
 * It used to be a private method copied into two controllers, and the copies had
 * already drifted: the employee one indexed cells by header position, the contract
 * one handed both arrays to array_combine and died with a ValueError the moment a
 * row carried one cell too many — a stray trailing comma was a 500.
 *
 * What the reader guarantees, so no caller has to think about it again:
 *  - a UTF-8 BOM is stripped and headers are lower-cased and trimmed
 *  - every row has exactly the header's keys: missing cells read '', extra cells drop
 *  - fully blank lines are skipped, and every row still remembers the PHYSICAL line
 *    it came from under LINE_KEY, so a row number quoted in an error matches what
 *    the person is looking at in Excel
 */
class CsvReader
{
    /**
     * Reserved key each row carries its physical line number under. Stamped last, so
     * it wins over a column that happens to share the name, and excluded wherever a
     * caller reports "columns I did not recognise".
     */
    public const LINE_KEY = '__line';

    /**
     * Reserved key flagging a line that carried MORE cells than the header names.
     *
     * The extra cells have no column to land in, so they are dropped — but silently
     * dropping them is how an unquoted comma in the middle of a row turns into a
     * record saved with every later column shifted one place. Callers surface this
     * as a row error instead.
     */
    public const RAGGED_KEY = '__ragged';

    /** Largest upload accepted, in kilobytes — the shared `max:` rule for the file. */
    public const MAX_SIZE_KB = 5120;

    /** Extensions accepted. A CSV saved out of Notepad is often .txt. */
    public const ALLOWED_EXTENSIONS = ['csv', 'txt'];

    /** Is this upload one we will even try to parse? */
    public static function hasAcceptedExtension(UploadedFile $file): bool
    {
        return in_array(strtolower($file->getClientOriginalExtension()), self::ALLOWED_EXTENSIONS, true);
    }

    /**
     * Parses the file into rows keyed by header. Null when the file cannot be opened
     * or has no header line at all.
     *
     * @return array<int, array<string, string>>|null
     */
    public static function read(string $path): ?array
    {
        if (($handle = fopen($path, 'r')) === false) {
            return null;
        }

        $header = fgetcsv($handle);
        if ($header === false) {
            fclose($handle);

            return null;
        }

        $header = array_map(fn ($column) => strtolower(trim((string) $column)), $header);
        if (isset($header[0])) {
            $header[0] = (string) preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
        }

        $rows = [];
        $line = 1; // the header we just consumed
        while (($data = fgetcsv($handle)) !== false) {
            $line++;
            if (count(array_filter($data, fn ($value) => trim((string) $value) !== '')) === 0) {
                continue; // a blank line is spacing, not a record
            }

            $row = [];
            foreach ($header as $index => $column) {
                // Indexed by the header's own position: a short row reads '' and a
                // long one simply has no key to land its extra cells in.
                $row[$column] = (string) ($data[$index] ?? '');
            }
            $row[self::LINE_KEY] = (string) $line;
            if (count($data) > count($header)) {
                $row[self::RAGGED_KEY] = '1';
            }
            $rows[] = $row;
        }
        fclose($handle);

        return $rows;
    }

    /**
     * The physical line a parsed row came from, falling back to its array position
     * for rows that did not come through this reader (a service called directly by
     * a test, for instance).
     *
     * @param  array<string, string>  $row
     */
    public static function lineOf(array $row, int $index): int
    {
        return (int) ($row[self::LINE_KEY] ?? $index + 2); // +1 header, +1 humans count from one
    }

    /**
     * Header columns the caller has no field for. Ignored rather than refused — an
     * exported sheet carries plenty of extra columns — but worth naming back so
     * nobody assumes a column was saved when it was not.
     *
     * @param  array<int, array<string, string>>  $rows
     * @param  list<string>  $known
     * @return list<string>
     */
    /**
     * Did this line carry cells the header has no name for? See RAGGED_KEY.
     *
     * @param  array<string, string>  $row
     */
    public static function isRagged(array $row): bool
    {
        return isset($row[self::RAGGED_KEY]);
    }

    public static function unknownColumns(array $rows, array $known): array
    {
        $known[] = self::LINE_KEY;
        $known[] = self::RAGGED_KEY;
        $present = array_keys($rows[0] ?? []);

        return array_values(array_filter($present, fn ($column) => $column !== '' && ! in_array($column, $known, true)));
    }
}
