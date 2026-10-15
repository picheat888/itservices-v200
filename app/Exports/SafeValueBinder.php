<?php

namespace App\Exports;

use Maatwebsite\Excel\DefaultValueBinder;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;

/**
 * Value binder for every Excel export (config/excel.php): non-numeric text that a spreadsheet could
 * read as a formula (= + - @ tab CR first) is written as plain text; everything else binds as usual.
 */
class SafeValueBinder extends DefaultValueBinder
{
    private const FORMULA_STARTS = ['=', '+', '-', '@', "\t", "\r"];

    /**
     * @param  Cell  $cell  Cell to bind value to
     * @param  mixed  $value  Value to bind in cell
     * @return bool
     */
    public function bindValue(Cell $cell, $value)
    {
        // Numeric strings ("-5", "+1.5") cannot run; they bind as numbers like before
        if (is_string($value) && $value !== '' && ! is_numeric($value) && in_array($value[0], self::FORMULA_STARTS, true)) {
            $cell->setValueExplicit($value, DataType::TYPE_STRING);

            return true;
        }

        return parent::bindValue($cell, $value);
    }
}
