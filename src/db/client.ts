import { SQL } from "bun";
import { collectChecks, type DatabaseCollection } from "./collect";
import { QUERY_REGISTRY } from "./registry";

export async function collectDatabase(databaseUrl: string): Promise<DatabaseCollection> {
  const db = new SQL({ url: databaseUrl, max: 1, connectionTimeout: 10, idleTimeout: 10, prepare: false });
  let databaseName: string | undefined;
  let serverVersion: string | undefined;
  try {
    const [metadata] = await db`SELECT current_database() AS database_name, current_setting('server_version') AS server_version`;
    databaseName = typeof metadata?.database_name === "string" ? metadata.database_name : undefined;
    serverVersion = typeof metadata?.server_version === "string" ? metadata.server_version : undefined;
    try {
      await db.unsafe("SET pg_stat_statements.track = 'none'");
    } catch (error) {
      if ((error as { code?: string }).code !== "42704") throw error;
    }
    const checks = await collectChecks(async (definition) => db.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe("SET LOCAL statement_timeout = '15s'");
      return tx.unsafe(definition.sql, definition.params({ databaseName: databaseName ?? "" }));
    }), QUERY_REGISTRY);
    return { checks, databaseName, serverVersion, allFailed: checks.every((check) => check.status === "error") };
  } finally {
    await db.close({ timeout: 5 });
  }
}
