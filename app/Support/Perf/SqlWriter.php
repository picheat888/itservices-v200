<?php

namespace App\Support\Perf;

use Carbon\CarbonInterface;
use InvalidArgumentException;

/** Writes the perf dataset as bulk INSERT statements; clears each table first so the file can be imported twice. */
class SqlWriter
{
    private const CHUNK = 1000;

    /** @var resource */
    private $handle;

    /** @var array<string, list<string>> */
    private array $columns = [];

    /** @var array<string, list<string>> */
    private array $buffer = [];

    /** @var array<string, int> */
    private array $counts = [];

    public function __construct(string $path, private readonly string $dialect)
    {
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0777, true);
        }
        $this->handle = fopen($path, 'wb');
        if ($this->isMariadb()) {
            $this->raw("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET autocommit=0;\n");
        }
    }

    private function isMariadb(): bool
    {
        return $this->dialect === 'mariadb';
    }

    private function raw(string $sql): void
    {
        fwrite($this->handle, $sql);
    }

    private function ident(string $name): string
    {
        return $this->isMariadb() ? "`{$name}`" : "\"{$name}\"";
    }

    public function clear(string $table): void
    {
        $this->raw($this->isMariadb()
            ? "TRUNCATE TABLE {$this->ident($table)};\n"
            : "DELETE FROM {$this->ident($table)};\n");
    }

    /** @param array<string, mixed> $row */
    public function insert(string $table, array $row): void
    {
        $columns = array_keys($row);
        if (! isset($this->columns[$table])) {
            $this->clear($table);
            $this->columns[$table] = $columns;
            $this->buffer[$table] = [];
            $this->counts[$table] = 0;
        } elseif ($this->columns[$table] !== $columns) {
            throw new InvalidArgumentException("Row for {$table} has different columns than the first row");
        }

        $this->buffer[$table][] = '('.implode(',', array_map($this->format(...), $row)).')';
        $this->counts[$table]++;
        if (count($this->buffer[$table]) >= self::CHUNK) {
            $this->flush($table);
        }
    }

    /**
     * @param  array<string, mixed>  $set
     * @param  array<string, mixed>  $where
     */
    public function update(string $table, array $set, array $where): void
    {
        if (isset($this->buffer[$table])) {
            $this->flush($table);
        }
        $assign = implode(',', array_map(fn (string $c, mixed $v): string => $this->ident($c).'='.$this->format($v), array_keys($set), $set));
        $cond = implode(' AND ', array_map(fn (string $c, mixed $v): string => $this->ident($c).'='.$this->format($v), array_keys($where), $where));
        $this->raw("UPDATE {$this->ident($table)} SET {$assign} WHERE {$cond};\n");
    }

    private function flush(string $table): void
    {
        if ($this->buffer[$table] === []) {
            return;
        }
        $cols = implode(',', array_map($this->ident(...), $this->columns[$table]));
        $this->raw("INSERT INTO {$this->ident($table)} ({$cols}) VALUES ".implode(",\n", $this->buffer[$table]).";\n");
        $this->buffer[$table] = [];
    }

    public function close(): void
    {
        foreach (array_keys($this->buffer) as $table) {
            $this->flush($table);
        }
        if ($this->isMariadb()) {
            $this->raw("COMMIT;\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n");
        }
        fclose($this->handle);
    }

    /** @return array<string, int> */
    public function counts(): array
    {
        return $this->counts;
    }

    private function format(mixed $v): string
    {
        return match (true) {
            $v === null => 'NULL',
            is_bool($v) => $v ? '1' : '0',
            is_int($v) => (string) $v,
            is_float($v) => rtrim(rtrim(sprintf('%.6F', $v), '0'), '.'),
            $v instanceof CarbonInterface => "'".$v->format('Y-m-d H:i:s')."'",
            is_array($v) => $this->quote(json_encode($v, JSON_UNESCAPED_SLASHES)),
            default => $this->quote((string) $v),
        };
    }

    private function quote(string $s): string
    {
        if ($this->isMariadb()) {
            $s = str_replace('\\', '\\\\', $s);
        }

        return "'".str_replace("'", "''", $s)."'";
    }
}
