export function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(actual: T, expected: T): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

export async function assertRejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error, "expected Error");
    assert(pattern.test(error.message), `expected ${error.message} to match ${pattern}`);
    return;
  }
  throw new Error("expected promise to reject");
}
