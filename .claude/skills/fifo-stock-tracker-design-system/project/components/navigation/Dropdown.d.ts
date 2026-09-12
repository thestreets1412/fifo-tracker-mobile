import * as React from "react";

export interface DropdownItem {
  label: string;
  href?: string;
}
export interface DropdownProps {
  label: string;
  items: DropdownItem[];
}

/**
 * @startingPoint section="Components" subtitle="FIFO Report (CSV / PDF) menu trigger" viewport="700x200"
 */
export function Dropdown(props: DropdownProps): JSX.Element;
