from django.conf import settings
from django.db import models
from django.db.models import Sum


class Symbol(models.Model):
    """A tradable ticker, e.g. NVDA, TSLA, SGOV — powers the dropdown."""
    ticker = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ['ticker']

    def __str__(self):
        return self.ticker


class StockLot(models.Model):
    """
    One BUY transaction. Immutable once created — never edited after the fact.
    'Remaining quantity' is NEVER stored here; it's always calculated
    from qty minus whatever SaleAllocations have consumed it.
    """
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='stock_lots')
    symbol = models.ForeignKey(Symbol, on_delete=models.PROTECT, related_name='lots')
    buy_date = models.DateField()
    price_usd = models.DecimalField(max_digits=14, decimal_places=6)
    qty = models.DecimalField(max_digits=18, decimal_places=8)
    fx_rate_usd_thb = models.DecimalField(max_digits=10, decimal_places=4)
    created_at = models.DateTimeField(auto_now_add=True)
    evidence = models.ImageField(upload_to='lot_evidence/', blank=True, null=True)

    class Meta:
        ordering = ['buy_date', 'created_at']  # FIFO order lives right here , 'created_at'

    def __str__(self):
        return f"{self.symbol} lot @ {self.buy_date} ({self.qty})"

    @property
    def cost_thb(self):
        return self.price_usd * self.qty * self.fx_rate_usd_thb

    @property
    def qty_allocated(self):
        return self.allocations.aggregate(total=Sum('qty_allocated'))['total'] or 0

    @property
    def qty_remaining(self):
        return self.qty - self.qty_allocated


class Sale(models.Model):
    """One SELL transaction. Also immutable — allocations are derived, not edited in place."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sales')
    symbol = models.ForeignKey(Symbol, on_delete=models.PROTECT, related_name='sales')
    sell_date = models.DateField()
    qty_sold = models.DecimalField(max_digits=18, decimal_places=8)
    sale_price_usd = models.DecimalField(max_digits=14, decimal_places=6)
    fee_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    fx_rate_usd_thb = models.DecimalField(max_digits=10, decimal_places=4)
    created_at = models.DateTimeField(auto_now_add=True)
    evidence = models.ImageField(upload_to='sale_evidence/', blank=True, null=True)

    class Meta:
        ordering = ['sell_date', 'created_at']  # FIFO order — matches StockLot.Meta.ordering 

    def __str__(self):
        return f"{self.symbol} sale @ {self.sell_date} ({self.qty_sold})"

    @property
    def proceeds_thb(self):
        return (self.sale_price_usd * self.qty_sold - self.fee_usd) * self.fx_rate_usd_thb

    @property
    def total_cost_basis_thb(self):
        return self.allocations.aggregate(total=Sum('cost_basis_thb'))['total'] or 0

    @property
    def capital_gain_thb(self):
        return self.proceeds_thb - self.total_cost_basis_thb


class SaleAllocation(models.Model):
    """
    The missing piece from the spreadsheet: links one Sale to the specific
    Lots it drew from, and how much it took from each — this is what makes
    a single sale able to span multiple lots (your SGOV '5,6,7,8,9,10' case).
    """
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='allocations')
    lot = models.ForeignKey(StockLot, on_delete=models.PROTECT, related_name='allocations')
    qty_allocated = models.DecimalField(max_digits=18, decimal_places=8)
    cost_basis_thb = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(qty_allocated__gt=0), name='qty_allocated_positive')
        ]

    def __str__(self):
        return f"{self.sale} <- {self.qty_allocated} from {self.lot}"