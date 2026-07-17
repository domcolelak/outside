import packageMetadata from "@/package.json";

type ReleaseEnvironment = Partial<Record<"OUTSIDE_APP_VERSION" | "OUTSIDE_GIT_SHA" | "OUTSIDE_BUILD_TIME", string>>;

function value(input: string | undefined, fallback: string): string {
  const normalized = input?.trim();
  return normalized || fallback;
}

/** Non-secret release identity exposed through health and telemetry. */
export function releaseInfo(environment: ReleaseEnvironment = process.env) {
  return {
    version: value(environment.OUTSIDE_APP_VERSION, packageMetadata.version),
    commit: value(environment.OUTSIDE_GIT_SHA, "unknown"),
    builtAt: value(environment.OUTSIDE_BUILD_TIME, "unknown"),
  } as const;
}
