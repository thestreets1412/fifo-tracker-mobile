import csv
from decimal import Decimal
from io import BytesIO

from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

CSV_HEADERS = ['Ticker', 'Record Type', 'Date', 'Description', 'Price (USD)', 'Qty', 'FX Rate',
               'Value (USD)', 'Value (THB)', 'Qty Remaining', 'Cost Basis (THB)', 'Capital Gain (THB)', 'Notes']

GAIN_COLOR = colors.HexColor('#1e7e34')
LOSS_COLOR = colors.HexColor('#c0392b')
HEADER_BG = colors.HexColor('#2c3e50')


def _fmt_qty(value):
    """Fixed-point, trailing-zero-free display for share quantities — avoids
    Decimal subtraction landing on an ugly '0E-8' when a lot is fully consumed."""
    text = format(value, 'f')
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return text or '0'


def _money(value):
    """Comma-grouped, fixed 2dp display for THB/USD monetary values."""
    return f"{Decimal(value).quantize(Decimal('0.01')):,}"


def _money_thb(value):
    """THB-prefixed comma-grouped 2dp display — for PDF totals/values only
    (CSV keeps bare numbers since it may feed further processing)."""
    return f"THB {_money(value)}"


def _lot_status(lot):
    return 'Open' if lot.qty_remaining > 0 else 'Fully Consumed'


# --------------------------------------------------------------------------
# CSV — flat schema, ticker repeated on every row so pivoting/filtering in
# Excel/Sheets still works even if the "=== TICKER ===" separator rows are
# stripped out. Full Decimal precision is kept (this file may feed further
# processing), unlike the PDF, which trims for readability.
# --------------------------------------------------------------------------

def fifo_report_csv_response(filename, sections):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)

    writer.writerow(['FIFO Portfolio Report'])
    writer.writerow([f'Generated: {timezone.now().strftime("%Y-%m-%d %H:%M")}'])
    writer.writerow([])
    writer.writerow(CSV_HEADERS)

    grand_open_cost = Decimal('0')
    grand_realized_gain = Decimal('0')

    for section in sections:
        ticker = section['symbol'].ticker
        writer.writerow([f'=== TICKER: {ticker} ==='])

        for lot in section['lots']:
            writer.writerow([
                ticker, 'BUY LOT', lot.buy_date.isoformat(), '',
                f'{lot.price_usd:.6f}', f'{lot.qty:.8f}', f'{lot.fx_rate_usd_thb:.4f}',
                f'{lot.price_usd * lot.qty:.2f}', f'{lot.cost_thb:.2f}',
                f'{lot.qty_remaining:.8f}', f'{lot.cost_thb:.2f}', '', _lot_status(lot),
            ])

        for sale in section['sales']:
            writer.writerow([
                ticker, 'SALE', sale.sell_date.isoformat(), '',
                f'{sale.sale_price_usd:.6f}', f'{sale.qty_sold:.8f}', f'{sale.fx_rate_usd_thb:.4f}',
                f'{sale.sale_price_usd * sale.qty_sold - sale.fee_usd:.2f}', f'{sale.proceeds_thb:.2f}',
                '', f'{sale.total_cost_basis_thb:.2f}', f'{sale.capital_gain_thb:.2f}', '',
            ])
            for alloc in sale.allocations_sorted:
                writer.writerow([
                    ticker, '  -> ALLOCATION', alloc.lot.buy_date.isoformat(),
                    f'from lot bought {alloc.lot.buy_date.isoformat()}',
                    '', f'{alloc.qty_allocated:.8f}', '', '', '', '', f'{alloc.cost_basis_thb:.2f}', '', '',
                ])

        writer.writerow([
            ticker, 'TICKER TOTAL', '', '', '', '', '', '', '', '',
            f"{section['remaining_cost_thb']:.2f}", f"{section['realized_gain_thb']:.2f}", '',
        ])
        writer.writerow([])

        grand_open_cost += section['remaining_cost_thb']
        grand_realized_gain += section['realized_gain_thb']

    writer.writerow(['=== PORTFOLIO SUMMARY ==='])
    writer.writerow(['Ticker', 'Open Cost Basis (THB)', 'Realized Gain/Loss (THB)'])
    for section in sections:
        writer.writerow([
            section['symbol'].ticker, f"{section['remaining_cost_thb']:.2f}", f"{section['realized_gain_thb']:.2f}",
        ])
    writer.writerow(['TOTAL', f'{grand_open_cost:.2f}', f'{grand_realized_gain:.2f}'])

    return response


# --------------------------------------------------------------------------
# PDF — one ticker per page, formal A4 layout with a running header/footer
# (generation timestamp + page number), right-aligned numeric columns, and
# sale allocations shown as indented sub-rows directly under their sale so
# the "which lot fed this sale" story reads at a glance.
# --------------------------------------------------------------------------

def _header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.drawString(18 * mm, 10 * mm, f"Generated {timezone.now():%Y-%m-%d %H:%M}")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _lot_table(lots):
    rows = [['Buy Date', 'Price (USD)', 'Qty', 'FX Rate', 'Cost (THB)', 'Qty Remaining', 'Status']]
    for lot in lots:
        rows.append([
            lot.buy_date.isoformat(), f'{lot.price_usd:.2f}', _fmt_qty(lot.qty),
            f'{lot.fx_rate_usd_thb:.4f}', _money_thb(lot.cost_thb), _fmt_qty(lot.qty_remaining), _lot_status(lot),
        ])
    last_row = len(rows) - 1
    table = Table(rows, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 1, HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_BG),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 1), (-2, -1), 'RIGHT'),
        ('LINEBELOW', (0, 1), (-1, last_row), 0.5, colors.HexColor('#dddddd')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7f7f7')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return table


def _sale_table(sales):
    rows = [['Sell Date', 'Qty Sold', 'Price (USD)', 'Fee (USD)', 'FX Rate',
             'Proceeds (THB)', 'Cost Basis (THB)', 'Gain/Loss (THB)']]
    gain_row_indexes = []

    for sale in sales:
        gain_row_indexes.append(len(rows))
        rows.append([
            sale.sell_date.isoformat(), _fmt_qty(sale.qty_sold), f'{sale.sale_price_usd:.2f}',
            f'{sale.fee_usd:.2f}', f'{sale.fx_rate_usd_thb:.4f}',
            _money_thb(sale.proceeds_thb), _money_thb(sale.total_cost_basis_thb), _money_thb(sale.capital_gain_thb),
        ])
        for alloc in sale.allocations_sorted:
            rows.append([
                f'  from lot {alloc.lot.buy_date.isoformat()}', _fmt_qty(alloc.qty_allocated),
                '', '', '', '', _money_thb(alloc.cost_basis_thb), '',
            ])

    last_row = len(rows) - 1
    table = Table(rows, repeatRows=1, hAlign='LEFT')
    style = [
        ('LINEBELOW', (0, 0), (-1, 0), 1, HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_BG),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 1), (-1, last_row), 0.5, colors.HexColor('#dddddd')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]
    for sale, row_index in zip(sales, gain_row_indexes):
        color = GAIN_COLOR if sale.capital_gain_thb >= 0 else LOSS_COLOR
        style.append(('TEXTCOLOR', (-1, row_index), (-1, row_index), color))
    table.setStyle(TableStyle(style))
    return table


def _cover_page(owner_name, sections, grand_open_cost, grand_realized_gain, symbol_filter_note):
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CoverTitle', parent=styles['Title'], alignment=TA_CENTER, fontSize=22)
    subtitle_style = ParagraphStyle(
        'CoverSubtitle', parent=styles['Normal'], alignment=TA_CENTER,
        fontSize=11, textColor=colors.HexColor('#555555'), spaceBefore=4, spaceAfter=2,
    )

    elements = [
        Spacer(1, 40 * mm),
        Paragraph('FIFO Portfolio Report', title_style),
        Spacer(1, 8),
    ]
    if owner_name:
        elements.append(Paragraph(owner_name, subtitle_style))
    elements.append(Paragraph(f'Generated {timezone.now():%Y-%m-%d %H:%M}', subtitle_style))
    if symbol_filter_note:
        elements.append(Paragraph(f'Filtered to: {symbol_filter_note}', subtitle_style))

    elements.append(Spacer(1, 16 * mm))

    totals_rows = [
        ['Open Cost Basis (THB)', 'Realized Gain/Loss (THB)'],
        [_money_thb(grand_open_cost), _money_thb(grand_realized_gain)],
    ]
    totals_table = Table(totals_rows, hAlign='CENTER', colWidths=[70 * mm, 70 * mm])
    totals_table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 1, HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_BG),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('FONTSIZE', (0, 1), (-1, 1), 13),
        ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TEXTCOLOR', (1, 1), (1, 1), GAIN_COLOR if grand_realized_gain >= 0 else LOSS_COLOR),
    ]))
    elements.append(totals_table)

    if sections:
        elements.append(Spacer(1, 12 * mm))
        elements.append(Paragraph(
            'Tickers covered: ' + ', '.join(section['symbol'].ticker for section in sections),
            ParagraphStyle('CoverTickers', parent=styles['Normal'], alignment=TA_CENTER, fontSize=9,
                           textColor=colors.HexColor('#555555')),
        ))

    return elements


def fifo_report_pdf_response(filename, sections, owner_name=None, symbol_filter_note=None):
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('TitleC', parent=styles['Title'], alignment=TA_CENTER)
    heading_style = styles['Heading2']
    summary_style = ParagraphStyle('Summary', parent=styles['Normal'], fontSize=10, spaceBefore=6, spaceAfter=6)

    grand_open_cost = sum((section['remaining_cost_thb'] for section in sections), Decimal('0'))
    grand_realized_gain = sum((section['realized_gain_thb'] for section in sections), Decimal('0'))

    elements = _cover_page(owner_name, sections, grand_open_cost, grand_realized_gain, symbol_filter_note)
    if sections:
        elements.append(PageBreak())

    for index, section in enumerate(sections):
        symbol = section['symbol']
        elements.append(Paragraph(f'FIFO Report &mdash; {symbol.ticker}', title_style))
        elements.append(Spacer(1, 6))

        elements.append(Paragraph('Buy Lots', heading_style))
        elements.append(_lot_table(section['lots']))
        elements.append(Spacer(1, 10))

        elements.append(Paragraph('Sales &amp; FIFO Allocations', heading_style))
        elements.append(_sale_table(section['sales']))
        elements.append(Spacer(1, 8))

        elements.append(Paragraph(
            f"<b>Ticker Total Realized Gain/Loss: {_money_thb(section['realized_gain_thb'])}</b>"
            f"&nbsp;&nbsp;&nbsp; Open Cost Basis Remaining: {_money_thb(section['remaining_cost_thb'])}",
            summary_style,
        ))

        if index < len(sections) - 1:
            elements.append(PageBreak())

    if sections:
        elements.append(PageBreak())
    elements.append(Paragraph('Portfolio Summary', title_style))
    elements.append(Spacer(1, 10))

    summary_rows = [['Ticker', 'Open Cost Basis (THB)', 'Realized Gain/Loss (THB)']]
    for section in sections:
        summary_rows.append([section['symbol'].ticker, _money_thb(section['remaining_cost_thb']), _money_thb(section['realized_gain_thb'])])
    summary_rows.append(['TOTAL', _money_thb(grand_open_cost), _money_thb(grand_realized_gain)])

    summary_table = Table(summary_rows, hAlign='LEFT')
    last_row = len(summary_rows) - 1
    summary_style_cmds = [
        ('LINEBELOW', (0, 0), (-1, 0), 1, HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_BG),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
        ('LINEBELOW', (0, 1), (-1, last_row - 1), 0.5, colors.HexColor('#dddddd')),
        ('FONTNAME', (0, last_row), (-1, last_row), 'Helvetica-Bold'),
        ('LINEABOVE', (0, last_row), (-1, last_row), 1, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for row_index, section in enumerate(sections, start=1):
        color = GAIN_COLOR if section['realized_gain_thb'] >= 0 else LOSS_COLOR
        summary_style_cmds.append(('TEXTCOLOR', (-1, row_index), (-1, row_index), color))
    summary_table.setStyle(TableStyle(summary_style_cmds))
    elements.append(summary_table)

    doc.build(elements, onFirstPage=_header_footer, onLaterPages=_header_footer)
    buffer.seek(0)

    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
