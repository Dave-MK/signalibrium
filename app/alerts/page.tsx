import { listAlerts } from "@/app/_lib/server/repositories/alerts";
import { PageHeader, Panel } from "@/app/_components/ui";
import { AlertsClient } from "./alerts-client";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await listAlerts();

  return (
    <div className="panel-stack-5">
      <PageHeader
        eyebrow="Alerts"
        title="Never Miss What Matters."
        description="Set price alerts for any instrument — you'll get an instant notification the moment price crosses your level. In-app and OS push supported."
      />

      <Panel className="p-4">
        <AlertsClient initialAlerts={alerts} />
      </Panel>
    </div>
  );
}
