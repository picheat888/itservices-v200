{{-- PDF of any tabular report (Report Center → /reports/r/{key}/export). Rendered by TabularReportExporter. No queries here: the report's query() eager-loads everything the columns read. --}}
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $report->title() }} - {{ $company }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        body { margin: 0; color: #000; font-size: 11px; }
        h1 { font-size: 15px; margin: 0; }
        .muted { color: #555; }
        .head { border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        .kpi td { border: 0.5px solid #999; padding: 6px; text-align: center; }
        .kpi b { display: block; font-size: 16px; }
        table.data th { background: #f0f0f0; border: 0.5px solid #999; padding: 4px 5px; text-align: left; font-size: 10px; }
        table.data td { border: 0.5px solid #ccc; padding: 4px 5px; font-size: 10px; }
        thead { display: table-header-group; }
        h2 { font-size: 12px; margin: 12px 0 4px; }
    </style>
</head>
<body>
<div class="head">
    <h1>{{ $report->title() }}</h1>
    <div class="muted">{{ $company }} · พิมพ์โดย {{ $printedBy }} เมื่อ {{ $printedAt }}</div>
</div>

<table class="kpi"><tr>
    @foreach ($summary as $item)
        <td>{{ $item->heading }}<b>{{ $item->value === null ? '—' : ($item->format === 'money' ? number_format($item->value, 2) : $item->value) }}</b></td>
    @endforeach
</tr></table>

<h2>รายการ</h2>
@if ($truncated)
    <div class="muted">แสดง {{ $rows->count() }} รายการแรกจาก {{ $total }} — ดูทั้งหมดได้ในไฟล์ Excel</div>
@endif
<table class="data">
    <thead><tr>
        @foreach ($report->columns() as $column)
            <th>{{ $column->heading }}</th>
        @endforeach
    </tr></thead>
    <tbody>
    @foreach ($rows as $row)
        <tr>
            @foreach ($report->columns() as $column)
                @php($cell = $column->exportValue($row))
                <td>{{ $column->type === 'money' && $cell !== null ? number_format($cell, 2) : $cell }}</td>
            @endforeach
        </tr>
    @endforeach
    </tbody>
</table>
</body>
</html>
