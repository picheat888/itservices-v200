<?php

namespace Tests\Feature\Auth;

use App\Services\Auth\LoginEventRecorder;
use Tests\TestCase;

// A name typed at sign-in that matches no account is kept with its last 4 characters hidden once it is 8 or more
// characters long (a password is never shorter).
class TypedNameMaskTest extends TestCase
{
    public function test_the_last_four_characters_are_hidden_from_eight_characters_up(): void
    {
        $this->assertSame('Inaba@2••••', LoginEventRecorder::maskTail('Inaba@2026!'));
        $this->assertSame('Abcd••••', LoginEventRecorder::maskTail('Abcd12!x'));
        $this->assertSame('สมชาย••••', LoginEventRecorder::maskTail('สมชายใจดี'));
    }

    public function test_text_shorter_than_a_password_is_kept_as_typed(): void
    {
        $this->assertSame('somchai', LoginEventRecorder::maskTail('somchai'));
        $this->assertSame('admin', LoginEventRecorder::maskTail('admin'));
        $this->assertSame('abc', LoginEventRecorder::maskTail('abc'));
        $this->assertSame('', LoginEventRecorder::maskTail(''));
    }
}
