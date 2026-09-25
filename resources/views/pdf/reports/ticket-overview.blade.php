{{-- PDF of the "Ticket & SLA overview" report (Report Center). Rendered by TicketOverviewExporter. --}}
@php
    $slaLabel = ['met' => 'ตรง SLA', 'breached' => 'เกิน SLA'];
    $k = $summary['kpi'];
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>รายงานภาพรวม Ticket & SLA - {{ $company }}</title>
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
        .grid td.col { vertical-align: top; width: 33%; padding-right: 8px; }
        table.data th { background: #f0f0f0; border: 0.5px solid #999; padding: 4px 5px; text-align: left; font-size: 10px; }
        table.data td { border: 0.5px solid #ccc; padding: 4px 5px; font-size: 10px; }
        thead { display: table-header-group; }
        h2 { font-size: 12px; margin: 12px 0 4px; }
    </style>
</head>
<body>
<div class="head">
    <h1>รายงานภาพรวม Ticket &amp; SLA</h1>
    <div class="muted">{{ $company }} · ช่วงวันที่ {{ $summary['range']['from'] }} – {{ $summary['range']['to'] }} · พิมพ์โดย {{ $printedBy }} เมื่อ {{ $summary['generated_at'] }}</div>
</div>

<table class="kpi"><tr>
    <td>Ticket ทั้งหมด<b>{{ $k['total'] }}</b></td>
    <td>ปิดสำเร็จ<b>{{ $k['completed'] }}</b></td>
    <td>ปิดตาม SLA<b>{{ $k['sla_rate'] === null ? '—' : $k['sla_rate'].'%' }}</b></td>
    <td>เวลาแก้ไขมัธยฐาน<b>{{ $k['median_resolve_hours'] === null ? '—' : $k['median_resolve_hours'].' ชม.' }}</b></td>
    <td>ค้างอยู่ตอนนี้<b>{{ $summary['backlog']['open'] + $summary['backlog']['in_progress'] }}</b></td>
</tr></table>

<table class="grid"><tr>
    <td class="col">
        <h2>SLA ตามความสำคัญ</h2>
        <table class="data"><thead><tr><th>ความสำคัญ</th><th>วัดได้</th><th>%</th></tr></thead><tbody>
        @foreach ($summary['sla_by_priority'] as $p)
            <tr><td>{{ $p['priority'] }}</td><td>{{ $p['measured'] }}</td><td>{{ $p['rate'] ?? '—' }}</td></tr>
        @endforeach
        </tbody></table>
    </td>
    <td class="col">
        <h2>แยกตามหมวด</h2>
        <table class="data"><thead><tr><th>หมวด</th><th>จำนวน</th></tr></thead><tbody>
        @foreach ($summary['by_category'] as $c)
            <tr><td>{{ $c['category'] }}</td><td>{{ $c['count'] }}</td></tr>
        @endforeach
        </tbody></table>
    </td>
    <td class="col">
        <h2>แผนกที่แจ้งมากที่สุด</h2>
        <table class="data"><thead><tr><th>แผนก</th><th>จำนวน</th><th>SLA %</th></tr></thead><tbody>
        @foreach ($summary['by_department'] as $d)
            <tr><td>{{ $d['name_th'] ?: ($d['name'] ?? 'ไม่ระบุแผนก') }}</td><td>{{ $d['count'] }}</td><td>{{ $d['sla_rate'] ?? '—' }}</td></tr>
        @endforeach
        </tbody></table>
    </td>
</tr></table>

<h2>รายการ Ticket</h2>
@if ($truncated)
    <div class="muted">แสดง {{ $rows->count() }} รายการล่าสุดจาก {{ $k['total'] }} — ดูทั้งหมดได้ในไฟล์ Excel</div>
@endif
<table class="data">
    <thead><tr><th>เลขที่</th><th>เรื่อง</th><th>แผนก</th><th>หมวด</th><th>ความสำคัญ</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>เปิดเมื่อ</th><th>ชม.</th><th>SLA</th></tr></thead>
    <tbody>
    @foreach ($rows as $t)
        <tr>
            <td>{{ $t->ticket_no }}</td>
            <td>{{ $t->subject }}</td>
            <td>{{ $t->requester?->department?->name_th ?: $t->requester?->department?->name }}</td>
            <td>{{ $t->category?->value }}</td>
            <td>{{ $t->priority?->value }}</td>
            <td>{{ $t->status?->value }}</td>
            <td>{{ $t->assignee?->name }}</td>
            <td>{{ \App\Support\SystemTime::dateTime($t->created_at) }}</td>
            <td>{{ \App\Services\Report\TicketMetrics::resolveHours($t) }}</td>
            <td>{{ $slaLabel[\App\Services\Report\TicketMetrics::slaState($t, now())] ?? '' }}</td>
        </tr>
    @endforeach
    </tbody>
</table>
</body>
</html>
