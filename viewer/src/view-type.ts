// How the panel draws diffs. The values are what's saved in the browser, so
// they stay the same whichever renderer draws them.
import { enumGuard } from "./enum-guard.ts";

export enum ViewType {
  Unified = "unified",
  Split = "split",
}

/** True for one of ViewType's values, e.g. a string read back from storage. */
export const isViewType = enumGuard(ViewType);
