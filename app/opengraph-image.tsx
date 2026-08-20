import { ImageResponse } from "next/og";
import { currentTranslator } from "@/lib/i18n/server";

export const runtime = "nodejs";
// Rendered on request, not prerendered at build: @vercel/og's font resolution
// can fail during static export on some OSes; at runtime (Linux/prod) it works.
export const dynamic = "force-dynamic";
export const alt = "OUTSIDE";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const t = await currentTranslator();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#05070a",
          backgroundImage:
            "radial-gradient(900px 500px at 80% -10%, rgba(56,225,195,0.14), transparent 60%), radial-gradient(900px 600px at 0% 120%, rgba(91,140,255,0.12), transparent 55%)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: 34, height: 34, borderRadius: 999, background: "#38e1c3" }} />
          <div style={{ color: "#e8edf6", fontSize: 34, fontWeight: 700, letterSpacing: 10 }}>OUTSIDE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#e8edf6", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{t.t("ui", "openGraphLine1")}</div>
          <div style={{ color: "#9fb0cc", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{t.t("ui", "openGraphLine2")}</div>
          <div style={{ color: "#aab6cc", fontSize: 30, marginTop: 28, maxWidth: 900, lineHeight: 1.4 }}>
            {t.t("ui", "openGraphBody")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#38e1c3", fontSize: 22, letterSpacing: 2 }}>
          <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: "#38e1c3" }} />
          {t.t("ui", "openGraphTagline")}
        </div>
      </div>
    ),
    size,
  );
}
