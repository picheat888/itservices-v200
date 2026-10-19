<?php

namespace Tests\Unit;

use App\Support\DatabaseBusy;
use Illuminate\Database\QueryException;
use PDOException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class DatabaseBusyTest extends TestCase
{
    /** @return array<string, array{PDOException, bool}> */
    public static function failures(): array
    {
        return [
            'too many connections' => [new PDOException('SQLSTATE[HY000] [1040] Too many connections', 1040), true],
            'max user connections' => [new PDOException('SQLSTATE[42000] [1203] User already has more than max_user_connections', 1203), true],
            'cannot connect' => [new PDOException('SQLSTATE[HY000] [2002] No connection could be made', 2002), true],
            'code only in the text' => [new PDOException('SQLSTATE[HY000] [1040] Too many connections'), true],
            'duplicate key is a real bug' => [new PDOException('SQLSTATE[23000]: Integrity constraint violation: 1062 Duplicate entry'), false],
            'unknown column is a real bug' => [new PDOException('SQLSTATE[42S22]: Column not found: 1054 Unknown column'), false],
        ];
    }

    #[DataProvider('failures')]
    public function test_only_a_full_or_unreachable_database_counts_as_busy(PDOException $pdo, bool $busy): void
    {
        $exception = new QueryException('mysql', 'select 1', [], $pdo);

        $this->assertSame($busy, DatabaseBusy::is($exception));
    }

    public function test_other_exceptions_are_never_busy(): void
    {
        $this->assertFalse(DatabaseBusy::is(new RuntimeException('SQLSTATE[HY000] [1040] Too many connections')));
    }
}
