<?php

namespace App\Support\Perf;

/** Everything a perf step needs: the writer, random source, clock, registry, targets and the source connection. */
final class PerfContext
{
    public function __construct(
        public readonly SqlWriter $sql,
        public readonly Rng $rng,
        public readonly Clock $clock,
        public readonly Registry $reg,
        public readonly Targets $targets,
        public readonly string $sourceConnection,
    ) {}
}
