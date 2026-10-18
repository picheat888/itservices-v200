{{-- PDF of any tabular report (Report Center → /reports/tabular/{key}/export). Rendered by TabularReportExporter. No queries here: the report's query() eager-loads everything the columns read. --}}
@php
    $num = fn ($n) => \App\Services\Report\Tabular\TileText::number($n);
    $tiles = array_map(fn ($tile) => \App\Services\Report\Tabular\TileText::of($tile, $company['currency']), $summary);
    $columns = $report->exportColumns();
    $numeric = ['number', 'money', 'days_left', 'hours_left'];
    $lines = array_values(array_filter([
        $documentNo ? 'เลขที่เอกสาร '.$documentNo : null,
        'ข้อมูล ณ '.$printedAt,
        ...array_map(fn ($line) => $line[0].': '.$line[1], $scope ?? []),
    ]));
    // A section column whose heading says (%) prints its numbers as percents.
    $isPercent = fn (string $heading) => str_contains($heading, '%');
    $sectionCell = function ($cell, string $heading) use ($num, $isPercent) {
        if ($cell instanceof \App\Services\Report\Tabular\CellDate) {
            return $cell->display();
        }
        if (is_int($cell) || is_float($cell)) {
            // Days left below zero read as overdue, as in the rows ("เลยมา 922 วัน").
            if ($cell < 0 && str_starts_with($heading, 'เหลือ') && str_contains($heading, 'วัน')) {
                return 'เลยมา '.$num(abs($cell)).' วัน';
            }

            return $num($cell).($isPercent($heading) ? '%' : '');
        }

        return $cell === null || $cell === '' ? '—' : $cell;
    };
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $report->title() }} - {{ \App\Support\CompanyProfile::issuer($company) }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 28px 32px 46px; }
        body { margin: 0; color: #0f172a; font-size: 10.5px; }
        @include('pdf.partials.letterhead-style')
        .muted { color: #475569; }
        h2 { font-size: 12px; margin: 12px 0 4px; page-break-after: avoid; }
        h2 .count { font-weight: normal; color: #475569; font-size: 10.5px; }
        table.tiles { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4px; }
        table.tiles td.cell { padding: 0 6px 0 0; vertical-align: top; }
        table.tiles td.cell.last { padding-right: 0; }
        .tile { border: 0.5px solid #cbd5e1; border-top: 3px solid #2563eb; padding: 5px 8px 6px; min-height: 50px; }
        .tile-label { color: #475569; font-size: 9.5px; }
        .tile-value { font-size: 17px; font-weight: bold; line-height: 1.25; }
        .tile-badge { font-size: 9.5px; font-weight: bold; margin-left: 4px; }
        .tile-line { color: #475569; font-size: 9px; line-height: 1.35; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { background: #f1f5f9; border: 0.5px solid #cbd5e1; padding: 4px 5px; text-align: left; font-size: 9.5px; }
        table.data td { border: 0.5px solid #cbd5e1; padding: 3px 5px; font-size: 9.5px; vertical-align: top; }
        table.data th.r, table.data td.r { text-align: right; }
        table.data td.nw { white-space: nowrap; }
        .late { color: #dc2626; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        table.sign { width: 100%; margin-top: 26px; border-collapse: separate; border-spacing: 14px 0; page-break-inside: avoid; }
        table.sign td { width: 33%; text-align: center; vertical-align: bottom; padding-top: 26px; }
        .sign-line { border-bottom: 0.8px dotted #0f172a; height: 22px; margin-bottom: 4px; }
    </style>
</head>
<body>
@include('pdf.partials.letterhead', ['title' => $report->title(), 'lines' => $lines, 'lang' => 'th'])

{{-- Summary tiles: the page's labels and the line under each number --}}
<table class="tiles"><tr>
    @foreach ($tiles as $tile)
        <td class="cell{{ $loop->last ? ' last' : '' }}"><div class="tile" style="border-top-color: {{ $tile['tone'] ?? $company['accent'] }}">
            <div class="tile-label">{{ $tile['label'] }}</div>
            <div class="tile-value" style="color: {{ $tile['alert'] ? $tile['tone'] : '#0f172a' }}">{{ $tile['value'] }}@if ($tile['badge'])<span class="tile-badge" style="color: {{ $tile['tone'] ?? $company['accent'] }}">{{ $tile['badge'] }}</span>@endif</div>
            @if ($tile['line'])
                <div class="tile-line" @if ($tile['line_tone']) style="color: {{ $tile['line_tone'] }}" @endif>{{ $tile['line'] }}</div>
            @endif
        </div></td>
    @endforeach
</tr></table>

{{-- Extra tables a report adds above its rows (TabularReport::exportSections). --}}
@foreach ($sections ?? [] as $section)
    <h2>{{ $section['title'] }}@if (! empty($section['note'])) <span class="count">{{ $section['note'] }}</span>@endif</h2>
    @if (! empty($section['empty']))
        <div class="muted">{{ $section['empty'] }}</div>
        @continue
    @endif
    <table class="data">
        <thead><tr>
            @foreach ($section['headings'] as $i => $heading)
                <th class="{{ $i > 0 && collect($section['rows'])->every(fn ($r) => ! isset($r[$i]) || is_int($r[$i]) || is_float($r[$i])) ? 'r' : '' }}">{{ $heading }}</th>
            @endforeach
        </tr></thead>
        <tbody>
        @foreach ($section['rows'] as $cells)
            <tr>
                @foreach ($cells as $i => $cell)
                    <td class="{{ is_int($cell) || is_float($cell) ? 'r nw' : '' }}{{ $i === 0 ? ' nw' : '' }}{{ (is_int($cell) || is_float($cell)) && $cell < 0 ? ' late' : '' }}">{{ $sectionCell($cell, $section['headings'][$i] ?? '') }}</td>
                @endforeach
            </tr>
        @endforeach
        </tbody>
    </table>
@endforeach

<h2>รายการ <span class="count">{{ $truncated ? 'แสดง '.$num($rows->count()).' รายการแรกจาก '.$num($total).' รายการเต็มอยู่ในไฟล์ Excel' : $num($total).' รายการ' }}</span></h2>
<table class="data">
    <thead><tr>
        @foreach ($columns as $column)
            <th class="{{ in_array($column->type, $numeric, true) ? 'r' : '' }}">{{ $column->heading }}</th>
        @endforeach
    </tr></thead>
    <tbody>
    @forelse ($rows as $row)
        <tr>
            @foreach ($columns as $i => $column)
                @php
                    $cell = $column->exportValue($row);
                    $late = in_array($column->type, ['days_left', 'hours_left'], true) && $cell !== null && $cell < 0;
                    $text = match (true) {
                        $cell === null || $cell === '' => '—',
                        $column->type === 'money' => number_format($cell, 2),
                        $column->type === 'days_left' && $cell < 0 => 'เลยมา '.$num(abs($cell)).' วัน',
                        $column->type === 'hours_left' && $cell < 0 => 'เกิน '.number_format(abs($cell), $column->decimals()).' ชม.',
                        in_array($column->type, ['number', 'days_left', 'hours_left'], true) => number_format($cell, $column->decimals()),
                        default => $cell,
                    };
                    $class = trim((in_array($column->type, $numeric, true) ? 'r nw' : '').(in_array($column->type, ['date', 'datetime'], true) || $i === 0 ? ' nw' : '').($late ? ' late' : ''));
                @endphp
                <td class="{{ $class }}">{{ $text }}</td>
            @endforeach
        </tr>
    @empty
        <tr><td colspan="{{ count($columns) }}" class="muted">ไม่มีรายการตามตัวกรองนี้</td></tr>
    @endforelse
    </tbody>
</table>

{{-- Sign-off --}}
<table class="sign"><tr>
    <td><div class="sign-line"></div>ผู้จัดทำ<div class="muted">{{ $printedBy }}</div><div class="muted">วันที่ ........ / ........ / ........</div></td>
    <td><div class="sign-line"></div>ผู้ตรวจทาน<div class="muted">(.......................................................)</div><div class="muted">วันที่ ........ / ........ / ........</div></td>
    <td><div class="sign-line"></div>ผู้อนุมัติ<div class="muted">(.......................................................)</div><div class="muted">วันที่ ........ / ........ / ........</div></td>
</tr></table>
</body>
</html>
