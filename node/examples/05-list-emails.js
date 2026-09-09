/**
 * Walks every email conversation with activity in a period.
 *
 * A conversation is deduplicated across every connected mailbox — two sellers on one thread are a
 * single conversation with two mailboxes, not two records. The list is ordered by `last_message_at`
 * ascending, oldest activity first, and the loop follows `next_cursor` rather than the size of a
 * page. This route needs only `emails.read`; the message bodies (example 06) need
 * `emails.content.read` on top.
 */
import { clientFromEnv } from "../src/salesbud-client.js";

const client = clientFromEnv();

const since = process.argv[2] ?? "2026-01-01T00:00:00Z";
const filters = { last_message_after: since, limit: 100 };

console.log(`Email conversations with activity since ${since}\n`);

let count = 0;
let withAttachments = 0;

for await (const email of client.emails(filters)) {
  count += 1;
  if (email.has_attachments) withAttachments += 1;

  const when = email.last_message_at.slice(0, 10);
  // last_message_direction is null when the last message's direction is indeterminate.
  const direction = (email.last_message_direction ?? "—").padEnd(8);
  // `internal` is decided by the address domain, the same rule for senders and recipients.
  const audience = email.participants.some((p) => !p.internal) ? "external" : "internal";
  const subject = email.subject ?? "(no subject)";
  console.log(
    `  ${email.id}  ${when}  ${direction}  ${String(email.message_count).padStart(3)} msg  ${audience.padEnd(8)}  ${subject}`,
  );
}

console.log(`\n${count} conversations, ${withAttachments} with attachments.`);
