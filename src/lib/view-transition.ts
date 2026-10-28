/**
 * Shared page-level transition mapping for React's <ViewTransition>.
 *
 * `nav-forward` and `nav-back` are supplied by <Link transitionTypes>. Other
 * navigations (browser back/forward, refresh) fall back to no animation, so
 * the pages still swap instantly when there is no direction to communicate.
 */
export const routeTransition = {
  enter: {
    "nav-forward": "nav-forward",
    "nav-back": "nav-back",
    default: "none",
  },
  exit: {
    "nav-forward": "nav-forward",
    "nav-back": "nav-back",
    default: "none",
  },
  default: "none",
} as const;
