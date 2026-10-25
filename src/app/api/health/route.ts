import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!db) {
    return Response.json({
      ok: true,
      mode: "stateless-memory-pipeline",
      database: "not-configured",
    });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: "connected" });
  } catch {
    return Response.json({ ok: false, database: "error" }, { status: 500 });
  }
}
