import { describe, expect, it } from "vitest";
import {
  isPortableRuntimeValue,
  portableAccountToSession,
  shouldInitializeBrowserAdmin,
  stablePortableUserId,
} from "../client/src/lib/portable-runtime";

describe("portable runtime", () => {
  it("only enables portable mode for an explicit true value", () => {
    expect(isPortableRuntimeValue("true")).toBe(true);
    expect(isPortableRuntimeValue("TRUE")).toBe(true);
    expect(isPortableRuntimeValue("false")).toBe(false);
    expect(isPortableRuntimeValue(undefined)).toBe(false);
  });

  it("creates stable positive numeric IDs for browser-local accounts", () => {
    const first = stablePortableUserId("user-123");
    const second = stablePortableUserId("user-123");
    const other = stablePortableUserId("user-456");

    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
    expect(other).not.toBe(first);
  });

  it("maps a local account to the existing session contract", () => {
    const loginTime = new Date("2026-08-09T12:00:00.000Z");
    const session = portableAccountToSession(
      {
        username: "Wagii",
        userId: "admin-local",
        isAdmin: true,
      },
      loginTime
    );

    expect(session).toEqual({
      userId: stablePortableUserId("admin-local"),
      userName: "Wagii",
      isAdmin: true,
      loginTime,
    });
  });

  it("does not create a predictable browser-local admin without a configured password", () => {
    expect(shouldInitializeBrowserAdmin(undefined)).toBe(false);
    expect(shouldInitializeBrowserAdmin("  ")).toBe(false);
    expect(shouldInitializeBrowserAdmin("configured-secret")).toBe(true);
    expect(shouldInitializeBrowserAdmin("configured-secret", true)).toBe(false);
  });
});
