import * as React from "react";

export interface FormFieldProps {
  label?: string;
  helpText?: string;
  error?: string;
  children?: React.ReactNode;
}

/**
 * @startingPoint section="Components" subtitle="Labeled field wrapper + text/select/file inputs" viewport="700x320"
 */
export function FormField(props: FormFieldProps): JSX.Element;

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export function TextInput(props: TextInputProps): JSX.Element;

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}
export function Select(props: SelectProps): JSX.Element;

export interface FileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export function FileInput(props: FileInputProps): JSX.Element;
