import { describe, expect, it } from "vitest";

import { securityHeaders } from "./security-headers";

describe("安全响应头", () => {
  it("限制脚本、嵌入、内容嗅探与浏览器权限", () => {
    const headers = Object.fromEntries(
      securityHeaders.map(({ key, value }) => [key, value]),
    );

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("'wasm-unsafe-eval'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Permissions-Policy"]).toContain("microphone=(self)");
  });
});
