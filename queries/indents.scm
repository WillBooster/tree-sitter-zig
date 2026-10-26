[
  (block)
  (switch_expression)
  (initializer_list)
] @indent.begin

(block
  "}" @indent.end)

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @indent.branch

[
  (comment)
  (doc_comment)
  (container_doc_comment)
  (multiline_string)
] @indent.ignore
