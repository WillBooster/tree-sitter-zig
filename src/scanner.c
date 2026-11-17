#include "tree_sitter/parser.h"

enum TokenType {
    DOC_COMMENT_CONTENT,
    EMPTY_DOC_COMMENT_CONTENT,
    ERROR_SENTINEL,
    PARAMETER_NAME_COLON,
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

static inline bool at_eof(const TSLexer *lexer) { return lexer->lookahead == 0 && lexer->eof(lexer); }

static bool scan_parameter_name_colon(TSLexer *lexer) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\n' ||
           lexer->lookahead == '\r' || lexer->lookahead == '\f') {
        lexer->advance(lexer, true);
    }
    if (lexer->lookahead != ':') return false;
    lexer->advance(lexer, false);
    lexer->result_symbol = PARAMETER_NAME_COLON;
    return true;
}

bool tree_sitter_zig_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;
    if (valid_symbols[ERROR_SENTINEL]) return false;
    if (valid_symbols[PARAMETER_NAME_COLON]) return scan_parameter_name_colon(lexer);
    if (!valid_symbols[DOC_COMMENT_CONTENT] && !valid_symbols[EMPTY_DOC_COMMENT_CONTENT]) {
        return false;
    }
    if (at_eof(lexer)) {
        if (!valid_symbols[EMPTY_DOC_COMMENT_CONTENT]) return false;
        lexer->result_symbol = EMPTY_DOC_COMMENT_CONTENT;
        return true;
    }
    if (!valid_symbols[DOC_COMMENT_CONTENT]) return false;
    do {
        int32_t character = lexer->lookahead;
        lexer->advance(lexer, false);
        if (character == '\n') break;
    } while (!at_eof(lexer));
    lexer->result_symbol = DOC_COMMENT_CONTENT;
    return true;
}
