---
page_title: "Provider: OUTSIDE"
description: "Manage OUTSIDE Enterprise licensing and governance as code."
---

# OUTSIDE Provider

The provider uses a scoped `out_enterprise_…` token for workspace resources. The separate platform provisioning token is only required by `outside_enterprise_workspace` and should be supplied through environment variables.

```hcl
terraform {
  required_providers {
    outside = { source = "outside/outside" }
  }
}

provider "outside" {
  endpoint = "https://outside.example"
  token    = var.outside_token
}
```

Never commit either token to source control. Prefer `OUTSIDE_TOKEN` and `OUTSIDE_PROVISIONING_TOKEN` in the deployment environment.
