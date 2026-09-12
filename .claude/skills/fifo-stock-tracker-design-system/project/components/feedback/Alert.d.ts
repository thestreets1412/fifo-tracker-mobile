import * as React from "react";

export interface AlertProps {
  tone?: "info" | "success" | "warning" | "danger" | "secondary";
  children?: React.ReactNode;
  onClose?: () => void;
}

/**
 * @startingPoint section="Components" subtitle="Dismissible Django-messages alert, 5 tones" viewport="700x260"
 */
export function Alert(props: AlertProps): JSX.Element;
