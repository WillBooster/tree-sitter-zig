#include "tree_sitter/parser.h"

enum TokenType {
    DOC_COMMENT_CONTENT,
    EMPTY_DOC_COMMENT_CONTENT,
    ERROR_SENTINEL,
};

void *tree_sitter_zig_external_scanner_create(void) { return NULL; }

void tree_sitter_zig_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_zig_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload;
    (void)buffer;
    return 0;
}

void tree_sitter_zig_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    (void)payload;
    (void)buffer;
    (void)length;
}

bool tree_sitter_zig_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;
    if (valid_symbols[ERROR_SENTINEL]) return false;
    if (lexer->eof(lexer)) {
        if (!valid_symbols[EMPTY_DOC_COMMENT_CONTENT]) return false;
        lexer->result_symbol = EMPTY_DOC_COMMENT_CONTENT;
        return true;
    }
    if (!valid_symbols[DOC_COMMENT_CONTENT]) return false;
    do {
        int32_t character = lexer->lookahead;
        lexer->advance(lexer, false);
        if (character == '\n') break;
    } while (!lexer->eof(lexer));
    lexer->result_symbol = DOC_COMMENT_CONTENT;
    return true;
}
