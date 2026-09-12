import * as React from "react";

export interface NavbarLink {
  label: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

export interface NavbarProps {
  brand?: string;
  links?: NavbarLink[];
  user?: string;
  onLogout?: () => void;
}

/**
 * @startingPoint section="Components" subtitle="Dark top navbar with brand, nav links, auth state" viewport="700x140"
 */
export function Navbar(props: NavbarProps): JSX.Element;
