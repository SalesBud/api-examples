/**
 * Fetches the transcript of one record.
 *
 * Transcripts need the `transcriptions.read` scope, which is granted separately from
 * `meetings.read` — a credential can hold one without the other. An unavailable transcript is a
 * successful response with `available: false`, not an error, so check the flag before reading
 * `utterances`.
 */
import { clientFromEnv, SalesbudError } from "../src/salesbud-client.js";

const resourceId = process.argv[2];
if (!resourceId) {
  console.error("Usage: node examples/04-get-transcript.js <mtg_... | call_...>");
  process.exit(1);
}

// The id prefix decides the collection; an id does not resolve across the two.
const collection = resourceId.startsWith("call_") ? "calls" : "meetings";
const client = clientFromEnv();

try {
  const { data } = await client.transcript(collection, resourceId);

  if (!data.available) {
    console.log(`No transcript yet. Status: ${data.status}`);
    process.exit(0);
  }

  console.log(`Transcript (${data.variant}), ${data.utterances.length} utterances\n`);
  for (const utterance of data.utterances.slice(0, 20)) {
    const at = new Date(utterance.start_ms).toISOString().slice(14, 19);
    console.log(`  [${at}] ${utterance.speaker}: ${utterance.text}`);
  }
} catch (error) {
  if (!(error instanceof SalesbudError)) throw error;

  if (error.code === "INSUFFICIENT_SCOPE") {
    console.error("This credential lacks the transcriptions.read scope.");
    process.exit(1);
  }
  if (error.code === "RESOURCE_NOT_FOUND") {
    console.error(`No ${collection.slice(0, -1)} with id ${resourceId} in your company.`);
    process.exit(1);
  }
  throw error;
}
