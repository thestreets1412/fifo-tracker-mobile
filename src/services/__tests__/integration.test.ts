import Decimal from 'decimal.js';
import { openTestDatabase } from '../../db/__tests__/testDatabase';
import { runMigrations } from '../../db/schema';
import { createSymbol, listLots, listSales, listAllocations } from '../../db/repo';
import { fromStored } from '../../core/money';
import { lotQtyRemaining, saleCapitalGainThb } from '../../core/derive';
import { addLot, addSale, deleteSale } from '../ledger';
import type { Allocation } from '../../core/types';

/**
 * Proves the whole stack composes: a form-shaped Decimal input persists
 * through services/ledger.ts -> db/repo.ts -> SQLite TEXT columns and back
 * out through core/derive.ts, with no precision lost anywhere in the round
 * trip. This is the storage-round-trip proof plan 1's final review noted
 * core/money.ts never got on its own.
 */
describe('core + db + services integration', () => {
  it('a buy then a sell round-trips through storage with exact allocation and gain', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');

    const lot = addLot(db, {
      symbolId: symbol.id,
      buyDate: '2026-01-01',
      priceUsd: new Decimal('142.35'),
      qty: new Decimal('10'),
      fxRateUsdThb: new Decimal('36.21'),
      evidenceFile: null,
    });

    const sale = addSale(db, {
      symbolId: symbol.id,
      sellDate: '2026-06-01',
      qtySold: new Decimal('4'),
      salePriceUsd: new Decimal('150'),
      feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'),
      evidenceFile: null,
    });

    const allocationRows = listAllocations(db, { saleId: sale.id });
    const allocations: Allocation[] = allocationRows.map((row) => ({
      saleId: row.saleId,
      lotId: row.lotId,
      qtyAllocated: fromStored(row.qtyAllocated),
      costBasisThb: fromStored(row.costBasisThb),
    }));

    const lotRow = listLots(db, symbol.id)[0]!;
    const domainLot = {
      id: lotRow.id,
      symbolId: lotRow.symbolId,
      buyDate: lotRow.buyDate,
      priceUsd: fromStored(lotRow.priceUsd),
      qty: fromStored(lotRow.qty),
      fxRateUsdThb: fromStored(lotRow.fxRateUsdThb),
      createdAt: lotRow.createdAt,
      evidenceFile: lotRow.evidenceFile,
    };

    // 10 - 4 = 6 remaining on the lot, exactly.
    expect(lotQtyRemaining(domainLot, allocations).equals(new Decimal('6'))).toBe(true);

    const saleRow = listSales(db, symbol.id)[0]!;
    const domainSale = {
      id: saleRow.id,
      symbolId: saleRow.symbolId,
      sellDate: saleRow.sellDate,
      qtySold: fromStored(saleRow.qtySold),
      salePriceUsd: fromStored(saleRow.salePriceUsd),
      feeUsd: fromStored(saleRow.feeUsd),
      fxRateUsdThb: fromStored(saleRow.fxRateUsdThb),
      createdAt: saleRow.createdAt,
      evidenceFile: saleRow.evidenceFile,
    };

    // proceeds = 4*150*36 = 21600 (sale's own FX rate)
    // cost basis per allocation uses the LOT's FX rate, never the sale's:
    // 4 * 142.35 * 36.21 = 20617.974 -> stored at 4dp = 20617.9740
    expect(allocationRows[0]!.costBasisThb).toBe('20617.9740');
    const gain = saleCapitalGainThb(domainSale, allocations);
    expect(gain.equals(new Decimal('21600').minus('20617.9740'))).toBe(true);
  });

  it('deleting the sale clears its allocation and the lot returns to full quantity', () => {
    const db = openTestDatabase();
    runMigrations(db);
    const symbol = createSymbol(db, 'NVDA', 'NVIDIA');
    addLot(db, {
      symbolId: symbol.id, buyDate: '2026-01-01', priceUsd: new Decimal('100'),
      qty: new Decimal('10'), fxRateUsdThb: new Decimal('36'), evidenceFile: null,
    });
    const sale = addSale(db, {
      symbolId: symbol.id, sellDate: '2026-06-01', qtySold: new Decimal('4'),
      salePriceUsd: new Decimal('150'), feeUsd: new Decimal('0'),
      fxRateUsdThb: new Decimal('36'), evidenceFile: null,
    });

    deleteSale(db, sale.id);

    expect(listAllocations(db)).toHaveLength(0);
    const lotRow = listLots(db, symbol.id)[0]!;
    expect(lotQtyRemaining(
      {
        id: lotRow.id, symbolId: lotRow.symbolId, buyDate: lotRow.buyDate,
        priceUsd: fromStored(lotRow.priceUsd), qty: fromStored(lotRow.qty),
        fxRateUsdThb: fromStored(lotRow.fxRateUsdThb), createdAt: lotRow.createdAt,
        evidenceFile: lotRow.evidenceFile,
      },
      [],
    ).equals(new Decimal('10'))).toBe(true);
  });
});
