/**
 * Walks one conversation: its metadata first, then every message in order.
 *
 * The detail route needs `emails.read`; the messages route needs `emails.content.read` on top of it
 * — a credential can hold one without the other. A credential missing the content scope gets a 403
 * with code `INSUFFICIENT_SCOPE` on the messages route: that is the gate working, not a bug. Branch
 * on `error.code`, never on the message text.
 */
import { clientFromEnv, SalesbudError } from "../src/salesbud-client.js";

const emailId = process.argv[2];
if (!emailId) {
  console.error("Usage: node examples/06-email-thread.js <eml_...>");
  process.exit(1);
}

const client = clientFromEnv();

try {
  const { data: conversation } = await client.email(emailId);

  console.log(conversation.subject ?? "(no subject)");
  console.log(
    `  ${conversation.message_count} messages, ` +
      `${conversation.first_message_at.slice(0, 10)} → ${conversation.last_message_at.slice(0, 10)}`,
  );
  console.log(`  mailboxes: ${conversation.mailboxes.map((m) => m.address).join(", ")}\n`);

  let shown = 0;
  for await (const message of client.emailMessages(emailId, { limit: 100 })) {
    shown += 1;
    const at = message.sent_at.slice(0, 16).replace("T", " ");
    const arrow = message.direction === "inbound" ? "←" : "→";
    // A participant name may be null; fall back to the address.
    const who = message.from.name ?? message.from.address;
    // snippet is null when the provider gave none; body_text is always present but may be empty.
    const preview = message.snippet ?? message.body_text.split("\n")[0];
    console.log(`  ${arrow} ${at}  ${who}`);
    if (preview) console.log(`      ${preview}`);
    if (message.attachments.length) {
      const names = message.attachments.map((a) => a.filename).join(", ");
      console.log(`      ${message.attachments.length} attachment(s): ${names}`);
    }
  }

  console.log(`\n${shown} messages.`);
} catch (error) {
  if (!(error instanceof SalesbudError)) throw error;

  if (error.code === "INSUFFICIENT_SCOPE") {
    console.error("This credential lacks the emails.content.read scope needed to read message bodies.");
    process.exit(1);
  }
  if (error.code === "RESOURCE_NOT_FOUND") {
    console.error(`No email conversation with id ${emailId} in your company.`);
    process.exit(1);
  }
  throw error;
}
