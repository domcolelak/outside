# Dependency and licence inventory

The deployable application is pinned by `package-lock.json`; the Terraform provider is pinned by `go.mod` and must add a generated `go.sum` before its first tagged release. CI installs Node dependencies with `npm ci`, rejects high-severity production advisories, and runs the repository licence policy.

`npm run audit:licenses` evaluates every locked Node package. GPL, AGPL, SSPL, and BUSL families are denied by policy. LGPL, MPL, Apache, BSD, ISC, MIT, CC, BlueOak, Python-2.0, and Zlib-family packages require preservation of their notices and any licence-specific obligations in distributed artifacts. `png-js` omits SPDX metadata from its package manifest; its bundled `LICENSE` is MIT and is explicitly documented by the audit override.

The LGPL entries in the current lock are platform-specific `libvips` binaries distributed through `sharp`; the MPL entries are `axe-core` and `lightningcss` platform packages. They are not OUTSIDE source-code licences, but binary/source-offer and notice obligations still depend on the shipping model. The CI audit covers development dependencies as well as production dependencies because build tooling is part of the software supply chain.

This automated inventory is an engineering control, not legal advice. Before commercial distribution or acquisition, counsel should review the exact shipping model, native binaries, fonts, media, container base image, Terraform dependencies, and third-party service terms. Re-run the audit after every lockfile change.
