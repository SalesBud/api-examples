"""Walk one conversation: its metadata first, then every message in order.

The detail route needs ``emails.read``; the messages route needs ``emails.content.read`` on top of
it — a credential can hold one without the other. A credential missing the content scope gets a 403
with code ``INSUFFICIENT_SCOPE`` on the messages route: that is the gate working, not a bug. Branch
on ``error.code``, never on the message text.
"""

import sys

from salesbud import SalesbudClient, SalesbudError

if len(sys.argv) < 2:
    print("Usage: python examples/06_email_thread.py <eml_...>", file=sys.stderr)
    raise SystemExit(1)

email_id = sys.argv[1]
client = SalesbudClient.from_env()

try:
    conversation = client.email(email_id)["data"]

    print(conversation["subject"] or "(no subject)")
    print(
        f"  {conversation['message_count']} messages, "
        f"{conversation['first_message_at'][:10]} → {conversation['last_message_at'][:10]}"
    )
    print(f"  mailboxes: {', '.join(m['address'] for m in conversation['mailboxes'])}\n")

    shown = 0
    for message in client.email_messages(email_id, limit=100):
        shown += 1
        at = message["sent_at"][:16].replace("T", " ")
        arrow = "←" if message["direction"] == "inbound" else "→"
        # A participant name may be null; fall back to the address.
        who = message["from"]["name"] or message["from"]["address"]
        # snippet is null when the provider gave none; body_text is always present but may be empty.
        preview = message["snippet"] or message["body_text"].split("\n")[0]
        print(f"  {arrow} {at}  {who}")
        if preview:
            print(f"      {preview}")
        if message["attachments"]:
            names = ", ".join(a["filename"] for a in message["attachments"])
            print(f"      {len(message['attachments'])} attachment(s): {names}")

    print(f"\n{shown} messages.")
except SalesbudError as error:
    if error.code == "INSUFFICIENT_SCOPE":
        print(
            "This credential lacks the emails.content.read scope needed to read message bodies.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if error.code == "RESOURCE_NOT_FOUND":
        print(f"No email conversation with id {email_id} in your company.", file=sys.stderr)
        raise SystemExit(1)
    raise
