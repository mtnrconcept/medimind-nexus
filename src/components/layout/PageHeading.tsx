import type { ReactNode } from 'react';

interface PageHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Consistent visible heading and primary action for clinical workspace pages. */
export default function PageHeading({ eyebrow, title, description, actions }: PageHeadingProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        {eyebrow && <p className="clinical-eyebrow">{eyebrow}</p>}
        <h1 className="text-[clamp(1.7rem,2.4vw,2.1rem)] font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
