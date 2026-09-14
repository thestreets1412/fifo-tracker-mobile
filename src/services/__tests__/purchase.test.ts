import { PurchaseController } from '../purchase';
import type { PurchaseDeps } from '../../purchase/types';

function fixture(configured = true) {
  let entitled = false;
  const deps: jest.Mocked<PurchaseDeps> = {
    configured: jest.fn(() => configured),
    initialize: jest.fn(async () => {}),
    entitlement: jest.fn(async () => entitled),
    offering: jest.fn(async () => ({ id: 'lifetime', title: 'PDF Reports', description: 'One-time purchase', price: '฿99.00' })),
    purchase: jest.fn(async (_productId: string) => { entitled = true; return { cancelled: false, entitled: true }; }),
    restore: jest.fn(async () => entitled),
  };
  return { deps, controller: new PurchaseController(deps) };
}

test('fails closed when the RevenueCat build configuration is absent', async () => {
  const { deps, controller } = fixture(false);
  await expect(controller.load()).resolves.toBe(false);
  expect(controller.snapshot()).toMatchObject({ mode: 'unconfigured', entitled: false, product: null });
  expect(deps.initialize).not.toHaveBeenCalled();
});

test('loads an entitlement and current offering', async () => {
  const { deps, controller } = fixture();
  await expect(controller.load()).resolves.toBe(false);
  expect(controller.snapshot()).toMatchObject({ mode: 'ready', entitled: false, product: { id: 'lifetime', price: '฿99.00' } });
  expect(deps.initialize).toHaveBeenCalledTimes(1);
  expect(deps.entitlement).toHaveBeenCalledTimes(1);
});

test('purchase only unlocks PDF after the provider returns the entitlement', async () => {
  const { deps, controller } = fixture();
  deps.purchase.mockResolvedValueOnce({ cancelled: false, entitled: false });
  await controller.load();
  await expect(controller.purchase()).resolves.toBe('failed');
  expect(controller.snapshot().entitled).toBe(false);
  await expect(controller.purchase()).resolves.toBe('purchased');
  expect(controller.snapshot().entitled).toBe(true);
});

test('cancelled purchase leaves PDF locked and restore only grants a real entitlement', async () => {
  const { deps, controller } = fixture();
  deps.purchase.mockResolvedValueOnce({ cancelled: true, entitled: false });
  await controller.load();
  await expect(controller.purchase()).resolves.toBe('cancelled');
  await expect(controller.restore()).resolves.toBe('none');
  deps.restore.mockResolvedValueOnce(true);
  await expect(controller.restore()).resolves.toBe('restored');
  expect(controller.snapshot().entitled).toBe(true);
});

test('provider failures do not unlock PDF', async () => {
  const { deps, controller } = fixture();
  deps.entitlement.mockRejectedValueOnce(new Error('offline'));
  await expect(controller.load()).resolves.toBe(false);
  expect(controller.snapshot()).toMatchObject({ mode: 'error', entitled: false });
});
