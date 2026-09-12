import * as React from "react";

export interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

/**
 * @startingPoint section="Components" subtitle="Record Buy / Record Sell dialog shell" viewport="700x360"
 */
export function Modal(props: ModalProps): JSX.Element;
