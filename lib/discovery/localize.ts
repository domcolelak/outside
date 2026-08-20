import type { Translator, MessageKey } from "@/lib/i18n/messages";
import type { ScanStage } from "@/lib/types";

type ScanKey = MessageKey<"scan">;

const STAGE_KEY: Record<ScanStage, ScanKey> = {
  init: "stageInit",
  certificates: "stageCertificates",
  dns: "stageDns",
  correlate: "stageCorrelate",
  http: "stageHttp",
  normalize: "stageNormalize",
  graph: "stageGraph",
  classify: "stageClassify",
  score: "stageScore",
  done: "stageDone",
};

export function localizeScanStage(stage: ScanStage, tr: Translator) {
  return tr.t("scan", STAGE_KEY[stage]);
}

/**
 * Scan streams predate message keys and persisted plain English operational
 * lines. This bounded presenter recognizes every line emitted by the engine and
 * never leaks an unknown provider error into the customer interface.
 */
export function localizeScanLog(message: string, tr: Translator): string {
  let match: RegExpMatchArray | null;
  if ((match = message.match(/^Target locked: (.+?)(?: \(demo dataset\))?$/))) return tr.t("scan", "logTargetLocked", { target: match[1]! });
  if (message === "Reviewing public certificate transparency evidence") return tr.t("scan", "logReviewingCertificates");
  if ((match = message.match(/^(\d+) candidate hostname\(s\) from certificate transparency$/))) return tr.t("scan", "logCertificateCandidates", { count: Number(match[1]) });
  if (message.startsWith("Certificate transparency lookup failed:")) return tr.t("scan", "logCertificateUnavailable");
  if ((match = message.match(/^(\d+) additional hostname\(s\) from passive-DNS providers$/))) return tr.t("scan", "logPassiveDnsCandidates", { count: Number(match[1]) });
  if ((match = message.match(/^(.+) discovered$/))) return tr.t("scan", "logAssetDiscovered", { asset: match[1]! });
  if (message === "Mail infrastructure identified") return tr.t("scan", "logMailIdentified");
  if (message.startsWith("DNS correlation partial:")) return tr.t("scan", "logDnsPartial");
  if (message === "Active HTTPS observation skipped until ownership is verified") return tr.t("scan", "logHttpsNeedsOwnership");
  if ((match = message.match(/^(.+) observed — (\d+) security header\(s\) missing$/))) return tr.t("scan", "logHeadersObserved", { asset: match[1]!, count: Number(match[2]) });
  if ((match = message.match(/^HTTP observation skipped for (.+)$/))) return tr.t("scan", "logHttpSkipped", { asset: match[1]! });
  if ((match = message.match(/^Verified HTTPS observation completed for (\d+)\/(\d+) selected public host\(s\)$/))) return tr.t("scan", "logHttpsCompleted", { observed: Number(match[1]), total: Number(match[2]) });
  if ((match = message.match(/^Threat-intelligence enrichment completed \((\d+) provider\(s\)\)$/))) return tr.t("scan", "logIntelCompleted", { count: Number(match[1]) });
  if (message.startsWith("Threat-intelligence enrichment skipped:")) return tr.t("scan", "logIntelSkipped");
  if ((match = message.match(/^Censys observed (\d+) service\(s\) on resolved addresses$/))) return tr.t("scan", "logServicesObserved", { count: Number(match[1]) });
  if (message.startsWith("Censys service discovery skipped:")) return tr.t("scan", "logServicesSkipped");
  if ((match = message.match(/^(\d+) asset\(s\) attributed to a connected account; (\d+) not owned by any connected account$/))) return tr.t("scan", "logOwnership", { attributed: Number(match[1]), unattributed: Number(match[2]) });
  if (message.startsWith("Ownership attribution skipped:")) return tr.t("scan", "logOwnershipSkipped");
  if ((match = message.match(/^(\d+) possible shadow asset signal\(s\), (\d+) non-production signal\(s\)$/))) return tr.t("scan", "logSignals", { shadow: Number(match[1]), nonProduction: Number(match[2]) });
  if ((match = message.match(/^(\d+) possible shadow asset signal\(s\) correlated$/))) return tr.t("scan", "logShadowCorrelated", { count: Number(match[1]) });
  if ((match = message.match(/^Protection posture: (\d+)\/100$/))) return tr.t("scan", "logPosture", { score: Number(match[1]) });
  return tr.t("scan", "logProviderActivity");
}
