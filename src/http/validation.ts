import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());

export const eventInputSchema = z.object({
  name: z.string().min(1).max(120),
  properties: jsonRecordSchema.optional().default({}),
  occurredAt: z.string().datetime().optional(),
  clientEventId: z.string().min(1).max(200).optional(),
  sessionId: z.string().min(1).max(200).optional(),
  anonymousId: z.string().min(1).max(200).optional(),
  playerId: z.string().min(1).max(200).optional(),
  buildId: z.string().min(1).max(200).optional()
});

export const ingestBodySchema = z
  .object({
    sessionId: z.string().min(1).max(200).optional(),
    anonymousId: z.string().min(1).max(200).optional(),
    playerId: z.string().min(1).max(200).optional(),
    buildId: z.string().min(1).max(200).optional(),
    context: z
      .object({
        pageUrl: z.string().max(2000).optional(),
        referrer: z.string().max(2000).optional(),
        userAgent: z.string().max(1000).optional()
      })
      .optional(),
    sessionProperties: jsonRecordSchema.optional().default({}),
    events: z.array(eventInputSchema).min(1).max(100).optional(),
    event: eventInputSchema.optional(),
    name: z.string().min(1).max(120).optional(),
    properties: jsonRecordSchema.optional()
  })
  .superRefine((body, ctx) => {
    const hasBatch = body.events && body.events.length > 0;
    const hasEvent = Boolean(body.event);
    const hasInlineEvent = Boolean(body.name);

    if (!hasBatch && !hasEvent && !hasInlineEvent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide events, event, or name"
      });
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;
export type IngestBody = z.infer<typeof ingestBodySchema>;

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
