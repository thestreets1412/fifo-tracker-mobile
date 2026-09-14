import { PurchaseController } from '../services/purchase';
import { revenueCatPlatform } from './platform';

export const purchaseController = new PurchaseController(revenueCatPlatform);
