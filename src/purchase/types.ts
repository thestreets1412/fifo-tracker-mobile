export const DEFAULT_PDF_ENTITLEMENT = 'pdf_reports';

export interface PdfProduct {
  id: string;
  title: string;
  description: string;
  price: string;
}

export interface PurchaseState {
  mode: 'idle' | 'loading' | 'ready' | 'unconfigured' | 'error';
  entitled: boolean;
  product: PdfProduct | null;
  busy: boolean;
  error?: string;
}

export interface PurchaseDeps {
  configured(): boolean;
  initialize(): Promise<void>;
  entitlement(): Promise<boolean>;
  offering(): Promise<PdfProduct | null>;
  purchase(productId: string): Promise<{ cancelled: boolean; entitled: boolean }>;
  restore(): Promise<boolean>;
}
