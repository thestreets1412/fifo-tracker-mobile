import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { DEFAULT_PDF_ENTITLEMENT, type PdfProduct, type PurchaseDeps } from './types';

const apiKey = (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '').trim();
const entitlementId = (process.env.EXPO_PUBLIC_REVENUECAT_PDF_ENTITLEMENT ?? DEFAULT_PDF_ENTITLEMENT).trim();
const packages = new Map<string, PurchasesPackage>();

function hasPdfEntitlement(info: CustomerInfo): boolean {
  return Object.prototype.hasOwnProperty.call(info.entitlements.active, entitlementId);
}

function productFor(value: PurchasesPackage): PdfProduct {
  return {
    id: value.identifier,
    title: value.product.title,
    description: value.product.description,
    price: value.product.priceString,
  };
}

function purchaseCancelled(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'userCancelled' in error
    && (error as { userCancelled?: unknown }).userCancelled === true;
}

export const revenueCatPlatform: PurchaseDeps = {
  configured: () => apiKey.length > 0 && entitlementId.length > 0,
  async initialize() {
    if (!apiKey) throw new Error('RevenueCat is not configured');
    if (!await Purchases.isConfigured()) {
      Purchases.configure({
        apiKey,
        diagnosticsEnabled: false,
        automaticDeviceIdentifierCollectionEnabled: false,
      });
    }
  },
  async entitlement() { return hasPdfEntitlement(await Purchases.getCustomerInfo()); },
  async offering() {
    const offering = (await Purchases.getOfferings()).current;
    // PDF is explicitly a one-time purchase; never silently sell a subscription.
    const packageForPdf = offering?.lifetime ?? null;
    if (!packageForPdf) return null;
    packages.set(packageForPdf.identifier, packageForPdf);
    return productFor(packageForPdf);
  },
  async purchase(productId) {
    const pkg = packages.get(productId);
    if (!pkg) throw new Error('Offering expired');
    try {
      const result = await Purchases.purchasePackage(pkg);
      return { cancelled: false, entitled: hasPdfEntitlement(result.customerInfo) };
    } catch (error) {
      if (purchaseCancelled(error)) return { cancelled: true, entitled: false };
      throw error;
    }
  },
  async restore() { return hasPdfEntitlement(await Purchases.restorePurchases()); },
};
