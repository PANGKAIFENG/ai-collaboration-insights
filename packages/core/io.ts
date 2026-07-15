const encoder = new TextEncoder();

export async function atomicWriteText(path: string, content: string, mode = 0o600): Promise<void> {
  const tempPath = `${path}.tmp-${crypto.randomUUID()}`;
  try {
    await Deno.writeFile(tempPath, encoder.encode(content), { createNew: true, mode });
    await Deno.rename(tempPath, path);
    await Deno.chmod(path, mode);
  } catch (error) {
    try {
      await Deno.remove(tempPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await Deno.readTextFile(path)) as T;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return fallback;
    throw error;
  }
}

interface LockOwner {
  pid: number;
  startedAt: string;
  version: string;
}

function processExists(pid: number): boolean {
  try {
    Deno.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Deno.errors.NotFound);
  }
}

export async function acquireReportLock(
  lockDir: string,
  version: string,
  ttlMs = 2 * 60 * 60 * 1000,
): Promise<() => Promise<void>> {
  const ownerFile = `${lockDir}/owner.json`;
  try {
    await Deno.mkdir(lockDir);
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
    let stale = false;
    try {
      const owner = JSON.parse(await Deno.readTextFile(ownerFile)) as LockOwner;
      stale = !processExists(owner.pid) || Date.now() - Date.parse(owner.startedAt) > ttlMs;
    } catch {
      stale = true;
    }
    if (!stale) throw new Error("ACI_REPORT_LOCKED: another report is running");
    await Deno.remove(lockDir, { recursive: true });
    await Deno.mkdir(lockDir);
  }
  await Deno.writeTextFile(
    ownerFile,
    `${JSON.stringify({ pid: Deno.pid, startedAt: new Date().toISOString(), version })}\n`,
    { mode: 0o600 },
  );
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await Deno.remove(lockDir, { recursive: true });
  };
}

export async function sha256(value: string | Uint8Array): Promise<string> {
  const source = typeof value === "string" ? encoder.encode(value) : value;
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
