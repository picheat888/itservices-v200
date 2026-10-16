<?php

// How SearchTerms cleans and splits what people type into a search box.

namespace Tests\Unit\Support;

use App\Support\SearchTerms;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class SearchTermsTest extends TestCase
{
    /** @return iterable<string, array{mixed, list<string>}> */
    public static function wordCases(): iterable
    {
        yield 'thai full name' => ['สมชาย ใจดี', ['สมชาย', 'ใจดี']];
        yield 'english' => ['Somchai Jaidee', ['Somchai', 'Jaidee']];
        yield 'mixed thai and english' => ['สมชาย IT', ['สมชาย', 'IT']];
        yield 'extra spaces, tabs and new lines' => ["  สมชาย \t\n  ใจดี  ", ['สมชาย', 'ใจดี']];
        yield 'no-break and ideographic spaces' => ["สมชาย\u{00A0}ใจดี\u{3000}IT", ['สมชาย', 'ใจดี', 'IT']];
        yield 'zero-width characters pasted from Word' => ["สม\u{200B}ชาย\u{FEFF} ใจ\u{200D}ดี", ['สมชาย', 'ใจดี']];
        yield 'thai without spaces stays one word' => ['สมชายใจดี', ['สมชายใจดี']];
        yield 'duplicates dropped, case-insensitive' => ['Office office OFFICE word', ['Office', 'word']];
        yield 'special characters kept' => ['100% a_b ! @#', ['100%', 'a_b', '!', '@#']];
        yield 'empty' => ['', []];
        yield 'only spaces' => ["   \u{00A0} ", []];
        yield 'only zero-width' => ["\u{200B}\u{FEFF}", []];
        yield 'null' => [null, []];
        yield 'array from ?search[]=' => [['x'], []];
        yield 'number' => [42, []];
    }

    /** @param  list<string>  $expected */
    #[DataProvider('wordCases')]
    public function test_words(mixed $input, array $expected): void
    {
        $this->assertSame($expected, SearchTerms::words($input));
    }

    public function test_at_most_six_words_are_kept(): void
    {
        $this->assertSame(['a', 'b', 'c', 'd', 'e', 'f'], SearchTerms::words('a b c d e f g h'));
    }

    public function test_input_is_cut_to_one_hundred_characters(): void
    {
        $thai = str_repeat('ก', 150);

        $this->assertSame(SearchTerms::MAX_LENGTH, mb_strlen(SearchTerms::normalize($thai)));
        $this->assertSame([str_repeat('ก', 100)], SearchTerms::words($thai));
    }

    public function test_like_escapes_wildcards_and_the_escape_character(): void
    {
        $this->assertSame('%สมชาย%', SearchTerms::like('สมชาย'));
        $this->assertSame('%100!%%', SearchTerms::like('100%'));
        $this->assertSame('%a!_b%', SearchTerms::like('a_b'));
        $this->assertSame('%wow!!%', SearchTerms::like('wow!'));
    }
}
