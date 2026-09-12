from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import StockLot, Symbol, Sale, SaleAllocation
from .services import (
    PriceFetchError, build_dashboard_summary, build_fifo_report,
    parse_date_param, get_user_lots, get_user_sales,
)

User = get_user_model()


class BuildDashboardSummaryTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.aapl = Symbol.objects.create(ticker='AAPL')
        self.tsla = Symbol.objects.create(ticker='TSLA')

    def test_no_lots_returns_zeroed_summary(self):
        summary = build_dashboard_summary(self.owner)
        self.assertEqual(summary['rows'], [])
        self.assertEqual(summary['allocation'], [])
        self.assertEqual(summary['total_cost_thb'], Decimal('0'))
        self.assertEqual(summary['total_value_thb'], Decimal('0'))
        self.assertEqual(summary['total_unrealized_gain_thb'], Decimal('0'))
        self.assertEqual(summary['total_realized_gain_thb'], Decimal('0'))

    @patch('portfolio.services.fetch_current_price')
    @patch('portfolio.services.fetch_usd_thb_rate')
    def test_computes_live_value_and_unrealized_gain(self, mock_fx, mock_price):
        mock_fx.return_value = Decimal('35')
        mock_price.return_value = Decimal('150')

        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )

        summary = build_dashboard_summary(self.owner)

        self.assertEqual(len(summary['rows']), 1)
        row = summary['rows'][0]
        self.assertEqual(row['cost_thb'], Decimal('33000'))  # 10 * 100 * 33
        self.assertEqual(row['current_value_thb'], Decimal('52500'))  # 10 * 150 * 35
        self.assertEqual(row['unrealized_gain_thb'], Decimal('19500'))
        self.assertEqual(summary['total_value_thb'], Decimal('52500'))
        self.assertEqual(summary['total_unrealized_gain_thb'], Decimal('19500'))
        self.assertEqual(summary['allocation'], [{'ticker': 'AAPL', 'cost_thb': 33000.0}])

    @patch('portfolio.services.fetch_current_price')
    @patch('portfolio.services.fetch_usd_thb_rate')
    def test_price_fetch_failure_degrades_gracefully(self, mock_fx, mock_price):
        mock_fx.return_value = Decimal('35')
        mock_price.side_effect = PriceFetchError('boom')

        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )

        summary = build_dashboard_summary(self.owner)

        row = summary['rows'][0]
        self.assertIsNone(row['current_value_thb'])
        self.assertIsNone(row['unrealized_gain_thb'])
        self.assertIsNone(summary['total_value_thb'])
        self.assertIsNone(summary['total_unrealized_gain_thb'])
        # cost basis still shown even when live price fails
        self.assertEqual(summary['total_cost_thb'], Decimal('33000'))

    @patch('portfolio.services.fetch_current_price')
    @patch('portfolio.services.fetch_usd_thb_rate')
    def test_date_filter_narrows_dashboard_to_window(self, mock_fx, mock_price):
        mock_fx.return_value = Decimal('35')
        mock_price.return_value = Decimal('150')

        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2025-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )
        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )

        summary = build_dashboard_summary(
            self.owner, date_from=date(2026, 1, 1), date_to=date(2026, 12, 31),
        )

        self.assertEqual(len(summary['rows']), 1)
        self.assertEqual(summary['rows'][0]['remaining_qty'], Decimal('10'))  # only the 2026 lot


class ParseDateParamTests(TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(parse_date_param(None))

    def test_empty_string_returns_none(self):
        self.assertIsNone(parse_date_param(''))

    def test_valid_iso_date_returns_date(self):
        self.assertEqual(parse_date_param('2026-03-15'), date(2026, 3, 15))

    def test_malformed_string_returns_none(self):
        self.assertIsNone(parse_date_param('not-a-date'))
        self.assertIsNone(parse_date_param('2026-13-40'))


class GetUserLotsDateFilterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.aapl = Symbol.objects.create(ticker='AAPL')
        self.lot_jan = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-10',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )
        self.lot_jun = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-06-10',
            price_usd=Decimal('120'), qty=Decimal('5'), fx_rate_usd_thb=Decimal('34'),
        )

    def test_no_date_filter_returns_all_lots_with_full_remaining(self):
        lots = get_user_lots(self.owner)
        self.assertEqual(len(lots), 2)
        by_date = {lot.buy_date: lot for lot in lots}
        self.assertEqual(by_date[date(2026, 1, 10)].windowed_remaining, Decimal('10'))
        self.assertEqual(by_date[date(2026, 6, 10)].windowed_remaining, Decimal('5'))

    def test_date_from_excludes_earlier_lots(self):
        lots = get_user_lots(self.owner, date_from=date(2026, 3, 1))
        self.assertEqual([lot.buy_date for lot in lots], [date(2026, 6, 10)])

    def test_date_to_excludes_later_lots(self):
        lots = get_user_lots(self.owner, date_to=date(2026, 3, 1))
        self.assertEqual([lot.buy_date for lot in lots], [date(2026, 1, 10)])

    def test_bounds_are_inclusive(self):
        lots = get_user_lots(self.owner, date_from=date(2026, 1, 10), date_to=date(2026, 1, 10))
        self.assertEqual([lot.buy_date for lot in lots], [date(2026, 1, 10)])

    def test_windowed_remaining_excludes_out_of_window_sales(self):
        sale_in_window = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-02-01',
            qty_sold=Decimal('3'), sale_price_usd=Decimal('110'),
            fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale_in_window, lot=self.lot_jan, qty_allocated=Decimal('3'),
            cost_basis_thb=Decimal('9900'),
        )
        sale_out_of_window = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-08-01',
            qty_sold=Decimal('2'), sale_price_usd=Decimal('115'),
            fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale_out_of_window, lot=self.lot_jan, qty_allocated=Decimal('2'),
            cost_basis_thb=Decimal('6600'),
        )

        # Window only covers Jan-Mar: the Feb sale counts against remaining,
        # the Aug sale (outside window) must not.
        lots = get_user_lots(
            self.owner, date_from=date(2026, 1, 1), date_to=date(2026, 3, 1),
        )
        jan_lot = next(lot for lot in lots if lot.buy_date == date(2026, 1, 10))
        self.assertEqual(jan_lot.windowed_remaining, Decimal('7'))  # 10 - 3, not 10 - 5

        # No window: both sales count, matching the real qty_remaining property.
        lots_unfiltered = get_user_lots(self.owner)
        jan_lot_unfiltered = next(lot for lot in lots_unfiltered if lot.buy_date == date(2026, 1, 10))
        self.assertEqual(jan_lot_unfiltered.windowed_remaining, Decimal('5'))  # 10 - 3 - 2
        self.assertEqual(jan_lot_unfiltered.windowed_remaining, jan_lot_unfiltered.qty_remaining)


class GetUserLotsOrderingTests(TestCase):
    """
    get_user_lots() annotates Sum('allocations__qty_allocated'), which turns
    the query into a GROUP BY and makes Django drop Meta.ordering (no ORDER BY
    in the SQL). Lots must still come back oldest-first (FIFO). Rows are
    inserted newest-first on purpose so that id/insertion order is the REVERSE
    of buy_date order — that is what makes the missing-ORDER BY bug observable
    instead of accidentally passing.
    """

    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.sgov = Symbol.objects.create(ticker='SGOV')
        # Insert NEWEST buy_date first, OLDEST last, so insertion/id order is
        # the opposite of the desired FIFO order.
        self.dates = [
            date(2026, 6, 29),
            date(2026, 4, 10),
            date(2026, 3, 31),
            date(2026, 2, 24),
            date(2026, 1, 5),
        ]
        self.lots = []
        for i, d in enumerate(self.dates):
            self.lots.append(StockLot.objects.create(
                owner=self.owner, symbol=self.sgov, buy_date=d,
                price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
            ))
        # Attach an allocation to a middle subset so the LEFT JOIN + GROUP BY
        # path (the exact trigger seen in production) is exercised.
        sale = Sale.objects.create(
            owner=self.owner, symbol=self.sgov, sell_date='2026-07-01',
            qty_sold=Decimal('4'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale, lot=self.lots[2], qty_allocated=Decimal('2'), cost_basis_thb=Decimal('6600'),
        )
        SaleAllocation.objects.create(
            sale=sale, lot=self.lots[3], qty_allocated=Decimal('2'), cost_basis_thb=Decimal('6600'),
        )

    def test_unfiltered_lots_returned_oldest_first(self):
        lots = get_user_lots(self.owner, self.sgov.pk)
        returned = [lot.buy_date for lot in lots]
        self.assertEqual(returned, sorted(self.dates))

    def test_date_filtered_lots_returned_oldest_first(self):
        # Exercises the OTHER annotate branch (the one with filter=... on the
        # aggregate), which also drops Meta.ordering.
        lots = get_user_lots(
            self.owner, self.sgov.pk,
            date_from=date(2026, 1, 1), date_to=date(2026, 12, 31),
        )
        returned = [lot.buy_date for lot in lots]
        self.assertEqual(returned, sorted(self.dates))


class GetUserSalesDateFilterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.aapl = Symbol.objects.create(ticker='AAPL')
        self.lot_in_window = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )
        self.lot_out_of_window = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2025-01-01',
            price_usd=Decimal('80'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('30'),
        )

    def test_no_date_filter_matches_existing_properties(self):
        sale = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-02-01',
            qty_sold=Decimal('5'), sale_price_usd=Decimal('120'),
            fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale, lot=self.lot_in_window, qty_allocated=Decimal('5'),
            cost_basis_thb=Decimal('16500'),
        )
        sales = get_user_sales(self.owner)
        fetched = sales[0]
        self.assertEqual(fetched.windowed_cost_basis_thb, fetched.total_cost_basis_thb)
        self.assertEqual(fetched.windowed_capital_gain_thb, fetched.capital_gain_thb)

    def test_sell_date_bounds_filter_which_sales_are_returned(self):
        Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-01-15',
            qty_sold=Decimal('1'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-09-15',
            qty_sold=Decimal('1'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        sales = get_user_sales(self.owner, date_from=date(2026, 1, 1), date_to=date(2026, 3, 1))
        self.assertEqual([s.sell_date for s in sales], [date(2026, 1, 15)])

    def test_windowed_cost_basis_excludes_allocations_from_out_of_window_lots(self):
        sale = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-02-01',
            qty_sold=Decimal('6'), sale_price_usd=Decimal('120'),
            fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale, lot=self.lot_in_window, qty_allocated=Decimal('3'),
            cost_basis_thb=Decimal('9900'),  # 3 * 100 * 33
        )
        SaleAllocation.objects.create(
            sale=sale, lot=self.lot_out_of_window, qty_allocated=Decimal('3'),
            cost_basis_thb=Decimal('7200'),  # 3 * 80 * 30
        )

        # Window excludes the 2025 lot -> only the in-window allocation's
        # cost basis should count.
        sales = get_user_sales(
            self.owner, date_from=date(2026, 1, 1), date_to=date(2026, 12, 31),
        )
        fetched = sales[0]
        self.assertEqual(fetched.windowed_cost_basis_thb, Decimal('9900'))
        self.assertEqual(
            fetched.windowed_capital_gain_thb,
            fetched.proceeds_thb - Decimal('9900'),
        )


class BuildFifoReportDateFilterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.aapl = Symbol.objects.create(ticker='AAPL')
        self.tsla = Symbol.objects.create(ticker='TSLA')
        self.lot = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )
        # TSLA lot sits entirely outside the window used below.
        StockLot.objects.create(
            owner=self.owner, symbol=self.tsla, buy_date='2025-01-01',
            price_usd=Decimal('200'), qty=Decimal('4'), fx_rate_usd_thb=Decimal('30'),
        )

    def test_symbols_with_no_data_in_window_are_omitted(self):
        sections = build_fifo_report(
            self.owner, date_from=date(2026, 1, 1), date_to=date(2026, 12, 31),
        )
        tickers = [section['symbol'].ticker for section in sections]
        self.assertEqual(tickers, ['AAPL'])

    def test_remaining_qty_and_cost_use_windowed_values(self):
        sale = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-02-01',
            qty_sold=Decimal('4'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale, lot=self.lot, qty_allocated=Decimal('4'), cost_basis_thb=Decimal('13200'),
        )
        sections = build_fifo_report(
            self.owner, date_from=date(2026, 1, 1), date_to=date(2026, 12, 31),
        )
        aapl_section = sections[0]
        self.assertEqual(aapl_section['remaining_qty'], Decimal('6'))  # 10 - 4
        # Fetch the sale through get_user_sales to get windowed_capital_gain_thb
        fetched_sales = get_user_sales(
            self.owner, self.aapl.pk, date_from=date(2026, 1, 1), date_to=date(2026, 12, 31)
        )
        self.assertEqual(aapl_section['realized_gain_thb'], fetched_sales[0].windowed_capital_gain_thb)

    def test_no_date_filter_still_includes_all_symbols(self):
        sections = build_fifo_report(self.owner)
        tickers = sorted(section['symbol'].ticker for section in sections)
        self.assertEqual(tickers, ['AAPL', 'TSLA'])


class LotListViewDateFilterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.client.force_login(self.owner)
        self.aapl = Symbol.objects.create(ticker='AAPL')
        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2025-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )
        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )

    def test_date_from_and_to_filter_the_lots_table(self):
        response = self.client.get(
            reverse('lot_list'), {'date_from': '2026-01-01', 'date_to': '2026-12-31'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.context['lots']), 1)
        self.assertEqual(response.context['lots'][0].buy_date, date(2026, 1, 1))

    def test_context_carries_selected_dates_for_template_round_trip(self):
        response = self.client.get(
            reverse('lot_list'), {'date_from': '2026-01-01', 'date_to': '2026-12-31'},
        )
        self.assertEqual(response.context['selected_date_from'], '2026-01-01')
        self.assertEqual(response.context['selected_date_to'], '2026-12-31')

    def test_no_date_params_shows_all_lots(self):
        response = self.client.get(reverse('lot_list'))
        self.assertEqual(len(response.context['lots']), 2)
        self.assertEqual(response.context['selected_date_from'], '')
        self.assertEqual(response.context['selected_date_to'], '')


class HomePortfolioListViewTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.client.force_login(self.owner)
        self.aapl = Symbol.objects.create(ticker='AAPL')
        StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )

    def test_get_home_returns_200(self):
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 200)

    def test_home_uses_home_template(self):
        response = self.client.get(reverse('home'))
        self.assertTemplateUsed(response, 'portfolio/home.html')

    def test_home_context_has_dashboard_and_lots(self):
        response = self.client.get(reverse('home'))
        self.assertIn('dashboard', response.context)
        self.assertEqual(len(response.context['lots']), 1)

    def test_home_requires_login(self):
        self.client.logout()
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 302)


class SaleListViewDateFilterTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.client.force_login(self.owner)
        self.aapl = Symbol.objects.create(ticker='AAPL')
        self.lot = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2025-01-01',
            price_usd=Decimal('100'), qty=Decimal('20'), fx_rate_usd_thb=Decimal('33'),
        )
        sale_early = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2025-06-01',
            qty_sold=Decimal('5'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale_early, lot=self.lot, qty_allocated=Decimal('5'), cost_basis_thb=Decimal('16500'),
        )
        sale_late = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-06-01',
            qty_sold=Decimal('5'), sale_price_usd=Decimal('130'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale_late, lot=self.lot, qty_allocated=Decimal('5'), cost_basis_thb=Decimal('16500'),
        )

    def test_date_from_and_to_filter_the_sales_table(self):
        response = self.client.get(
            reverse('sale_list'), {'date_from': '2026-01-01', 'date_to': '2026-12-31'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.context['sales']), 1)
        self.assertEqual(response.context['sales'][0].sell_date, date(2026, 6, 1))

    def test_context_carries_selected_dates_for_template_round_trip(self):
        response = self.client.get(
            reverse('sale_list'), {'date_from': '2026-01-01', 'date_to': '2026-12-31'},
        )
        self.assertEqual(response.context['selected_date_from'], '2026-01-01')
        self.assertEqual(response.context['selected_date_to'], '2026-12-31')


class SaleOrderingMatchesLotOrderingTests(TestCase):
    """
    /sales/ and /lots/ must both list oldest-first (FIFO order) so the two
    tables read consistently. Regression test for the Sale.Meta.ordering
    vs StockLot.Meta.ordering mismatch.
    """

    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.client.force_login(self.owner)
        self.aapl = Symbol.objects.create(ticker='AAPL')
        self.lot = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2025-01-01',
            price_usd=Decimal('100'), qty=Decimal('20'), fx_rate_usd_thb=Decimal('33'),
        )
        self.sale_early = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2025-06-01',
            qty_sold=Decimal('5'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=self.sale_early, lot=self.lot, qty_allocated=Decimal('5'), cost_basis_thb=Decimal('16500'),
        )
        self.sale_late = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-06-01',
            qty_sold=Decimal('5'), sale_price_usd=Decimal('130'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=self.sale_late, lot=self.lot, qty_allocated=Decimal('5'), cost_basis_thb=Decimal('16500'),
        )

    def test_sale_model_default_ordering_is_oldest_first(self):
        sales = list(Sale.objects.filter(owner=self.owner))
        self.assertEqual([s.pk for s in sales], [self.sale_early.pk, self.sale_late.pk])

    def test_sale_list_view_orders_sales_oldest_first(self):
        response = self.client.get(reverse('sale_list'))
        sales = list(response.context['sales'])
        self.assertEqual([s.pk for s in sales], [self.sale_early.pk, self.sale_late.pk])

    def test_sale_list_and_lot_list_agree_on_direction(self):
        lot_response = self.client.get(reverse('lot_list'))
        sale_response = self.client.get(reverse('sale_list'))
        lots = list(lot_response.context['lots'])
        sales = list(sale_response.context['sales'])
        # StockLot is already oldest-first; Sale must match that direction.
        self.assertEqual(lots[0].buy_date, date(2025, 1, 1))
        self.assertEqual(sales[0].sell_date, date(2025, 6, 1))


class LotListTemplateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.client.force_login(self.owner)
        self.aapl = Symbol.objects.create(ticker='AAPL')

    def test_page_renders_from_to_inputs_with_selected_values(self):
        response = self.client.get(
            reverse('lot_list'), {'date_from': '2026-01-01', 'date_to': '2026-06-30'},
        )
        self.assertContains(response, 'name="date_from"')
        self.assertContains(response, 'name="date_to"')
        self.assertContains(response, 'value="2026-01-01"')
        self.assertContains(response, 'value="2026-06-30"')
        self.assertNotContains(response, 'dateCondition')

    def test_search_button_submits_the_filter_form(self):
        response = self.client.get(reverse('lot_list'))
        self.assertContains(response, 'id="symbol"')
        content = response.content.decode()
        symbol_select_start = content.index('id="symbol"')
        # symbol select no longer auto-submits on change (replaced by an explicit Search button)
        tag_end = content.index('>', symbol_select_start)
        self.assertNotIn('onchange="this.form.submit()"', content[symbol_select_start:tag_end])
        # a native submit button, so Enter from inside any filter field works too
        self.assertIn('type="submit"', content)
        self.assertNotIn('onclick="this.form.submit()"', content)


class SaleListTemplateTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='trader', password='pw')
        self.client.force_login(self.owner)
        self.aapl = Symbol.objects.create(ticker='AAPL')

    def test_page_renders_from_to_inputs_with_selected_values(self):
        response = self.client.get(
            reverse('sale_list'), {'date_from': '2026-01-01', 'date_to': '2026-06-30'},
        )
        self.assertContains(response, 'name="date_from"')
        self.assertContains(response, 'name="date_to"')
        self.assertContains(response, 'value="2026-01-01"')
        self.assertContains(response, 'value="2026-06-30"')
        self.assertNotContains(response, 'dateCondition')

    def test_capital_gain_column_uses_windowed_value(self):
        lot = StockLot.objects.create(
            owner=self.owner, symbol=self.aapl, buy_date='2026-01-01',
            price_usd=Decimal('100'), qty=Decimal('10'), fx_rate_usd_thb=Decimal('33'),
        )
        sale = Sale.objects.create(
            owner=self.owner, symbol=self.aapl, sell_date='2026-02-01',
            qty_sold=Decimal('5'), sale_price_usd=Decimal('120'), fx_rate_usd_thb=Decimal('33'),
        )
        SaleAllocation.objects.create(
            sale=sale, lot=lot, qty_allocated=Decimal('5'), cost_basis_thb=Decimal('16500'),
        )
        response = self.client.get(reverse('sale_list'))
        # proceeds_thb = 5 * 120 * 33 = 19800
        # windowed_capital_gain_thb = 19800 - 16500 = 3300
        expected_gain = f"{Decimal('3300'):.2f}".lstrip('-')
        self.assertContains(response, expected_gain)
