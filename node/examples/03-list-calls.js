/**
 * Lists completed calls — the records captured from a VoIP integration.
 *
 * Calls are a separate collection with their own `call_` ids, not a filter on meetings, and the
 * two axes are independent: a call can be video and a meeting can be audio. Deciding by `type`
 * gets those wrong; `object` is what says which resource you are holding.
 */
import { clientFromEnv } from "../src/salesbud-client.js";

const client = clientFromEnv();

const since = process.argv[2] ?? "2026-01-01T00:00:00Z";

console.log(`Calls since ${since}\n`);

const byMedia = { video: 0, audio: 0 };

for await (const call of client.calls({ meeting_after: since, limit: 100 })) {
  byMedia[call.type] += 1;

  // A VoIP record usually identifies the other party by number rather than email.
  const who = call.participants[0]?.phone ?? call.participants[0]?.email ?? "unknown";
  console.log(`  ${call.id}  ${call.meeting_at.slice(0, 10)}  ${call.type.padEnd(5)}  ${who}`);
}

console.log(`\n${byMedia.audio} audio, ${byMedia.video} video.`);
