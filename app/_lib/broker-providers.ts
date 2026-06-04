import type {
  BrokerEnvironment,
  BrokerProvider,
} from "./server/workspace-types";

export type BrokerProviderDefinition = {
  bestUse: string;
  description: string;
  environments: BrokerEnvironment[];
  label: string;
  provider: BrokerProvider;
  routingRole: "primary_target" | "active_fallback" | "specialist";
  supportsExecution: boolean;
  supportsPaperTrading: boolean;
  supportsSync: boolean;
};

export const brokerProviderDefinitions: BrokerProviderDefinition[] = [
  {
    provider: "IBKR",
    label: "Interactive Brokers",
    description: "Primary execution venue for the desk. All live routing is now being simplified toward a single Interactive Brokers workflow.",
    bestUse: "Primary broker for listed markets, FX, and portfolio execution once the live IBKR connector is wired.",
    routingRole: "primary_target",
    environments: ["demo", "live"],
    supportsExecution: false,
    supportsPaperTrading: true,
    supportsSync: false,
  },
];

export function getBrokerProviderDefinition(provider: BrokerProvider) {
  return brokerProviderDefinitions.find((definition) => definition.provider === provider) ?? null;
}
