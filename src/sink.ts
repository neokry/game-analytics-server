import { FirehoseClient, PutRecordBatchCommand } from "@aws-sdk/client-firehose";

// One row per accepted event. Field names match the Glue table columns; `game` and
// `dt` are only used by Firehose to build the S3 partition path.
export type EventRecord = {
  event_id: string;
  game: string;
  dt: string;
  name: string;
  client_event_id: string | null;
  session_id: string | null;
  anonymous_id: string | null;
  player_id: string | null;
  build_id: string | null;
  origin: string | null;
  page_url: string | null;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
  privacy_mode: "standard" | "reduced";
  properties: string;
  session_properties: string;
  occurred_at: number;
  received_at: number;
};

export interface EventSink {
  put(records: EventRecord[]): Promise<void>;
}

const FIREHOSE_BATCH_LIMIT = 500;

export class FirehoseSink implements EventSink {
  private readonly client = new FirehoseClient({});

  constructor(private readonly streamName: string) {}

  async put(records: EventRecord[]): Promise<void> {
    for (let start = 0; start < records.length; start += FIREHOSE_BATCH_LIMIT) {
      const batch = records.slice(start, start + FIREHOSE_BATCH_LIMIT);
      const result = await this.client.send(
        new PutRecordBatchCommand({
          DeliveryStreamName: this.streamName,
          Records: batch.map((record) => ({
            Data: Buffer.from(`${JSON.stringify(record)}\n`)
          }))
        })
      );

      if (result.FailedPutCount) {
        throw new Error(`Firehose rejected ${result.FailedPutCount} of ${batch.length} records`);
      }
    }
  }
}

export class MemorySink implements EventSink {
  readonly records: EventRecord[] = [];

  async put(records: EventRecord[]): Promise<void> {
    this.records.push(...records);
  }
}
