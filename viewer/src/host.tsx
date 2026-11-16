// What the page showing a graph gives the canvas and panel: where unvibed's
// routes are mounted, and, if it has a chat, how text is asked about. With
// none given, the routes are the page's own and nothing can be asked about.
import { createContext, useContext, type ComponentType, type CSSProperties, type ReactNode } from "react";

export type AskableProps = { anchor: string; context: string; children: ReactNode; style?: CSSProperties };

/** Askable and Threads are components, so each must stay the same function from one render to the next, or what they wrap is drawn afresh. */
export type Host = {
  /** The path /code, /reviewed and /mark are under, with no slash at the end: "" where they're the page's own. */
  routes: string;
  /** Wraps text that can be asked about: anchor names where it is, context tells the chat what it is. */
  Askable: ComponentType<AskableProps>;
  /** The threads started at anchor that aren't shown with the text they quote. */
  Threads: ComponentType<{ anchor: string }>;
};

/** The page's own routes, and nothing to ask with. */
export const NO_HOST: Host = { routes: "", Askable: ({ children }) => children, Threads: () => null };

const HostContext = createContext<Host>(NO_HOST);
export const HostProvider = HostContext.Provider;
export const useHost = () => useContext(HostContext);
