<?php

namespace Tests\Unit\Perf;

use App\Support\Perf\SqlWriter;
use Carbon\CarbonImmutable;
use InvalidArgumentException;
use Tests\TestCase;

// Unit tests for the perf dataset SQL file writer
class SqlWriterTest extends TestCase
{
    private function tmp(): string
    {
        return sys_get_temp_dir().DIRECTORY_SEPARATOR.'perf_sql_'.uniqid().'.sql';
    }

    public function test_file_clears_each_table_before_inserting(): void
    {
        $path = $this->tmp();
        $w = new SqlWriter($path, 'mariadb');
        $w->insert('brands', ['id' => 1, 'name' => 'A']);
        $w->close();
        $sql = file_get_contents($path);
        $this->assertLessThan(strpos($sql, 'INSERT INTO `brands`'), strpos($sql, 'TRUNCATE TABLE `brands`;'));
        $this->assertStringContainsString('SET FOREIGN_KEY_CHECKS=0;', $sql);

        $path2 = $this->tmp();
        $w2 = new SqlWriter($path2, 'sqlite');
        $w2->insert('brands', ['id' => 1, 'name' => 'A']);
        $w2->close();
        $sql2 = file_get_contents($path2);
        $this->assertStringContainsString('DELETE FROM "brands";', $sql2);
        $this->assertStringNotContainsString('SET ', $sql2);
    }

    public function test_chunks_every_thousand_rows(): void
    {
        $path = $this->tmp();
        $w = new SqlWriter($path, 'mariadb');
        for ($i = 1; $i <= 2500; $i++) {
            $w->insert('t', ['id' => $i]);
        }
        $w->close();
        $this->assertSame(3, substr_count(file_get_contents($path), 'INSERT INTO `t`'));
        $this->assertSame(2500, $w->counts()['t']);
    }

    public function test_commits_every_twenty_chunks_on_mariadb_only(): void
    {
        $path = $this->tmp();
        $w = new SqlWriter($path, 'mariadb');
        for ($i = 1; $i <= 45000; $i++) {
            $w->insert('t', ['id' => $i]);
        }
        $w->close();
        $sql = file_get_contents($path);
        // 45 chunks: after chunk 20 and 40, plus the closing commit
        $this->assertSame(3, substr_count($sql, "COMMIT;\n"));

        $path2 = $this->tmp();
        $w2 = new SqlWriter($path2, 'sqlite');
        for ($i = 1; $i <= 45000; $i++) {
            $w2->insert('t', ['id' => $i]);
        }
        $w2->close();
        $this->assertStringNotContainsString('COMMIT;', file_get_contents($path2));
    }

    public function test_escapes_quotes_backslashes_and_unicode(): void
    {
        $row = ['name' => "O'Brien \\ ทดสอบ", 'data' => ['k' => 'ทดสอบ']];

        $path = $this->tmp();
        $w = new SqlWriter($path, 'mariadb');
        $w->insert('t', $row);
        $w->close();
        $sql = file_get_contents($path);
        $this->assertStringContainsString("'O''Brien \\\\ ทดสอบ'", $sql);
        $this->assertStringContainsString("'{\"k\":\"\\\\u0e17\\\\u0e14\\\\u0e2a\\\\u0e2d\\\\u0e1a\"}'", $sql);

        $path2 = $this->tmp();
        $w2 = new SqlWriter($path2, 'sqlite');
        $w2->insert('t', $row);
        $w2->close();
        $sql2 = file_get_contents($path2);
        $this->assertStringContainsString("'O''Brien \ ทดสอบ'", $sql2);
        $this->assertStringContainsString("'{\"k\":\"\u0e17\u0e14\u0e2a\u0e2d\u0e1a\"}'", $sql2);
    }

    public function test_rejects_rows_with_different_columns(): void
    {
        $w = new SqlWriter($this->tmp(), 'sqlite');
        $w->insert('t', ['a' => 1]);
        $this->expectException(InvalidArgumentException::class);
        $w->insert('t', ['b' => 1]);
    }

    public function test_update_flushes_pending_rows_first(): void
    {
        $path = $this->tmp();
        $w = new SqlWriter($path, 'mariadb');
        $w->insert('t', ['id' => 1, 'a' => null]);
        $w->update('t', ['a' => 5], ['id' => 1]);
        $w->close();
        $sql = file_get_contents($path);
        $this->assertStringContainsString('UPDATE `t` SET `a`=5 WHERE `id`=1;', $sql);
        $this->assertLessThan(strpos($sql, 'UPDATE `t`'), strpos($sql, 'INSERT INTO `t`'));
        $this->assertSame(1, substr_count($sql, 'INSERT INTO `t`'));
    }

    public function test_formats_null_bool_and_carbon(): void
    {
        $path = $this->tmp();
        $w = new SqlWriter($path, 'sqlite');
        $w->insert('t', ['a' => null, 'b' => true, 'c' => false, 'd' => CarbonImmutable::parse('2024-05-06 09:30:00')]);
        $w->close();
        $this->assertStringContainsString("VALUES (NULL,1,0,'2024-05-06 09:30:00');", file_get_contents($path));
    }
}
