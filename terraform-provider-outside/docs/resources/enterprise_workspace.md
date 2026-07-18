# outside_enterprise_workspace

Provisions an isolated Enterprise workspace and manages its license. Destroy suspends the license; it does not delete customer evidence.

```hcl
resource "outside_enterprise_workspace" "acme" {
  org_id         = var.organization_id
  owner_user_id  = var.owner_user_id
  licensed_seats = 250
  data_region    = "eu"
}
```
