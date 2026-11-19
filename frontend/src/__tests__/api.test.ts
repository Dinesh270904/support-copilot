import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api";

function respond(status: number, body?: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body === undefined ? "" : JSON.stringify(body), { status })));
}
async function failure(): Promise<ApiError> {
  try {
    await api.meta();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected a failure");
}

afterEach(() => vi.unstubAllGlobals());

describe("api error kinds", () => {
  it("a 502 with no JSON body (a proxy in front of a dead backend) is the network kind", async () => {
    respond(502);
    const e = await failure();
    expect(e.kind).toBe("network");
    expect(e.message).toMatch(/API unreachable/);
  });

  it("a 504 with a non-JSON body is the network kind too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Gateway Time-out</html>", { status: 504 })));
    expect((await failure()).kind).toBe("network");
  });

  it("a backend 503 with its JSON error stays 'unavailable' and keeps its message and request ID", async () => {
    respond(503, { error: { code: "assistant_unavailable", message: "The assistant tool server is unavailable.", request_id: "abc123abc123" } });
    const e = await failure();
    expect(e.kind).toBe("unavailable");
    expect(e.message).toBe("The assistant tool server is unavailable.");
    expect(e.requestId).toBe("abc123abc123");
  });

  it("a failed fetch is the network kind", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect((await failure()).kind).toBe("network");
  });

  it("a 500 with no body stays a server error", async () => {
    respond(500);
    expect((await failure()).kind).toBe("server");
  });
});
