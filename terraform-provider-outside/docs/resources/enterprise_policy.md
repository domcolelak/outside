# outside_enterprise_policy

```hcl
resource "outside_enterprise_policy" "risk" {
  org_id  = var.organization_id
  name    = "Authentication surface weighting"
  kind    = "scoring"
  enabled = true
  document = jsonencode({
    rules = [{ name = "Public authentication", severity = "high", delta = 10 }]
  })
}
```
