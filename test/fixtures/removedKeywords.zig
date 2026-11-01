const async = 1;
const await = async + 1;
const usingnamespace = await + 1;
const Fields = struct { usingnamespace: u8, async: u8, await: u8 };
const Tags = enum { usingnamespace, async, await };
fn inspect(value: Fields) u8 {
    return value.usingnamespace + usingnamespace;
}
