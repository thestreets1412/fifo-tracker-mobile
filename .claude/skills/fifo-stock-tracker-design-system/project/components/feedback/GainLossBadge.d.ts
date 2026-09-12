import * as React from "react";

export interface GainLossBadgeProps {
  value: number;
  currency?: string;
}

/**
 * @startingPoint section="Components" subtitle="Green/red capital gain-or-loss inline text" viewport="700x140"
 */
export function GainLossBadge(props: GainLossBadgeProps): JSX.Element;
