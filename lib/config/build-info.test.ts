import { describe, expect, it } from "vitest";

import { releaseInfo } from "./build-info";

describe("release identity", () => {
  it("uses immutable container metadata when supplied", () => {
    expect(
      releaseInfo({
        OUTSIDE_APP_VERSION: "0.2.0-rc.1",
        OUTSIDE_GIT_SHA: "abc123",
        OUTSIDE_BUILD_TIME: "2026-07-17T10:00:00Z",
      }),
    ).toEqual({
      version: "0.2.0-rc.1",
      commit: "abc123",
      builtAt: "2026-07-17T10:00:00Z",
    });
  });

  it("falls back to package metadata without inventing a commit", () => {
    expect(releaseInfo({})).toEqual({
      version: "0.2.0-rc.1",
      commit: "unknown",
      builtAt: "unknown",
    });
  });
});
