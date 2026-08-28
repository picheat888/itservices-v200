<?php

namespace Tests;

use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Clear the notification switch cache between tests.
     *
     * NotificationCatalogue holds which notifications are on in a static, which is right for a request or an
     * artisan command — both short-lived processes — but wrong for a test suite, where one
     * process runs every test. Without this, a test that switches a notification off leaves it off
     * for every later test in the run, and the failure lands somewhere unrelated and depends
     * on test order.
     */
    protected function setUp(): void
    {
        parent::setUp();

        NotificationCatalogue::forgetSwitches();
    }
}
