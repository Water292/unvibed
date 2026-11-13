import { z } from "zod";

/**
 * One location a /code request asks for: its id in the graph, which gives its file, side and lines, and how many
 * lines ↑ (above) and ↓ (below) have added to it.
 */
export const RequestedLocation = z.object({ id: z.string().min(1), above: z.number().int().min(0), below: z.number().int().min(0) });
export type RequestedLocation = z.infer<typeof RequestedLocation>;

/** What a /code request holds: locations of the graph, all in one file. */
export const CodeRequest = z.object({ locations: z.array(RequestedLocation).min(1) });
export type CodeRequest = z.infer<typeof CodeRequest>;

/** A line number in each version of the file: LEFT before the change, RIGHT after it; 0 where there's none. */
export type Lines = { LEFT: number; RIGHT: number };

/**
 * One code box: the locations it shows, by their place in the request, in the order they start; its lines as unified
 * diff text (empty when it has no lines); the first and last line it shows in each version of the file; and whether
 * the file has lines beyond them, above and below.
 */
export type CodeBox = { items: number[]; diff: string; from: Lines; to: Lines; moreAbove: boolean; moreBelow: boolean };

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
