"""Walk every email conversation with activity in a period.

A conversation is deduplicated across every connected mailbox — two sellers on one thread are a
single conversation with two mailboxes, not two records. The list is ordered by ``last_message_at``
ascending, oldest activity first, and the generator follows ``next_cursor`` rather than the size of
a page. This route needs only ``emails.read``; the message bodies (example 06) need
``emails.content.read`` on top.
"""

import sys

from salesbud import SalesbudClient

client = SalesbudClient.from_env()

since = sys.argv[1] if len(sys.argv) > 1 else "2026-01-01T00:00:00Z"
print(f"Email conversations with activity since {since}\n")

count = 0
with_attachments = 0

for email in client.emails(last_message_after=since, limit=100):
    count += 1
    if email["has_attachments"]:
        with_attachments += 1

    when = email["last_message_at"][:10]
    # last_message_direction is null when the last message's direction is indeterminate.
    direction = email["last_message_direction"] or "—"
    # `internal` is decided by the address domain, the same rule for senders and recipients.
    audience = "external" if any(not p["internal"] for p in email["participants"]) else "internal"
    subject = email["subject"] or "(no subject)"
    print(
        f"  {email['id']}  {when}  {direction:<8}  "
        f"{email['message_count']:>3} msg  {audience:<8}  {subject}"
    )

print(f"\n{count} conversations, {with_attachments} with attachments.")
