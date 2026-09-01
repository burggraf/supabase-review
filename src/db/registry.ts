export interface QueryDefinition {
  id: string;
  title: string;
  sql: string;
  expectedKeys: readonly string[];
  params(context: { databaseName: string }): readonly unknown[];
  source: string;
}

import { query as dbStats } from "./queries/db-stats";
import { query as replicationSlots } from "./queries/replication-slots";
import { query as locks } from "./queries/locks";
import { query as blocking } from "./queries/blocking";
import { query as outliers } from "./queries/outliers";
import { query as calls } from "./queries/calls";
import { query as indexStats } from "./queries/index-stats";
import { query as longRunningQueries } from "./queries/long-running-queries";
import { query as bloat } from "./queries/bloat";
import { query as roleStats } from "./queries/role-stats";
import { query as vacuumStats } from "./queries/vacuum-stats";
import { query as tableStats } from "./queries/table-stats";
import { query as trafficProfile } from "./queries/traffic-profile";

export const QUERY_REGISTRY: readonly QueryDefinition[] = [
  dbStats, replicationSlots, locks, blocking, outliers, calls, indexStats,
  longRunningQueries, bloat, roleStats, vacuumStats, tableStats, trafficProfile,
];
