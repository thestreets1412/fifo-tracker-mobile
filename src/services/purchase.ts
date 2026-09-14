import type { PdfProduct, PurchaseDeps, PurchaseState } from '../purchase/types';

const initial: PurchaseState = { mode: 'idle', entitled: false, product: null, busy: false };

/** Platform-independent entitlement state. It never receives portfolio data. */
export class PurchaseController {
  private state = initial;
  private listeners = new Set<() => void>();
  constructor(private readonly deps: PurchaseDeps) {}

  snapshot = (): PurchaseState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private emit(patch: Partial<PurchaseState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async load(): Promise<boolean> {
    if (this.state.busy) return this.state.entitled;
    if (!this.deps.configured()) {
      this.emit({ mode: 'unconfigured', entitled: false, product: null, error: undefined });
      return false;
    }
    this.emit({ mode: 'loading', busy: true, error: undefined });
    try {
      await this.deps.initialize();
      const [entitled, product] = await Promise.all([this.deps.entitlement(), this.deps.offering()]);
      this.emit({ mode: 'ready', entitled, product, busy: false });
      return entitled;
    } catch {
      this.emit({ mode: 'error', entitled: false, product: null, busy: false, error: 'ตรวจสอบสิทธิ์ PDF ไม่สำเร็จ' });
      return false;
    }
  }

  async purchase(): Promise<'purchased' | 'cancelled' | 'unavailable' | 'failed'> {
    if (this.state.busy) return 'failed';
    if (this.state.mode !== 'ready') await this.load();
    const product: PdfProduct | null = this.state.product;
    if (this.state.entitled) return 'purchased';
    if (!product || this.state.mode !== 'ready') return 'unavailable';
    this.emit({ busy: true, error: undefined });
    try {
      const result = await this.deps.purchase(product.id);
      if (result.cancelled) {
        this.emit({ busy: false });
        return 'cancelled';
      }
      this.emit({ entitled: result.entitled, busy: false });
      return result.entitled ? 'purchased' : 'failed';
    } catch {
      this.emit({ busy: false, error: 'ซื้อ PDF ไม่สำเร็จ กรุณาลองใหม่' });
      return 'failed';
    }
  }

  async restore(): Promise<'restored' | 'none' | 'failed'> {
    if (this.state.busy) return 'failed';
    if (this.state.mode !== 'ready') await this.load();
    if (this.state.mode !== 'ready') return 'failed';
    this.emit({ busy: true, error: undefined });
    try {
      const entitled = await this.deps.restore();
      this.emit({ entitled, busy: false });
      return entitled ? 'restored' : 'none';
    } catch {
      this.emit({ busy: false, error: 'กู้คืนการซื้อไม่สำเร็จ กรุณาลองใหม่' });
      return 'failed';
    }
  }
}
