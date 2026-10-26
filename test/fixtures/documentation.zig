//! # Container
//!
//! A container with あ😀 documentation.
// ordinary comment
//// four slashes are ordinary
/// # Record
///
/// ```zig
/// const answer = 42;
/// ```
const Record = struct {
    /// Field documentation.
    field: u8,
};
const quoted = "/// ordinary string";
const raw =
    \\//! ordinary multiline text
;
