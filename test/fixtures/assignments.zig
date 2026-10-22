const Record = struct {
    value: u32,
    @"escaped-name": u32,
    nested: struct { count: u32 },
};

pub fn update(flag: bool) !void {
    var left: u32 = 0;
    var right: u32 = 0;
    defer left += 1;
    defer left, right = .{ right, left };
    errdefer right += 1;
    errdefer left, right = .{ right, left };
    if (flag) left, right = .{ 1, 2 } else left += 3;
    while (left < 4) : (left += 1) right += left;
    while (flag) : (left, right = .{ right, left }) { break; }
    for ([_]u32{ 1, 2 }) |value| left += value;
    switch (left) {
        0 => left = 1,
        else => right += 1,
    }
    left, right = .{ right, left };
    const added, right = .{ 3, 4 };
    left, var other = .{ 5, 6 };
    other += 1;
    const result = Record{
        .value = left,
        .@"escaped-name" = right,
        .nested = .{ .count = other },
    };
    _ = result;
    _ = added;
}
