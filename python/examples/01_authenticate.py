"""Confirm the credential works and print what the token can actually do.

Run this first when an integration misbehaves: it separates a configuration problem (wrong
company, missing scope, feature disabled) from a bug in your code.
"""

import sys

from salesbud import SalesbudClient, SalesbudError

client = SalesbudClient.from_env()

try:
    data = client.context()["data"]
except SalesbudError as error:
    print(f"Failed: {error.code} (HTTP {error.status})", file=sys.stderr)
    print(f"  {error}", file=sys.stderr)
    if error.request_id:
        print(f"  request_id {error.request_id}", file=sys.stderr)

    # These two are configuration, not transient. Retrying will not help.
    if error.code == "API_ACCESS_DISABLED":
        print("\n  Your company does not have API access enabled.", file=sys.stderr)
    if error.code == "invalid_client":
        print("\n  Wrong client id or secret, or the credential was revoked.", file=sys.stderr)
    raise SystemExit(1)

print("Authenticated.\n")
print(f"  company   {data['company']['name']} ({data['company']['id']})")
print(f"  client    {data['client']['name']}")
print(f"  scopes    {', '.join(data['scopes'])}")
print(f"  quota     {data['rate_limit']['requests_per_minute']} requests / minute")

if "transcriptions.read" not in data["scopes"]:
    print("\n  Note: this credential cannot read transcripts.")
