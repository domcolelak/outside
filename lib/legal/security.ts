export const SECURITY_UPDATED = "24 July 2026";

export const SECURITY_BODY = `
Security is central to the purpose and operation of OUTSIDE.

OUTSIDE is designed to help organizations understand their externally visible infrastructure, identify evidence-backed exposure and monitor meaningful changes over time. Because the platform handles security-sensitive information, we apply defense-in-depth principles across product development, infrastructure, access control and operations.

This page describes our current security approach. It is not a certification, warranty or guarantee that every security risk can be prevented.

For security questions or responsible vulnerability disclosure, contact security@outsideguardian.eu.

## 1. Security principles

**Evidence before assertion.** OUTSIDE distinguishes directly observed evidence from inference, context and potential concern. The platform is designed not to describe a system as compromised, exploitable or non-compliant without adequate supporting evidence.

**Least privilege.** Access should be limited to the minimum permissions necessary for a user, service or process to perform its function.

**Tenant separation.** Customer organizations, assets, scans, findings, reports and administrative actions are logically separated and governed by authorization controls.

**Passive by default.** OUTSIDE is designed primarily for public-source discovery and bounded external observation. Features that require verification, authenticated access, provider integration or more active interaction are subject to additional authorization controls.

**Human control.** Automated findings and AI-assisted explanations support human decision-making. OUTSIDE does not treat AI output as proof of exploitation, compromise or regulatory compliance.

**Secure defaults.** Security-sensitive features should default to the more restrictive state unless a customer deliberately enables additional functionality.

## 2. Application security

Security controls used in the application may include:

- authenticated sessions;
- organization-based authorization;
- role-based access control;
- server-side permission checks;
- input validation;
- output encoding;
- request-size limits;
- rate limiting;
- bounded timeouts;
- secure error handling;
- protection against unauthorized cross-tenant access;
- audit logging of sensitive actions;
- protection of administrative routes;
- dependency review and automated testing.

Authorization decisions are intended to be enforced on the server and not solely through the user interface.

## 3. Domain and target authorization

OUTSIDE should be used only for systems the customer owns or is authorized to assess.

Certain functionality may require domain verification before monitoring, active observation, integrations or sensitive operations are enabled.

Verification methods may include:

- DNS verification;
- email verification;
- hosted-file verification;
- provider-account integration;
- another appropriate ownership or control signal.

Customers remain responsible for ensuring that their use is legally and contractually authorized.

## 4. Safe network access

External requests initiated by OUTSIDE are designed to be bounded and controlled.

Protections may include:

- domain and hostname normalization;
- rejection of unsupported targets;
- blocking of private, loopback, link-local and reserved IP ranges;
- validation of resolved addresses;
- redirect limits;
- request timeouts;
- response-size limits;
- restricted protocols;
- DNS rebinding defenses;
- outbound-request logging;
- prevention of access to cloud metadata services.

These controls are intended to reduce server-side request-forgery and unintended network-access risks.

## 5. Encryption

OUTSIDE uses encrypted transport for supported production traffic.

Security-sensitive information should be protected:

- in transit using TLS;
- through restricted database and infrastructure access;
- through secrets-management practices;
- through provider-supported encryption at rest where available.

Customers are responsible for securely configuring third-party integrations and protecting exported reports or credentials outside OUTSIDE.

## 6. Authentication and access control

Our access-control approach may include:

- unique user accounts;
- protected session handling;
- role-based organization permissions;
- restricted administrative access;
- session invalidation;
- account and access audit events;
- authentication rate limits;
- optional enterprise identity integrations where enabled.

Customers should:

- use unique credentials;
- use strong passwords;
- enable available multi-factor authentication or single sign-on;
- remove former personnel promptly;
- review organization membership regularly;
- avoid sharing accounts;
- secure email accounts used for password recovery.

## 7. Infrastructure security

Production infrastructure is intended to use:

- separated application and database services;
- restricted network exposure;
- non-root application containers where supported;
- environment-specific configuration;
- managed secrets;
- health checks;
- resource limits;
- logging and monitoring;
- controlled deployment workflows;
- backup and recovery procedures;
- minimal administrative access.

Infrastructure configuration may differ by deployment model, region and service provider.

## 8. Secure software development

Security is integrated into the software-development lifecycle.

Controls may include:

- code review;
- type checking;
- linting;
- unit tests;
- integration tests;
- browser-level tests;
- database migration testing;
- container-build verification;
- infrastructure validation;
- dependency scanning;
- secret scanning;
- protected deployment workflows;
- separation between development and production environments.

Security fixes may be prioritized outside the normal product-release schedule.

## 9. Vulnerability and dependency management

We monitor security issues affecting:

- application dependencies;
- container images;
- runtime environments;
- infrastructure components;
- third-party providers;
- supported integrations.

Reported or detected vulnerabilities are evaluated according to factors such as:

- exploitability;
- exposure;
- affected functionality;
- data sensitivity;
- customer impact;
- availability of mitigation;
- active exploitation.

Remediation priority is based on risk rather than severity labels alone.

## 10. Logging and monitoring

We may log security-relevant activity such as:

- authentication events;
- failed access attempts;
- permission-sensitive actions;
- scan creation;
- domain verification;
- integration changes;
- billing administration;
- report access;
- administrative actions;
- application errors;
- anomalous request patterns.

Logs are protected from ordinary customer modification and retained only for an appropriate operational, legal and security period.

Logs are not intended to capture unnecessary secrets or full sensitive payloads.

## 11. Backups and recovery

We maintain backup and recovery procedures appropriate to the deployment environment.

These may include:

- scheduled database backups;
- provider-level redundancy;
- retention controls;
- restricted backup access;
- recovery testing;
- documented restoration procedures.

No backup system eliminates all risk. Customers should retain copies of reports or data required for their own legal, regulatory or business-continuity obligations.

## 12. Incident response

Our incident-response process is designed to support:

1. detection and triage;
2. containment;
3. investigation;
4. remediation;
5. recovery;
6. customer and regulatory notification where required;
7. post-incident review.

Where an incident affects customer data or service security, we will assess notification obligations based on applicable law, contractual commitments and the nature of the incident.

We may request customer cooperation where an incident is connected to customer credentials, integrations or systems.

## 13. Data minimization

We aim to process only information reasonably necessary to provide and secure the service.

Security measures may include:

- minimizing transmitted AI context;
- redacting sensitive values where technically feasible;
- limiting access to production data;
- separating customer and public technical data;
- avoiding unnecessary storage of payment-card information;
- configurable retention;
- deletion or anonymization after the applicable retention period.

## 14. AI security and limitations

AI-assisted features are intended to explain or summarize evidence already available to the platform.

They are not designed to:

- autonomously exploit systems;
- execute remediation in customer environments;
- declare a confirmed compromise without evidence;
- certify regulatory compliance;
- replace qualified security review.

AI output may be inaccurate and must be reviewed before action is taken.

Where supported, prompts and context are minimized and passed through a controlled service layer rather than directly from the browser.

## 15. Third-party risk

OUTSIDE depends on selected third-party providers for functions such as:

- infrastructure;
- databases;
- email delivery;
- payments;
- threat and vulnerability intelligence;
- authentication;
- AI-assisted explanations;
- monitoring.

We evaluate providers based on the nature of the service and associated risk.

A third-party outage or security incident may affect OUTSIDE. We maintain reasonable controls but cannot guarantee the security or availability of an independent provider.

## 16. Customer responsibilities

Security is shared between OUTSIDE and the customer.

Customers are responsible for:

- using OUTSIDE only on authorized targets;
- maintaining secure credentials;
- managing user access;
- protecting API keys and webhook secrets;
- securely configuring integrations;
- reviewing findings before acting;
- applying appropriate remediation;
- keeping their own infrastructure patched;
- retaining required exports;
- promptly reporting suspicious activity;
- complying with applicable law.

OUTSIDE does not replace the customer's own security controls, vulnerability management, incident response or professional advice.

## 17. Responsible vulnerability disclosure

We welcome responsible reports from security researchers and users.

ENISA describes coordinated vulnerability disclosure as a process that enables affected parties to develop a fix or mitigation before wider public disclosure.

Send vulnerability reports to security@outsideguardian.eu.

Please include:

- a clear description of the issue;
- affected URL, component or endpoint;
- reproduction steps;
- proof of concept where safe;
- potential impact;
- relevant logs, screenshots or request samples;
- your preferred contact information.

### Please do not

When researching or reporting a vulnerability, do not:

- access data belonging to another user or organization;
- download more data than necessary to demonstrate the issue;
- modify or delete data;
- create persistent access;
- deploy malware;
- perform denial-of-service testing;
- disrupt production;
- use automated scanning that creates excessive traffic;
- test third-party systems not operated by us;
- publicly disclose an unresolved issue before we have had a reasonable opportunity to investigate.

### Good-faith research

Where you act in good faith, avoid harm, respect privacy, remain within the scope of our systems, report the issue promptly and give us reasonable time to respond, we will make reasonable efforts to treat your activity as authorized security research and not pursue legal action solely because of the report.

This statement does not authorize activity prohibited by law, access to third-party systems or activity outside the stated scope.

### No automatic bounty

OUTSIDE does not operate a guaranteed bug-bounty program unless explicitly announced in writing.

Submission of a report does not create an entitlement to payment, reward, employment, public credit or reimbursement.

## 18. Disclosure process

After receiving a credible report, we aim to:

- acknowledge receipt;
- assess scope and severity;
- request additional information where necessary;
- develop mitigation or remediation;
- coordinate disclosure where appropriate;
- communicate material progress where reasonably possible.

Response and remediation times depend on complexity, impact, reproducibility and affected dependencies.

We may not disclose details that would create additional security risk, violate law or expose customer information.

## 19. Security documentation

Enterprise or due-diligence materials may be made available under appropriate confidentiality terms.

Depending on maturity and availability, these may include:

- architecture documentation;
- data-flow information;
- access-control descriptions;
- backup and recovery procedures;
- subprocessor information;
- secure-development practices;
- incident-response information;
- test or assessment summaries.

The availability of documentation does not constitute a certification unless expressly stated.

## 20. Compliance statements

OUTSIDE does not claim a certification, audit result or regulatory-compliance status unless that claim is expressly documented and current.

Using OUTSIDE may support a customer's security or compliance activities, but does not by itself make the customer compliant with any law, standard or framework.

## 21. Changes to this page

We may update this Security page as the service, architecture, controls or legal requirements evolve.

The latest version will be published here with an updated revision date.

## 22. Contact

For security questions, due diligence or vulnerability disclosure:

**VeDomEll s. r. o.**

Alžbetina 55, 040 01 Košice – mestská časť Staré Mesto, Slovakia

IČO: 52498751 · DIČ: 2121045729 · IČ DPH: SK2121045729

security@outsideguardian.eu
`;
