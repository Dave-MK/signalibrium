import { getAuthUser, getUserSignalApiKey } from "@/app/_lib/auth";
import { PageHeader, Panel } from "@/app/_components/ui";
import { ApiAccessClient } from "./api-access-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "API Access | Signalibrium",
};

export default async function ApiAccessPage() {
  const user = await getAuthUser();
  const existingKey = user ? await getUserSignalApiKey(user.userId) : null;

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Developer"
        title="Signal API Access"
        description="Pull live ENTER NOW signals and Siggi's open trades directly into your own algo, EA, bot, or spreadsheet via a secured REST endpoint."
      />

      <ApiAccessClient
        initialApiKey={existingKey}
        isAlgo={user?.tier === "algo"}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "https://signalibrium.vercel.app"}
      />
    </div>
  );
}
