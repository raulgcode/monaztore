import { connect } from "node:net";

/** Host and port of a Postgres URL, the way `pg` reads them (5432 when the URL has none). */
export function databaseAddress(url: string): { host: string; port: number } | undefined {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("postgres")) return undefined;
    const host = parsed.hostname.replace(/^\[|\]$/g, "") || "localhost";
    return { host, port: parsed.port ? Number(parsed.port) : 5432 };
  } catch {
    return undefined;
  }
}

/** Whether something accepts TCP connections at that address within the timeout. */
export function isListening(address: { host: string; port: number }, timeoutMs = 2000) {
  return new Promise<boolean>((resolve) => {
    const socket = connect(address);
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
