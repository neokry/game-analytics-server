import { array, iso, object, record, string, unknown, type output } from "zod";

export type JsonRecord = Record<string, unknown>;

const jsonRecordSchema = record(string(), unknown());

export const eventInputSchema = object({
  name: string().min(1).max(120),
  properties: jsonRecordSchema.optional().default({}),
  occurredAt: iso.datetime().optional(),
  clientEventId: string().min(1).max(200).optional(),
  sessionId: string().min(1).max(200).optional(),
  anonymousId: string().min(1).max(200).optional(),
  playerId: string().min(1).max(200).optional(),
  buildId: string().min(1).max(200).optional()
});

export const ingestBodySchema = object({
  sessionId: string().min(1).max(200).optional(),
  anonymousId: string().min(1).max(200).optional(),
  playerId: string().min(1).max(200).optional(),
  buildId: string().min(1).max(200).optional(),
  context: object({
    pageUrl: string().max(2000).optional(),
    referrer: string().max(2000).optional(),
    userAgent: string().max(1000).optional()
  }).optional(),
  sessionProperties: jsonRecordSchema.optional().default({}),
  events: array(eventInputSchema).min(1).max(100).optional(),
  event: eventInputSchema.optional(),
  name: string().min(1).max(120).optional(),
  properties: jsonRecordSchema.optional()
}).superRefine((body, ctx) => {
  const hasBatch = body.events && body.events.length > 0;
  const hasEvent = Boolean(body.event);
  const hasInlineEvent = Boolean(body.name);

  if (!hasBatch && !hasEvent && !hasInlineEvent) {
    ctx.addIssue({
      code: "custom",
      message: "Provide events, event, or name"
    });
  }
});

export type EventInput = output<typeof eventInputSchema>;
export type IngestBody = output<typeof ingestBodySchema>;

export function normalizeEvents(body: IngestBody): EventInput[] {
  if (body.events?.length) return body.events;
  if (body.event) return [body.event];

  return [
    {
      name: body.name!,
      properties: body.properties ?? {}
    }
  ];
}
