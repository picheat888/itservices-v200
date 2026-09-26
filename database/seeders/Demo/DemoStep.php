<?php

namespace Database\Seeders\Demo;

/**
 * One slice of the demo dataset (org, stock, tickets…). DemoSeeder runs them in order
 * inside one transaction; each reads what earlier steps registered on the context.
 */
interface DemoStep
{
    public function run(DemoContext $ctx, DemoClock $clock): void;
}
