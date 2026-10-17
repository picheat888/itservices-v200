<?php

namespace Tests\Concerns;

// Report Center rights for test users: the master, export, schedule and the given domain switches.
trait GrantsReports
{
    /** @return list<string> */
    protected function reportRights(string ...$domains): array
    {
        return ['reports.module', 'reports.export', 'reports.schedule', ...array_map(fn (string $d) => "reports.{$d}", $domains)];
    }
}
