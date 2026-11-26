<?php

// Reads an uploaded asset import .xlsx into text rows keyed by column, and refuses files that are not the template.
// Cells are read by header name (row 1), never by position.

namespace App\Services\Asset;

use App\Support\AssetImportColumns;
use App\Support\Refusal;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Throwable;

class AssetImportReader
{
    /**
     * @return array{rows: list<array{line:int, cells: array<string,string>}>, ignored: list<string>}
     */
    public function read(UploadedFile $file, string $kind): array
    {
        $book = $this->load($file);
        $sheet = $book->getSheet(0);
        $otherKind = $kind === 'rented' ? 'purchased' : 'rented';

        if ($sheet->getTitle() === AssetImportColumns::DATA_SHEET[$otherKind]) {
            Refusal::fail('import_wrong_template', ['kind' => $otherKind]);
        }

        [$columnKeys, $ignored] = $this->readHeader($sheet, $kind, $otherKind);

        $rows = $this->readRows($sheet, $columnKeys);
        if (count($rows) > AssetImportColumns::MAX_ROWS) {
            Refusal::fail('import_too_many_rows', ['count' => count($rows), 'max' => AssetImportColumns::MAX_ROWS]);
        }
        if ($rows === []) {
            Refusal::fail('import_empty');
        }

        return ['rows' => $rows, 'ignored' => $ignored];
    }

    private function load(UploadedFile $file): Spreadsheet
    {
        try {
            $reader = new Xlsx;
            $reader->setReadDataOnly(false);
            if (! $reader->canRead($file->getRealPath())) {
                throw new \RuntimeException('Not an xlsx file.');
            }

            return $reader->load($file->getRealPath());
        } catch (Throwable) {
            Refusal::fail('import_unreadable');
        }
    }

    /**
     * Maps each header column letter to its column key, and collects headers the template does not know.
     *
     * @return array{0: array<string,string>, 1: list<string>}
     */
    private function readHeader(Worksheet $sheet, string $kind, string $otherKind): array
    {
        $columnKeys = [];
        $ignored = [];
        $foreignKey = false;

        foreach ($this->rowTexts($sheet, $this->coordinatesByLine($sheet)[1] ?? []) as $letter => $text) {
            if ($text === '') {
                continue;
            }
            $key = AssetImportColumns::matchHeader($kind, $text);
            if ($key !== null) {
                $columnKeys[$letter] ??= $key;

                continue;
            }
            $ignored[] = $text;
            $foreignKey = $foreignKey || AssetImportColumns::matchHeader($otherKind, $text) !== null;
        }

        if ($columnKeys === [] && ! $foreignKey) {
            Refusal::fail('import_header_missing');
        }
        if ($foreignKey) {
            Refusal::fail('import_wrong_template', ['kind' => $otherKind]);
        }

        $present = array_values($columnKeys);
        $missing = [];
        foreach (AssetImportColumns::for($kind) as $column) {
            if ($column['required'] && ! in_array($column['key'], $present, true)) {
                $missing[] = AssetImportColumns::header($column);
            }
        }
        if ($missing !== []) {
            Refusal::fail('import_missing_columns', ['columns' => implode(', ', $missing)]);
        }

        return [$columnKeys, $ignored];
    }

    /**
     * Data rows (row 2 down) that hold a real value; styled-but-empty rows are not counted.
     *
     * @param  array<string,string>  $columnKeys
     * @return list<array{line:int, cells: array<string,string>}>
     */
    private function readRows(Worksheet $sheet, array $columnKeys): array
    {
        $coordinatesByLine = $this->coordinatesByLine($sheet);
        unset($coordinatesByLine[1]);
        ksort($coordinatesByLine);

        $rows = [];
        foreach ($coordinatesByLine as $line => $coordinates) {
            $cells = array_fill_keys($columnKeys, '');
            foreach ($this->rowTexts($sheet, $coordinates) as $letter => $text) {
                if (isset($columnKeys[$letter])) {
                    $cells[$columnKeys[$letter]] = $text;
                }
            }
            if (array_filter($cells, fn (string $value): bool => $value !== '') !== []) {
                $rows[] = ['line' => $line, 'cells' => $cells];
            }
        }

        return $rows;
    }

    /** @return array<int, array<string, string>> coordinates of the existing cells, by row then column letter */
    private function coordinatesByLine(Worksheet $sheet): array
    {
        $byLine = [];
        foreach ($sheet->getCellCollection()->getCoordinates() as $coordinate) {
            [$letter, $line] = $this->split($coordinate);
            $byLine[$line][$letter] = $coordinate;
        }

        return $byLine;
    }

    /**
     * @param  array<string, string>  $coordinates  column letter => coordinate
     * @return array<string, string> text of each cell, keyed by column letter
     */
    private function rowTexts(Worksheet $sheet, array $coordinates): array
    {
        $texts = [];
        foreach ($coordinates as $letter => $coordinate) {
            $texts[$letter] = $this->cellText($sheet->getCell($coordinate));
        }

        return $texts;
    }

    /** @return array{0:string, 1:int} */
    private function split(string $coordinate): array
    {
        preg_match('/^([A-Z]+)(\d+)$/', $coordinate, $m);

        return [$m[1], (int) $m[2]];
    }

    /** The cell as the user sees it, trimmed: dates as Y-m-d, numbers without exponent, formulas as their value. */
    private function cellText(Cell $cell): string
    {
        $value = $cell->isFormula() ? $cell->getCalculatedValue() : $cell->getValue();

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        if (is_int($value) || is_float($value)) {
            file_put_contents(getenv('TEMP').'/dbg.txt', $cell->getCoordinate().' '.var_export($value, true).' '.var_export(Date::isDateTime($cell), true).' '.$cell->getWorksheetOrNull()?->getParent()::class.'
');
            if (Date::isDateTime($cell)) {
                return Date::excelToDateTimeObject($value)->format('Y-m-d');
            }

            return is_float($value) && floor($value) === $value && abs($value) < 1e15
                ? number_format($value, 0, '', '')
                : (string) $value;
        }

        return trim((string) $value);
    }
}
