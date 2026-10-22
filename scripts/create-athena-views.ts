// Creates or updates the Athena views in athena/views.sql. Run after `npm run deploy`.
import { readFileSync } from "node:fs";
import {
  AthenaClient,
  GetQueryExecutionCommand,
  StartQueryExecutionCommand
} from "@aws-sdk/client-athena";
import { ATHENA_WORKGROUP, GLUE_DATABASE } from "../infra/stack.js";

const athena = new AthenaClient({ region: "us-east-2" });
const statements = readFileSync(new URL("../athena/views.sql", import.meta.url), "utf8")
  .split(/;\s*$/m)
  .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

for (const statement of statements) {
  const { QueryExecutionId } = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: statement,
      WorkGroup: ATHENA_WORKGROUP,
      QueryExecutionContext: { Database: GLUE_DATABASE }
    })
  );

  for (;;) {
    const { QueryExecution } = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId }));
    const state = QueryExecution?.Status?.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`${state}: ${QueryExecution?.Status?.StateChangeReason}\n${statement}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`ok: ${statement.split("\n")[0]}`);
}
