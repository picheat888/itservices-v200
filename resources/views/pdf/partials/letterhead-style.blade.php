{{-- CSS of the shared letterhead (pdf.partials.letterhead); include inside the document's <style>. --}}
table.lh { width: 100%; border-collapse: collapse; border-bottom: 2px solid {{ $company['accent'] }}; margin-bottom: 10px; }
table.lh td { vertical-align: top; padding: 0 0 7px; }
table.lh td.lh-logo { width: 46px; }
table.lh img { height: 40px; }
.lh-name { font-size: 12.5px; font-weight: bold; }
.lh-line { color: #475569; font-size: 9.5px; }
table.lh td.lh-doc { text-align: right; white-space: nowrap; }
.lh-title { font-size: 15px; font-weight: bold; color: #0f172a; }
