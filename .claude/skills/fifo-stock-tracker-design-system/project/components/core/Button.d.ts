import * as React from "react";

export interface ButtonProps {
  /** Visual style — matches the app's actual usage: primary (Record Buy/Sell,
   * Save, Sell (FIFO)), outline-secondary (FIFO Report, View evidence),
   * outline-light (navbar Login/Logout on the dark navbar). */
  variant?: "primary" | "outline-secondary" | "outline-light";
  size?: "sm" | "md";
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * @startingPoint section="Components" subtitle="Primary, outline-secondary, outline-light buttons" viewport="700x220"
 */
export function Button(props: ButtonProps): JSX.Element;
