/**
 * Confirms the credential works and prints what the token can actually do.
 *
 * Run this first when an integration misbehaves: it separates a configuration problem (wrong
 * company, missing scope, feature disabled) from a bug in your code.
 */
import { clientFromEnv, SalesbudError } from "../src/salesbud-client.js";

const client = clientFromEnv();

try {
  const { data } = await client.context();

  console.log("Authenticated.\n");
  console.log(`  company   ${data.company.name} (${data.company.id})`);
  console.log(`  client    ${data.client.name}`);
  console.log(`  scopes    ${data.scopes.join(", ")}`);
  console.log(`  quota     ${data.rate_limit.requests_per_minute} requests / minute`);

  if (!data.scopes.includes("transcriptions.read")) {
    console.log("\n  Note: this credential cannot read transcripts.");
  }
} catch (error) {
  if (!(error instanceof SalesbudError)) throw error;

  console.error(`Failed: ${error.code} (HTTP ${error.status})`);
  console.error(`  ${error.message}`);
  if (error.requestId) console.error(`  request_id ${error.requestId}`);

  // These three are configuration, not transient. Retrying will not help.
  if (error.code === "API_ACCESS_DISABLED") {
    console.error("\n  Your company does not have API access enabled. Talk to your Salesbud contact.");
  }
  if (error.code === "invalid_client") {
    console.error("\n  Wrong client id or secret, or the credential was revoked.");
  }
  process.exit(1);
}
