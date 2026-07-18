# OUTSIDE Enterprise operations

## Provisioning and licensing

Apply the migration chain before provisioning. Configure `ENTERPRISE_ENCRYPTION_KEY`, `ENTERPRISE_PROVISIONING_TOKEN`, `AUDIT_IP_SALT`, `OUTSIDE_DATA_REGION`, and the normal production secrets. The platform provisioning API is intentionally separate from user and workspace API tokens:

```http
POST /api/enterprise/provisioning
Authorization: Bearer <platform token>
Content-Type: application/json

{"orgId":"…","ownerUserId":"…","licensedSeats":250,"dataRegion":"eu"}
```

The selected owner must already hold the core organization `owner` role. A Terraform resource wraps this API. License destroy semantics suspend access; they never delete evidence.

## Identity

Login domains must already be verified by the owning organization. An identity provider can be staged with enforcement disabled, tested, and then enforced. Keep at least one named break-glass account in `ENTERPRISE_BREAK_GLASS_EMAILS` and protect it operationally.

OIDC requires issuer, authorization endpoint, token endpoint, JWKS URI, client ID and client secret. SAML uses the same callback through an audited broker that translates signed SAML assertions to OIDC. Direct SAML XML is not accepted.

SCIM base URL is `/api/enterprise/scim/v2`. The implementation supports Users, Groups, PATCH, filtering, pagination, ServiceProviderConfig, ResourceTypes and Schemas. SCIM deactivation revokes application sessions. Active directory users cannot exceed licensed seats.

## APIs and governance

Use `/api/enterprise/v1` for automation. Tokens carry explicit permissions and optional scopes such as `assetIds` or `findingIds`. GraphQL exposes persisted operations only; fetch `/api/enterprise/graphql` for its schema.

Approval policies list protected action names such as `enterprise.policies.deleted`. A matching approved workflow decision must reference the resource ID. Requesters cannot approve their own decisions or exceptions. Scoring rules only adjust deterministic input and remain bounded to a 0–100 score.

## Integrations

All provider credentials are encrypted. Delivery is asynchronous through `/api/cron/enterprise`. Run it at least once per minute for low-latency SIEM and ticket routing. Provider destinations must use HTTPS on port 443 and resolve exclusively to public IP addresses.

Inbound ticket synchronization uses `/api/enterprise/ticket-sync/{provider}` with:

- `x-outside-integration-id`
- `x-outside-timestamp` (Unix seconds, maximum five-minute skew)
- `x-outside-signature: v1=<HMAC-SHA256(timestamp.body)>`

Configure `inboundSecret` on the integration and have the provider automation emit these headers.

## Data lifecycle and residency

Operational delivery and ticket history follows workspace retention controls with enforced minimums. The audit stream is append-only; a retention policy cannot silently mutate it. Large audit exports should use scheduled, segmented exports. A regional deployment only serves workspaces with a matching `OUTSIDE_DATA_REGION`; use an explicit migration procedure to change residency.

Compliance reports map observed configuration to SOC 2, ISO 27001, NIS2 and DORA evidence areas. They are review aids and never state that an organization is certified or compliant.
