import { listAlerts } from "@/app/_lib/server/repositories/alerts";
import { PageHeader, Panel } from "@/app/_components/ui";
import { AlertsClient } from "./alerts-client";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await listAlerts();

  return (
    <div className="panel-stack-5">
      <PageHeader
        title="Price Alerts"
        description="Set a target price on any symbol — you'll get an instant notification (in-app and OS push if enabled) the moment price crosses the level."
      />

      <Panel className="p-4">
        <AlertsClient initialAlerts={alerts} />
      </Panel>
    </div>
  );
}
