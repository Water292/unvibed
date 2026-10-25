// How the panel draws diffs. The values are react-diff-view's own names for
// its two views, so a ViewType can be handed to it as is.
import { enumGuard } from "./enum-guard.ts";

export enum ViewType {
  Unified = "unified",
  Split = "split",
}

/** True for one of ViewType's values, e.g. a string read back from storage. */
export const isViewType = enumGuard(ViewType);
