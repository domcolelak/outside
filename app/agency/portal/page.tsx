import { Suspense } from "react";
import { ClientPortal } from "@/components/agency/ClientPortal";
import { currentTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await currentTranslator();
  return { title: tr.t("agency", "portalMetaTitle") };
}

export default async function Page() {
  const tr = await currentTranslator();
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-10">
      <Suspense fallback={<div className="panel p-8 text-ink-soft">{tr.t("agency", "portalLoading")}</div>}>
        <ClientPortal />
      </Suspense>
    </main>
  );
}
