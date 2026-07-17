const requiredNames = [
  "RELEASE_VERSION",
  "RELEASE_COMMIT",
  "RELEASE_BUILD_TIME",
  "RELEASE_CI_URL",
  "RELEASE_SCHEMA_VERSION",
  "RELEASE_APP_IMAGE_ID",
  "RELEASE_APP_ARCHIVE_SHA256",
  "RELEASE_MIGRATOR_IMAGE_ID",
  "RELEASE_MIGRATOR_ARCHIVE_SHA256",
  "RELEASE_TERRAFORM_SHA256",
];

const values = Object.fromEntries(
  requiredNames.map((name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required to create a release manifest.`);
    return [name, value];
  }),
);

const manifest = {
  schema: "com.outside.release-manifest/v1",
  applicationVersion: values.RELEASE_VERSION,
  terraformProviderVersion: values.RELEASE_VERSION,
  gitCommit: values.RELEASE_COMMIT,
  buildTimestamp: values.RELEASE_BUILD_TIME,
  verifiedCiRun: values.RELEASE_CI_URL,
  databaseSchemaVersion: values.RELEASE_SCHEMA_VERSION,
  artifacts: {
    applicationContainer: {
      imageId: values.RELEASE_APP_IMAGE_ID,
      archive: `outside-${values.RELEASE_VERSION}.docker.tar.gz`,
      archiveSha256: values.RELEASE_APP_ARCHIVE_SHA256,
    },
    migrationContainer: {
      imageId: values.RELEASE_MIGRATOR_IMAGE_ID,
      archive: `outside-migrator-${values.RELEASE_VERSION}.docker.tar.gz`,
      archiveSha256: values.RELEASE_MIGRATOR_ARCHIVE_SHA256,
    },
    terraformProvider: {
      platform: "linux_amd64",
      archive: `terraform-provider-outside_${values.RELEASE_VERSION}_linux_amd64.zip`,
      archiveSha256: values.RELEASE_TERRAFORM_SHA256,
    },
  },
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
