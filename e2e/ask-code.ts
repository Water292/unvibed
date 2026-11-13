// Asks a viewer's /code for locations of its graph, as the panel does.
import type { CodeRequest } from "../shared/graph-and-code.ts";

export function askCode(viewerUrl: string, request: CodeRequest): Promise<Response> {
  return fetch(`${viewerUrl}code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
}
