import { z } from "zod";

/** One location in a /code request, sent as at=start,end,above,below: its lines, and how far ↑ and ↓ widened them. */
export const At = z
  .string()
  .regex(/^\d+,\d+,\d+,\d+$/, "at must be start,end,above,below")
  .transform((s) => {
    const [start, end, above, below] = s.split(",").map(Number) as [number, number, number, number];
    return { start, end, above, below };
  })
  .refine((a) => a.start >= 1 && a.end >= a.start, { message: "start must be at least 1, and end at least start" });
export type At = z.infer<typeof At>;

/** What a /code request holds: a file, a side, and the locations in it to cut. */
export const CodeQuery = z.object({
  path: z.string().min(1),
  side: z.enum(["LEFT", "RIGHT"]),
  at: z.array(At).min(1),
});

/**
 * One code box: the locations it shows, by their place in the request, in the order they start; its lines as unified
 * diff text (empty when the file can't be read on the side, or has no such lines); the first and last line it shows
 * on the side (0 when it shows none); and whether the file has lines beyond them, above and below.
 */
export type CodeBox = { items: number[]; diff: string; from: number; to: number; moreAbove: boolean; moreBelow: boolean };

/**
 * A location's own rows, read with its box: their hash (empty if there's nothing in its range), which marks are made
 * by, and whether they're marked reviewed. Widening never changes the hash.
 */
export type Own = { hash: string; reviewed: boolean };

/**
 * What /code answers: the boxes, locations whose cut rows overlap or touch sharing one, and each location's own
 * rows, in the request's order. All of it is read at once, so the hashes are of the code in the boxes.
 */
export type CodeAnswer = { boxes: CodeBox[]; own: Own[] };

/** Marks the lines with this hash reviewed, or not. The server checks each request against it. */
export const MarkRequest = z.object({ hash: z.string().min(1), reviewed: z.boolean() });
export type MarkRequest = z.infer<typeof MarkRequest>;
