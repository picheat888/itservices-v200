// Fills {name} placeholders in the asset import's on-screen words. Pure logic.

const THAI = /[฀-๿]/;
const LATIN_OR_DIGIT = /[\p{Script=Latin}0-9]/u;

/**
 * The words with each {name} replaced by its value; a name with no value becomes blank. Thai copy writes a
 * column or place name straight after a Thai word ("ต้องกรอก{column}"), so a value that starts or ends with a
 * Latin letter or digit gets a space where it meets a Thai letter ("ต้องกรอก Serial"). Only the inserted
 * values are spaced; the words around them stay as written.
 */
export function fillWords(template: string, values: Record<string, string | undefined>): string {
    return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string, at: number) => {
        const value = values[name] ?? '';
        if (value === '') return '';
        const before = template[at - 1];
        const after = template[at + placeholder.length];
        const spaceBefore = before !== undefined && THAI.test(before) && LATIN_OR_DIGIT.test(value[0]);
        const spaceAfter = after !== undefined && THAI.test(after) && LATIN_OR_DIGIT.test(value[value.length - 1]);
        return `${spaceBefore ? ' ' : ''}${value}${spaceAfter ? ' ' : ''}`;
    });
}
