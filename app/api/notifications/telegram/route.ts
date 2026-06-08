import { NextResponse } from "next/server";
import { testTelegramConnection } from "@/app/_lib/server/telegram";

/**
 * POST /api/notifications/telegram
 * Tests the Telegram bot connection by sending a test message.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await testTelegramConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
