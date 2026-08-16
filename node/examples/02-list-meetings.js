/**
 * Walks every completed meeting in a period.
 *
 * The loop never inspects how many records a page returned: a short or empty page with
 * `has_more: true` is normal, and stopping on it silently truncates the walk. The client's
 * async iterator follows `next_cursor` instead.
 */
import { clientFromEnv } from "../src/salesbud-client.js";

const client = clientFromEnv();

const since = process.argv[2] ?? "2026-01-01T00:00:00Z";
const filters = { meeting_after: since, limit: 100 };

console.log(`Meetings since ${since}\n`);

let count = 0;
let withTranscript = 0;

for await (const meeting of client.meetings(filters)) {
  count += 1;
  if (meeting.transcript.available) withTranscript += 1;

  const when = meeting.meeting_at.slice(0, 10);
  const minutes = Math.round(meeting.duration_seconds / 60);
  console.log(
    `  ${meeting.id}  ${when}  ${String(minutes).padStart(3)}min  ${meeting.type.padEnd(5)}  ${meeting.title}`,
  );
}

console.log(`\n${count} meetings, ${withTranscript} with a transcript.`);
