import * as React from "react";

export interface TableProps {
  columns: string[];
  children?: React.ReactNode;
}

/**
 * @startingPoint section="Components" subtitle="Striped, hoverable data table (Lots / Sell History)" viewport="700x340"
 */
export function Table(props: TableProps): JSX.Element;

export interface TableRowProps {
  index?: number;
  children?: React.ReactNode;
}
export function TableRow(props: TableRowProps): JSX.Element;

export interface TableCellProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function TableCell(props: TableCellProps): JSX.Element;
