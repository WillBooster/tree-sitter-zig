fn number(fail: bool) error{Failed}!i32 {
    if (fail) return error.Failed;
    return 2;
}

fn evaluate(fail: bool) !i32 {
    const sum = try number(fail) + 1;
    const product = try number(false) * 3;
    const negative = -try number(false) + 4;
    const grouped = try (number(false));
    const conditional = try if (fail) number(true) else number(false);
    return sum + product + negative + grouped + conditional;
}

test "try prefix ownership and error propagation" {
    if (try evaluate(false) != 15) return error.BadPrecedence;
    if (evaluate(true)) |_| {
        return error.ExpectedFailure;
    } else |err| {
        if (err != error.Failed) return err;
    }
}
