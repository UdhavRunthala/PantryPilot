import { describe, expect, it } from "vitest";
import { sameOrigin } from "../src/lib/request-security";
describe("write origin validation", () => {
  it("accepts the browser host despite an internal proxy URL", () => {
    expect(
      sameOrigin(
        new Request("http://internal:3000/api/state", {
          headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(true);
  });
  it("rejects missing, foreign, and malformed origins", () => {
    for (const origin of [
      "",
      "https://untrusted.example",
      "null",
      "file://127.0.0.1:3000",
    ]) {
      expect(
        sameOrigin(
          new Request("http://127.0.0.1:3000/api/state", {
            headers: { host: "127.0.0.1:3000", ...(origin ? { origin } : {}) },
          }),
        ),
      ).toBe(false);
    }
  });
});
