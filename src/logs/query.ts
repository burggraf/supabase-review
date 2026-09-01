export const SLOW_LOG_QUERY = `SELECT id, timestamp, event_message
FROM logs
WHERE source = 'postgres_logs'
  AND positionCaseInsensitive(event_message, 'duration:') > 0
ORDER BY timestamp DESC
LIMIT 500`;
