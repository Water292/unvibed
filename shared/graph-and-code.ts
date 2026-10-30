import { z } from "zod";

/** A whole number written in decimal digits; Number() alone would also take "", "0x10", "1e3" and "+3". */
const whole = z.string().regex(/^\d+$/, "must be a whole number").transform(Number);

/** What a /code request holds: which lines of which file, on which side, and how far to widen them. */
export const CodeQuery = z
  .object({
    path: z.string().min(1),
    side: z.enum(["LEFT", "RIGHT"]),
    start: whole.pipe(z.number().min(1)),
    end: whole,
    above: whole.default(0),
    below: whole.default(0),
  })
  .refine((q) => q.end >= q.start, { message: "end must be at least start", path: ["end"] });

/**
 * One location's code: its lines as unified diff text (empty when the file can't be read on the location's side),
 * whether the file has lines beyond them, above and below, and the hash of the location's own rows (empty if there's
 * nothing in its range), which marks are made by. Widening never changes the hash.
 */
export type CodeCut = { diff: string; moreAbove: boolean; moreBelow: boolean; hash: string };

/** What /code answers: the cut, and whether its lines are marked reviewed. */
export type LocationCode = CodeCut & { reviewed: boolean };

/** Marks the lines with this hash reviewed, or not. The server checks each request against it. */
export const MarkRequest = z.object({ hash: z.string().min(1), reviewed: z.boolean() });
export type MarkRequest = z.infer<typeof MarkRequest>;
