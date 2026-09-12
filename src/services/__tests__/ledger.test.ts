import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol, listAllocations, listSales, getLot, getSale } from '../../db/repo';
import { InsufficientLotsError } from '../../core/fifo';
import { addLot, editLot, deleteLot, addSale, editSale, deleteSale, rebuildLedger } from '../ledger';
import type { SqlDatabase } from '../../db/sqlDatabase';
import type { NewLotInput, NewSaleInput } from '../ledger';

function freshDbWithSymbol(): { db: SqlDatabase; symbolId: number } {
  const db = openTestDatabase();
  runMigrations(db);
  const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
  return { db, symbolId: symbol.id };
}

const lotInput = (symbolId: number, overrides: Partial<NewLotInput> = {}): NewLotInput => ({
  symbolId,
  buyDate: '2026-01-01',
  priceUsd: new Decimal('142.35'),
  qty: new Decimal('10'),
  fxRateUsdThb: new Decimal('36.21'),
  evidenceFile: null,
  ...overrides,
});

const saleInput = (symbolId: number, overrides: Partial<NewSaleInput> = {}): NewSaleInput => ({
  symbolId,
  sellDate: '2026-06-01',
  qtySold: new Decimal('4'),
  salePriceUsd: new Decimal('150'),
  feeUsd: new Decimal('0'),
  fxRateUsdThb: new Decimal('36'),
  evidenceFile: null,
  ...overrides,
});

describe('addLot', () => {
  it('stores every monetary field at its fixed decimal-place precision', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    expect(lot.priceUsd).toBe('142.350000');
    expect(lot.qty).toBe('10.00000000');
    expect(lot.fxRateUsdThb).toBe('36.2100');
  });

  it('assigns createdAt itself', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    expect(() => new Date(lot.createdAt).toISOString()).not.toThrow();
  });
});

describe('addSale', () => {
  it('allocates against the existing lot and persists the allocation', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    const sale = addSale(db, saleInput(symbolId));

    const allocations = listAllocations(db, { saleId: sale.id });
    expect(allocations).toEqual([
      { saleId: sale.id, lotId: lot.id, qtyAllocated: '4.00000000', costBasisThb: '20617.9740' },
    ]);
  });

  it('spans a sale across two lots, oldest first', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const older = addLot(db, lotInput(symbolId, { buyDate: '2026-01-01', qty: new Decimal('3') }));
    const newer = addLot(db, lotInput(symbolId, { buyDate: '2026-02-01', qty: new Decimal('3') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('5') }));

    const allocations = listAllocations(db, { saleId: sale.id });
    expect(allocations.map((a) => a.lotId)).toEqual([older.id, newer.id]);
    expect(allocations.map((a) => a.qtyAllocated)).toEqual(['3.00000000', '2.00000000']);
  });

  it('rolls back entirely when the sale cannot be covered', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('1') }));

    expect(() => addSale(db, saleInput(symbolId, { qtySold: new Decimal('5') }))).toThrow(InsufficientLotsError);

    expect(listSales(db)).toHaveLength(0);
    expect(listAllocations(db)).toHaveLength(0);
  });
});

describe('editLot', () => {
  it('rebuilds allocations after the edit', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    editLot(db, lot.id, lotInput(symbolId, { qty: new Decimal('20') }));

    expect(getLot(db, lot.id)?.qty).toBe('20.00000000');
    expect(listAllocations(db, { saleId: sale.id })[0]?.qtyAllocated).toBe('4.00000000');
  });

  it('rolls back the edit when it would break an existing sale', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    addSale(db, saleInput(symbolId, { qtySold: new Decimal('8') }));

    expect(() => editLot(db, lot.id, lotInput(symbolId, { qty: new Decimal('2') })))
      .toThrow(InsufficientLotsError);

    expect(getLot(db, lot.id)?.qty).toBe('10.00000000');
  });
});

describe('deleteLot', () => {
  it('rolls back when deleting a lot would leave a sale uncovered', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    expect(() => deleteLot(db, lot.id)).toThrow(InsufficientLotsError);
    expect(getLot(db, lot.id)).not.toBeNull();
  });

  it('succeeds when no sale depends on the lot', () => {
    const { db, symbolId } = freshDbWithSymbol();
    const lot = addLot(db, lotInput(symbolId));
    deleteLot(db, lot.id);
    expect(getLot(db, lot.id)).toBeNull();
  });
});

describe('editSale', () => {
  it('rebuilds allocations to match the new quantity', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    editSale(db, sale.id, saleInput(symbolId, { qtySold: new Decimal('6') }));

    expect(listAllocations(db, { saleId: sale.id })[0]?.qtyAllocated).toBe('6.00000000');
  });
});

describe('deleteSale', () => {
  it('clears the sale\'s allocations', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    deleteSale(db, sale.id);

    expect(getSale(db, sale.id)).toBeNull();
    expect(listAllocations(db)).toHaveLength(0);
  });
});

describe('rebuildLedger', () => {
  it('is safe to call directly and is idempotent', () => {
    const { db, symbolId } = freshDbWithSymbol();
    addLot(db, lotInput(symbolId, { qty: new Decimal('10') }));
    const sale = addSale(db, saleInput(symbolId, { qtySold: new Decimal('4') }));

    rebuildLedger(db);
    rebuildLedger(db);

    expect(listAllocations(db, { saleId: sale.id })).toHaveLength(1);
  });
});
