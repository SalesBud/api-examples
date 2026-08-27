# Salesbud API examples

Runnable integrations against the [Salesbud API](https://docs.salesbud.com.br) — in Node.js and
Python, with no framework and almost no dependencies.

Read the [documentation](https://docs.salesbud.com.br) for the contract. This repository is for
the parts that are easy to get wrong in code.

*Leia em [português](README.pt-BR.md).*

## What each client handles for you

Three things account for most of the bugs we see in first integrations. Both clients encode them,
so you can copy the file into your project and move on.

**1. Token renewal.** Client credentials has no refresh token — that is
[by design](https://www.rfc-editor.org/rfc/rfc6749#section-4.4.3), not an omission, since there is
no user to re-consent. Renewal is asking for a new token. Renewing on a timer alone is not enough:
a credential can be revoked before the clock runs out, so a `401` also triggers one retry with a
fresh token.

**2. Pagination.** A page can come back **short, or even empty, while `has_more` is still true** —
the service caps how much it scans per request. Looping on `data.length` silently truncates the
walk. Both clients follow `next_cursor` and never look at how many records a page returned.

**3. Retries.** `429` waits out `Retry-After`; `503` backs off exponentially with jitter; every
other 4xx fails immediately, because retrying an invalid request just fails again.

## Getting credentials

Credentials are issued by Salesbud for your company; they are not self-service. Ask your Salesbud
contact, who will also confirm that the `API_ACCESS` feature is enabled.

The secret is shown once, at creation. Store it in a secret manager — it cannot be read back, only
rotated.

## Node.js

Requires Node 18 or newer. No dependencies.

```bash
cd node
cp .env.example .env        # fill in your credentials
export $(grep -v '^#' .env | xargs)

node examples/01-authenticate.js
node examples/02-list-meetings.js 2026-01-01T00:00:00Z
node examples/03-list-calls.js
node examples/04-get-transcript.js mtg_...
```

```js
import { SalesbudClient } from "./src/salesbud-client.js";

const client = new SalesbudClient({ clientId, clientSecret });

for await (const meeting of client.meetings({ meeting_after: "2026-01-01T00:00:00Z" })) {
  console.log(meeting.id, meeting.title);
}
```

## Python

Requires Python 3.10 or newer. Only dependency is `requests`.

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e .            # puts `salesbud` on the path

cp .env.example .env        # fill in your credentials
export $(grep -v '^#' .env | xargs)

python examples/01_authenticate.py
python examples/02_list_meetings.py 2026-01-01T00:00:00Z
python examples/03_list_calls.py
python examples/04_get_transcript.py mtg_...
```

```python
from salesbud import SalesbudClient

client = SalesbudClient.from_env()

for meeting in client.meetings(meeting_after="2026-01-01T00:00:00Z"):
    print(meeting["id"], meeting["title"])
```

## Meetings and calls are different collections

A recording captured by the meeting bot lives at `/v1/meetings` with an `mtg_` id. A recording
captured from a VoIP integration lives at `/v1/calls` with a `call_` id. Same fields, same five
routes, separate collections — an id does not resolve across them.

Do not infer the kind from the media type: `object` says whether it is a `meeting` or a `call`,
`type` only says `video` or `audio`, and the two are independent. Calls in video and meetings in
audio both exist.

## Handling errors

Branch on `error.code`. It is stable across releases; `detail` is human text and may be reworded.

```js
try {
  await client.meeting("mtg_...");
} catch (error) {
  if (error.code === "RESOURCE_NOT_FOUND") { /* absent, or not yours */ }
  if (error.code === "INSUFFICIENT_SCOPE") { /* the credential lacks a scope */ }
  throw error;
}
```

Every error carries a `request_id`. Quote it when contacting support — it identifies the exact
request in our logs.

## License

MIT. Copy these files into your project and change whatever you need.
