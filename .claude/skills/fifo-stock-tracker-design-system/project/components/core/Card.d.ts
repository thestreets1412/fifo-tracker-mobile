import * as React from "react";

export interface CardProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * @startingPoint section="Components" subtitle="Bordered card shell used for login + evidence views" viewport="700x260"
 */
export function Card(props: CardProps): JSX.Element;
export function CardBody(props: CardProps): JSX.Element;
export function CardTitle(props: CardProps): JSX.Element;
