// ordinary comment
const text =
    \\  two leading spaces
    \\// literal comment marker
    \\
    \\あ😀 literal \n and \\ text
;

test "multiline raw text" {
    const expected = "  two leading spaces\n// literal comment marker\n\nあ😀 literal \\n and \\\\ text";
    if (!@import("std").mem.eql(u8, text, expected)) return error.UnexpectedText;
}
