export const ENTERPRISE_GRAPHQL_SCHEMA = `
scalar JSON
type EnterpriseWorkspace { id: ID!, orgId: ID!, licenseStatus: String!, licensedSeats: Int!, features: [String!]!, dataRegion: String!, retention: JSON! }
type EnterpriseAuditHead { sequence: String!, hash: String! }
type EnterpriseOverview { workspace: EnterpriseWorkspace!, counts: JSON!, identityProviders: JSON!, pendingApprovals: JSON!, expiringExceptions: JSON!, integrations: JSON!, flags: JSON!, auditHead: EnterpriseAuditHead }
type EnterpriseResource { id: ID!, workspaceId: ID! }
type EnterpriseResourceConnection { items: [EnterpriseResource!]! }
type EnterpriseAuditConnection { items: JSON!, integrity: JSON! }
type Query { enterpriseOverview(orgId: ID): EnterpriseOverview!, enterpriseResources(orgId: ID, kind: String!, after: ID, first: Int): EnterpriseResourceConnection!, enterpriseAudit(orgId: ID, afterSequence: String, first: Int): EnterpriseAuditConnection! }
type Mutation { requestApproval(orgId: ID, input: JSON!): EnterpriseResource!, requestRiskException(orgId: ID, input: JSON!): EnterpriseResource! }
`;
export const PERSISTED_OPERATIONS = new Set(["EnterpriseOverview", "EnterpriseResources", "EnterpriseAudit", "RequestApproval", "RequestRiskException"]);
export function validGraphqlRequest(value: unknown): { operationName: string; variables: Record<string, unknown> } { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GraphQL request object required."); const body = value as Record<string, unknown>, operationName = typeof body.operationName === "string" ? body.operationName : "", query = typeof body.query === "string" ? body.query : ""; if (!PERSISTED_OPERATIONS.has(operationName)) throw new Error("Only documented persisted operations are accepted."); if (query && (/__schema|__type/i.test(query) || query.length > 20_000)) throw new Error("GraphQL query is not permitted."); return { operationName, variables: body.variables && typeof body.variables === "object" && !Array.isArray(body.variables) ? body.variables as Record<string, unknown> : {} }; }
