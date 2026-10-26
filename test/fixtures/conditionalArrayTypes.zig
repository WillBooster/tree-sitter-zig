const Plain = [2]if (true) u8 else u16;
const Sentinel = [2:0]if (false) u8 else u16;
const Nested = [2][3]if (true) u8 else u16;
const Branch = [2]if (false) [3]u8 else [4]u16;
const Grouped = [2](if (true) u8 else u16);
const Record = struct { items: [2]if (true) u8 else u16 };
fn consume(items: [2]if (false) u8 else u16) void {
    _ = items;
}
