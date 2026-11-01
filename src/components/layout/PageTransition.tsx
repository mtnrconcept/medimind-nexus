import type { ReactNode } from 'react';

/** Render the routed content immediately; never show stale clinical data while animating. */
const PageTransition = ({ children }: { children: ReactNode }) => <>{children}</>;

export default PageTransition;
