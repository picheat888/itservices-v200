<?php

namespace App\Support\Perf;

/** Seeded random source for the perf dataset; own state so nothing else can disturb the sequence. */
class Rng
{
    private int $state;

    public function __construct(int $seed)
    {
        $this->state = (($seed * 2654435761) & 0xFFFFFFFF) ?: 1;
        for ($i = 0; $i < 8; $i++) {
            $this->next();
        }
    }

    private function next(): int
    {
        $x = $this->state;
        $x ^= ($x << 13) & 0xFFFFFFFF;
        $x ^= $x >> 17;
        $x ^= ($x << 5) & 0xFFFFFFFF;

        return $this->state = $x;
    }

    public function float(): float
    {
        return $this->next() / 4294967296;
    }

    public function int(int $min, int $max): int
    {
        return $min + (int) floor($this->float() * ($max - $min + 1));
    }

    public function chance(float $p): bool
    {
        return $this->float() < $p;
    }

    public function pick(array $list): mixed
    {
        return $list[array_keys($list)[$this->int(0, count($list) - 1)]];
    }

    /** @param array<string|int, int|float> $weights */
    public function weighted(array $weights): string|int
    {
        $r = $this->float() * array_sum($weights);
        foreach ($weights as $key => $weight) {
            $r -= $weight;
            if ($r < 0) {
                return $key;
            }
        }

        return array_key_last($weights);
    }

    public function shuffle(array $list): array
    {
        $list = array_values($list);
        for ($i = count($list) - 1; $i > 0; $i--) {
            $j = $this->int(0, $i);
            [$list[$i], $list[$j]] = [$list[$j], $list[$i]];
        }

        return $list;
    }

    public function uuid(): string
    {
        $b = [];
        for ($i = 0; $i < 16; $i++) {
            $b[] = $this->int(0, 255);
        }
        $b[6] = ($b[6] & 0x0F) | 0x40;
        $b[8] = ($b[8] & 0x3F) | 0x80;
        $h = implode('', array_map(fn (int $v): string => sprintf('%02x', $v), $b));

        return sprintf('%s-%s-%s-%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 12, 4), substr($h, 16, 4), substr($h, 20, 12));
    }
}
