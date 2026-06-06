import { auth, clerkClient } from "@clerk/nextjs/server";

export type UserTier = "free" | "pro" | "algo";

export type AuthUser = {
  userId: string;
  tier: UserTier;
};

export async function getAuthUser(): Promise<AuthUser | null> {
  const { userId, sessionClaims } = await auth();

  if (!userId) return null;

  const rawTier = (sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.tier;
  const tier: UserTier =
    rawTier === "algo" ? "algo" : rawTier === "pro" ? "pro" : "free";

  return { userId, tier };
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new Error("Unauthenticated");
  return user;
}

export async function requireTier(minimum: UserTier): Promise<AuthUser> {
  const user = await requireAuthUser();
  const tierRank: Record<UserTier, number> = { free: 0, pro: 1, algo: 2 };

  if (tierRank[user.tier] < tierRank[minimum]) {
    throw new Error(`This feature requires the ${minimum} plan.`);
  }

  return user;
}

export async function setUserTier(userId: string, tier: UserTier) {
  const clerk = await clerkClient();
  await clerk.users.updateUser(userId, { publicMetadata: { tier } });
}

export async function generateSignalApiKey(userId: string): Promise<string> {
  const key = `sk_sig_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  const clerk = await clerkClient();
  await clerk.users.updateUser(userId, { privateMetadata: { signalApiKey: key } });

  return key;
}

export async function getUserSignalApiKey(userId: string): Promise<string | null> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  return (user.privateMetadata as Record<string, unknown>)?.signalApiKey as string | null ?? null;
}
