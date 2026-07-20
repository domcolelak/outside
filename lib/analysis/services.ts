/**
 * Findings from Censys-observed services (lib/discovery/censys.ts attaches
 * attrs.exposedServices). Turns internet-exposed non-web services — databases,
 * remote administration, file sharing — into scored, evidence-grounded findings.
 * Web ports are ignored here: they are already covered by the HTTPS observation
 * path. Absent on scans without Censys enrichment, so demo/anonymous scans
 * produce nothing. Framed honestly: a service observed on the resolved address,
 * not proof of a reachable-and-vulnerable service on this specific system.
 */

import type { Asset, Finding, Priority } from "@/lib/types";

// Ports already represented by the HTTPS observation path — not re-flagged here.
const WEB_PORTS = new Set([80, 443, 8080, 8443, 8000, 8888, 3000]);

interface Risk {
  priority: Priority;
  kind: string;
}

/** Classify a non-web exposed port. Returns null for benign/web/unknown-low ports. */
function classify(port: number): Risk | null {
  // Databases and datastores that should never face the public internet.
  const datastores: Record<number, string> = {
    3306: "MySQL/MariaDB", 5432: "PostgreSQL", 27017: "MongoDB", 27018: "MongoDB",
    6379: "Redis", 9200: "Elasticsearch", 9300: "Elasticsearch", 1433: "Microsoft SQL Server",
    5984: "CouchDB", 11211: "Memcached", 9042: "Cassandra", 2379: "etcd", 8086: "InfluxDB",
    5601: "Kibana", 27019: "MongoDB",
  };
  if (datastores[port]) return { priority: "high", kind: `${datastores[port]} database/datastore` };

  // Remote administration surfaces.
  const remoteAdmin: Record<number, string> = {
    3389: "RDP (remote desktop)", 23: "Telnet", 5900: "VNC", 5901: "VNC", 445: "SMB/CIFS",
    135: "MS-RPC", 139: "NetBIOS", 161: "SNMP", 623: "IPMI/BMC",
  };
  if (remoteAdmin[port]) return { priority: "high", kind: remoteAdmin[port] };

  // Remote access / file transfer / brokers — medium.
  const medium: Record<number, string> = {
    22: "SSH", 21: "FTP", 69: "TFTP", 873: "rsync", 2049: "NFS", 5672: "AMQP",
    9092: "Kafka", 1883: "MQTT",
  };
  if (medium[port]) return { priority: "medium", kind: medium[port] };

  return null;
}

function fid(assetId: string, code: string): string {
  return `find_${assetId}_${code}`.replace(/[^a-z0-9_]/gi, "_");
}

export function generateExposedServiceFindings(assets: Asset[], now: string): Finding[] {
  const out: Finding[] = [];

  for (const asset of assets) {
    const services = Array.isArray(asset.attrs.exposedServices) ? (asset.attrs.exposedServices as string[]) : [];
    if (!services.length) continue;

    const risky: Array<{ port: number; transport: string; risk: Risk }> = [];
    for (const entry of services) {
      const parts = entry.split("/");
      const port = Number.parseInt(parts[0] ?? "", 10);
      if (!Number.isInteger(port) || WEB_PORTS.has(port)) continue;
      const risk = classify(port);
      if (risk) risky.push({ port, transport: parts[1] || "TCP", risk });
    }
    if (!risky.length) continue;

    const worst: Priority = risky.some((r) => r.risk.priority === "high") ? "high" : "medium";
    const list = risky.map((r) => `${r.port}/${r.transport} (${r.risk.kind})`).join(", ");
    const hasDatastore = risky.some((r) => r.risk.kind.includes("database/datastore"));

    out.push({
      id: fid(asset.id, "exposed_services"),
      title: hasDatastore ? "Internet-exposed database or datastore" : "Internet-exposed administrative service",
      priority: worst,
      confidence: 0.6,
      assetId: asset.id,
      category: "exposed-service",
      observation: `Censys observed ${risky.length} sensitive non-web service(s) on an address ${asset.label} resolves to: ${list}.`,
      inference: "Datastores and remote-administration services exposed to the public internet are high-value targets for brute forcing, unauthenticated access, and known-CVE exploitation.",
      concern: "Censys reports what it observed on the address, not that the service is reachable-and-vulnerable from everywhere or that it belongs to this system — on shared hosting it may be a neighbour's. Treat it as a prioritized item to confirm and lock down, not a confirmed breach.",
      reasoning: "Censys internet-wide service scan of the resolved address; ports classified against a sensitive-service set.",
      recommendation: "Confirm ownership of the address, then restrict these services to a private network / VPN / allowlist, require authentication, and never expose databases or remote-administration directly to the internet.",
      evidence: asset.evidence,
      discoveryMethod: "service_observation",
      createdAt: now,
    });
  }

  return out;
}
