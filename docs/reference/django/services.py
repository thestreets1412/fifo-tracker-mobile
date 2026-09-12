import json
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

import yfinance

from django.db import transaction
from django.db.models import Q, Sum

from .models import StockLot, Sale, SaleAllocation, Symbol


class InsufficientLotsError(Exception):
    """Raised when there isn't enough remaining quantity across all lots to cover a sale."""
    pass


class FxRateFetchError(Exception):
    """Raised when the USD→THB rate can't be auto-fetched for a given date."""
    pass


class PriceFetchError(Exception):
    """Raised when the current market price can't be fetched for a ticker."""
    pass


def parse_date_param(value):
    """
    Parses a GET-param date string ('YYYY-MM-DD') into a date, or None if
    the value is missing/blank/malformed. Used by every view that accepts
    an optional date_from/date_to filter.
    """
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def fetch_usd_thb_rate(rate_date):
    """
    Looks up the USD→THB rate for rate_date via the free, open-source,
    no-key-required Frankfurter API (ECB + central bank data).
    """
    url = f'https://api.frankfurter.app/{rate_date.isoformat()}?from=USD&to=THB'
    request = Request(url, headers={'User-Agent': 'stock-fifo-web-app/1.0'})
    try:
        with urlopen(request, timeout=5) as response:
            payload = json.load(response)
        return Decimal(str(payload['rates']['THB']))
    except (URLError, HTTPError, KeyError, ValueError, InvalidOperation) as exc:
        raise FxRateFetchError(f'Could not fetch USD/THB rate for {rate_date}: {exc}') from exc


def get_user_lots(owner, symbol_id=None, date_from=None, date_to=None):
    queryset = StockLot.objects.filter(owner=owner).select_related('symbol')
    if symbol_id:
        queryset = queryset.filter(symbol_id=symbol_id)
    if date_from:
        queryset = queryset.filter(buy_date__gte=date_from)
    if date_to:
        queryset = queryset.filter(buy_date__lte=date_to)

    if date_from or date_to:
        allocation_filter = Q()
        if date_from:
            allocation_filter &= Q(allocations__sale__sell_date__gte=date_from)
        if date_to:
            allocation_filter &= Q(allocations__sale__sell_date__lte=date_to)
        queryset = queryset.annotate(
            windowed_qty_allocated=Sum('allocations__qty_allocated', filter=allocation_filter)
        )
    else:
        queryset = queryset.annotate(
            windowed_qty_allocated=Sum('allocations__qty_allocated')
        )

    # The Sum() annotation above turns this into a GROUP BY query, which makes
    # Django drop StockLot.Meta.ordering (no ORDER BY is emitted). Re-assert
    # FIFO order explicitly here — same key as Meta.ordering and record_sale().
    queryset = queryset.order_by('buy_date', 'created_at')

    lots = list(queryset)
    for lot in lots:
        lot.windowed_remaining = lot.qty - (lot.windowed_qty_allocated or Decimal('0'))
    return lots


def get_user_sales(owner, symbol_id=None, date_from=None, date_to=None):
    queryset = (
        Sale.objects
        .filter(owner=owner)
        .select_related('symbol')
        .prefetch_related('allocations__lot')
    )
    if symbol_id:
        queryset = queryset.filter(symbol_id=symbol_id)
    if date_from:
        queryset = queryset.filter(sell_date__gte=date_from)
    if date_to:
        queryset = queryset.filter(sell_date__lte=date_to)

    if date_from or date_to:
        lot_filter = Q()
        if date_from:
            lot_filter &= Q(allocations__lot__buy_date__gte=date_from)
        if date_to:
            lot_filter &= Q(allocations__lot__buy_date__lte=date_to)
        queryset = queryset.annotate(
            windowed_cost_basis_thb=Sum('allocations__cost_basis_thb', filter=lot_filter)
        )
    else:
        queryset = queryset.annotate(
            windowed_cost_basis_thb=Sum('allocations__cost_basis_thb')
        )

    sales = list(queryset)
    for sale in sales:
        cost_basis = sale.windowed_cost_basis_thb or Decimal('0')
        sale.windowed_cost_basis_thb = cost_basis
        sale.windowed_capital_gain_thb = sale.proceeds_thb - cost_basis
    return sales


def build_fifo_report(owner, symbol_id=None, date_from=None, date_to=None):
    """
    Groups every buy lot and sell allocation by ticker, in FIFO order, so a
    report can show — per symbol — which lots are still open, which are
    exhausted, and exactly which lots fed each sale.

    When date_from/date_to are given, only lots bought and sales made
    inside that window are considered anywhere in this function — see the
    "Known tradeoff" note in docs/superpowers/plans/2026-07-19-date-range-filter.md
    for what that means for cross-window sales. PortfolioReportView (the
    downloadable FIFO Report) never passes these — it's out of scope for
    this filter.
    """
    symbols = (
        Symbol.objects
        .filter(Q(lots__owner=owner) | Q(sales__owner=owner))
        .distinct()
        .order_by('ticker')
    )
    if symbol_id:
        symbols = symbols.filter(pk=symbol_id)

    sections = []
    for symbol in symbols:
        lots = get_user_lots(owner, symbol.pk, date_from, date_to)  # FIFO order — get_user_lots sorts explicitly
        sales = sorted(
            get_user_sales(owner, symbol.pk, date_from, date_to),
            key=lambda sale: (sale.sell_date, sale.created_at),
        )
        if not lots and not sales:
            continue

        for sale in sales:
            sale.allocations_sorted = sorted(sale.allocations.all(), key=lambda alloc: alloc.lot.buy_date)

        total_bought_qty = sum((lot.qty for lot in lots), Decimal('0'))
        remaining_qty = sum((lot.windowed_remaining for lot in lots), Decimal('0'))
        remaining_cost_thb = sum(
            (lot.windowed_remaining * lot.price_usd * lot.fx_rate_usd_thb for lot in lots), Decimal('0')
        )
        total_sold_qty = sum((sale.qty_sold for sale in sales), Decimal('0'))
        realized_gain_thb = sum((sale.windowed_capital_gain_thb for sale in sales), Decimal('0'))

        sections.append({
            'symbol': symbol,
            'lots': lots,
            'sales': sales,
            'total_bought_qty': total_bought_qty,
            'total_sold_qty': total_sold_qty,
            'remaining_qty': remaining_qty,
            'remaining_cost_thb': remaining_cost_thb,
            'realized_gain_thb': realized_gain_thb,
        })
    return sections


PRICE_FETCH_TIMEOUT_SECONDS = 5


def _fetch_last_price(ticker):
    info = yfinance.Ticker(ticker).fast_info
    price = info.get('last_price') if isinstance(info, dict) else info.last_price
    if price is None:
        raise ValueError(f'No last_price available for {ticker}')
    return Decimal(str(price))


def fetch_current_price(ticker):
    """
    Looks up the latest USD market price for a ticker via yfinance.
    Bounded to PRICE_FETCH_TIMEOUT_SECONDS — yfinance has no built-in
    request timeout for fast_info, and without one a slow/rate-limited
    upstream can hang the whole dashboard request. Runs in a worker thread
    so a timeout can be enforced without touching global socket state
    (which would race across concurrently-served requests).
    """
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        return executor.submit(_fetch_last_price, ticker).result(timeout=PRICE_FETCH_TIMEOUT_SECONDS)
    except FutureTimeoutError as exc:
        raise PriceFetchError(f'Timed out fetching current price for {ticker}') from exc
    except (ValueError, InvalidOperation, KeyError, AttributeError, TypeError) as exc:
        raise PriceFetchError(f'Could not fetch current price for {ticker}: {exc}') from exc
    except Exception as exc:  # yfinance/network errors don't share a common base class
        raise PriceFetchError(f'Could not fetch current price for {ticker}: {exc}') from exc
    finally:
        executor.shutdown(wait=False)


def build_dashboard_summary(owner, date_from=None, date_to=None):
    """
    Builds the home-page portfolio dashboard: totals plus a per-symbol
    breakdown of cost basis vs. live market value. Reuses build_fifo_report()
    for cost basis/remaining qty/realized gain, then layers today's market
    price + FX rate on top for the "live" figures.

    A symbol whose live price can't be fetched degrades gracefully — its
    current_value_thb/unrealized figures come back as None rather than
    breaking the whole dashboard.
    """
    sections = build_fifo_report(owner, date_from=date_from, date_to=date_to)

    try:
        today_fx_rate = fetch_usd_thb_rate(date.today())
    except FxRateFetchError:
        today_fx_rate = None

    rows = []
    total_cost_thb = Decimal('0')
    total_value_thb = Decimal('0')
    total_unrealized_gain_thb = Decimal('0')
    total_realized_gain_thb = Decimal('0')
    has_full_value = today_fx_rate is not None

    for section in sections:
        symbol = section['symbol']
        remaining_qty = section['remaining_qty']
        cost_thb = section['remaining_cost_thb']
        realized_gain_thb = section['realized_gain_thb']

        total_cost_thb += cost_thb
        total_realized_gain_thb += realized_gain_thb

        current_value_thb = None
        unrealized_gain_thb = None
        unrealized_gain_pct = None

        if today_fx_rate is not None and remaining_qty > 0:
            try:
                current_price_usd = fetch_current_price(symbol.ticker)
            except PriceFetchError:
                has_full_value = False
            else:
                current_value_thb = remaining_qty * current_price_usd * today_fx_rate
                unrealized_gain_thb = current_value_thb - cost_thb
                if cost_thb > 0:
                    unrealized_gain_pct = (unrealized_gain_thb / cost_thb) * 100
        elif remaining_qty > 0:
            has_full_value = False

        if current_value_thb is not None:
            total_value_thb += current_value_thb
        if unrealized_gain_thb is not None:
            total_unrealized_gain_thb += unrealized_gain_thb

        rows.append({
            'symbol': symbol,
            'remaining_qty': remaining_qty,
            'cost_thb': cost_thb,
            'current_value_thb': current_value_thb,
            'unrealized_gain_thb': unrealized_gain_thb,
            'unrealized_gain_pct': unrealized_gain_pct,
            'realized_gain_thb': realized_gain_thb,
        })

    allocation = [
        {'ticker': row['symbol'].ticker, 'cost_thb': float(row['cost_thb'])}
        for row in rows if row['cost_thb'] > 0
    ]

    return {
        'rows': rows,
        'allocation': allocation,
        'total_cost_thb': total_cost_thb,
        'total_value_thb': total_value_thb if has_full_value else None,
        'total_unrealized_gain_thb': total_unrealized_gain_thb if has_full_value else None,
        'total_realized_gain_thb': total_realized_gain_thb,
    }


@transaction.atomic
def record_sale(*, owner, symbol, sell_date, qty_sold, 
                sale_price_usd, fee_usd, fx_rate_usd_thb, 
                evidence=None):
    """
    Creates a Sale and allocates it against StockLots oldest-first (FIFO).
    Returns the created Sale instance.
    """
    qty_sold = Decimal(qty_sold)

    # Lock the candidate lots for this symbol/owner so two simultaneous
    # sales can't both read the same "remaining" qty and double-spend it.
    lots = (
        StockLot.objects
        .select_for_update()
        .filter(owner=owner, symbol=symbol)
        .order_by('buy_date', 'created_at')  # oldest first = FIFO
    )

    # Create the Sale record first — allocations will reference it.
    sale = Sale.objects.create(
        owner=owner,
        symbol=symbol,
        sell_date=sell_date,
        qty_sold=qty_sold,
        sale_price_usd=sale_price_usd,
        fee_usd=fee_usd,
        fx_rate_usd_thb=fx_rate_usd_thb,
        evidence = evidence,
    )

    remaining_to_allocate = qty_sold
    allocations_to_create = []

    for lot in lots:
        if remaining_to_allocate <= 0:
            break

        available = lot.qty_remaining  # computed property: qty - already allocated
        if available <= 0:
            continue  # this lot is already fully consumed, skip it

        take = min(available, remaining_to_allocate)

        allocations_to_create.append(
            SaleAllocation(
                sale=sale,
                lot=lot,
                qty_allocated=take,
                cost_basis_thb=take * lot.price_usd * lot.fx_rate_usd_thb,
            )
        )
        remaining_to_allocate -= take

    if remaining_to_allocate > 0:
        # Not enough total remaining quantity across all lots to cover this sale.
        # Raising here triggers Django's @transaction.atomic to roll back
        # everything above — the Sale we just created gets undone too.
        raise InsufficientLotsError(
            f"Tried to sell {qty_sold} of {symbol}, but only "
            f"{qty_sold - remaining_to_allocate} is available across all lots."
        )

    SaleAllocation.objects.bulk_create(allocations_to_create)
    return sale