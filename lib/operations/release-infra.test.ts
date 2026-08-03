import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const text = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

describe("release infrastructure contracts", () => {
  it("deploys one clean fetched commit with immutable provenance and mandatory migrations", async () => {
    const source = await text("ops/staging/deploy.sh");
    const checkout = source.indexOf('git reset --hard "$deploy_ref"');
    const version = source.indexOf("APP_VERSION=");

    expect(source).toContain('git fetch --depth 1 --no-tags origin "$remote_ref"');
    expect(source).toContain('git update-ref "$deploy_ref" "$fetched_commit"');
    expect(checkout).toBeGreaterThan(0);
    expect(version).toBeGreaterThan(checkout);
    expect(source).toContain('local_tag="${safe_version}-local-${GIT_SHA:0:12}"');
    expect(source).toContain('docker build --target runner "${BUILD_ARGS[@]}" -t "$OUTSIDE_IMAGE" .');
    expect(source).toContain('docker build --target migrator "${BUILD_ARGS[@]}" -t "$OUTSIDE_MIGRATOR_IMAGE" .');
    expect(source).toContain('"${COMPOSE[@]}" up -d --force-recreate migrate app');
    expect(source).toContain("body.release?.commit!==process.env.EXPECTED_GIT_SHA");
    expect(source).not.toContain('docker build --target runner "${BUILD_ARGS[@]}" -t "$CONFIGURED_APP_IMAGE"');
  });

  it("validates the public certificate while probing Caddy on the internal network", async () => {
    const compose = await text("ops/staging/compose.public.yaml");
    const prometheus = await text("ops/staging/observability/prometheus.yaml");

    expect(prometheus).toContain('targets: ["https://caddy/api/readyz"]');
    expect(compose).toContain("Host: ${STAGING_DOMAIN:?Set STAGING_DOMAIN to the public hostname}");
    expect(compose).toContain("server_name: ${STAGING_DOMAIN:?Set STAGING_DOMAIN to the public hostname}");
    expect(compose).toContain("insecure_skip_verify: false");
    expect(compose).toContain("target: /etc/blackbox_exporter/config.yaml");
  });

  it("runs production-like validation for routing, instrumentation and Next configuration changes", async () => {
    const workflow = await text(".github/workflows/launch-validation.yml");
    expect(workflow).toContain('- "proxy.ts"');
    expect(workflow).toContain('- "instrumentation.ts"');
    expect(workflow).toContain('- "next.config.*"');
  });
});
