<?php

namespace App\Support\Perf;

/** One ordered stage of perf:generate; appends rows to the writer and records what later steps need. */
interface PerfStep
{
    public function run(PerfContext $ctx): void;
}
