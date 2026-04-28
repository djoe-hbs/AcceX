import io
import calendar
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics import renderPDF

from core.work.models import WorkClientInvoice


# ── Brand Palette ────────────────────────────────────────────────
PRIMARY = colors.HexColor("#4f46e5")       # Indigo
PRIMARY_DARK = colors.HexColor("#3730a3")
PRIMARY_LIGHT = colors.HexColor("#eef2ff")
DARK = colors.HexColor("#0f172a")          # Slate 900
DARK_SEC = colors.HexColor("#334155")      # Slate 700
MUTED = colors.HexColor("#64748b")         # Slate 500
LIGHT_MUTED = colors.HexColor("#94a3b8")   # Slate 400
SURFACE = colors.HexColor("#f8fafc")       # Slate 50
ROW_ALT = colors.HexColor("#f1f5f9")       # Slate 100
BORDER = colors.HexColor("#e2e8f0")        # Slate 200
WHITE = colors.white
SUCCESS = colors.HexColor("#059669")       # Emerald 600
ACCENT_BG = colors.HexColor("#faf5ff")     # Violet 50

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def _draw_header_band(canvas, doc):
    """Draw a coloured top band and accent stripe on every page."""
    # Top band
    canvas.saveState()
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, PAGE_H - 28 * mm, PAGE_W, 28 * mm, fill=1, stroke=0)
    # Thin accent line below
    canvas.setFillColor(PRIMARY_DARK)
    canvas.rect(0, PAGE_H - 29 * mm, PAGE_W, 1 * mm, fill=1, stroke=0)
    # Company name in band
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 20)
    canvas.drawString(MARGIN, PAGE_H - 18 * mm, "AcceX")
    canvas.setFont("Helvetica", 9)
    canvas.drawString(MARGIN, PAGE_H - 23 * mm, "Intelligent Document Processing")
    # Right side — INVOICE label
    canvas.setFont("Helvetica-Bold", 28)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 19 * mm, "INVOICE")
    canvas.restoreState()

    # Bottom footer line
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    canvas.setFillColor(LIGHT_MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(
        PAGE_W / 2, 10 * mm,
        "This invoice was generated automatically by AcceX  |  hudsmers@gmail.com"
    )
    page_num = canvas.getPageNumber()
    canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {page_num}")
    canvas.restoreState()


def generate_invoice_pdf(invoice: WorkClientInvoice) -> bytes:
    """Return a professional PDF invoice as bytes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=34 * mm,   # below the header band
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()

    # ── Custom Styles ────────────────────────────────────────────
    styles.add(ParagraphStyle(
        "MetaLabel", parent=styles["Normal"],
        fontSize=7, textColor=MUTED, leading=9,
        fontName="Helvetica", spaceAfter=1,
    ))
    styles.add(ParagraphStyle(
        "MetaValue", parent=styles["Normal"],
        fontSize=9, textColor=DARK, leading=12,
        fontName="Helvetica-Bold", spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "MetaValueRight", parent=styles["Normal"],
        fontSize=9, textColor=DARK, leading=12,
        fontName="Helvetica-Bold", spaceAfter=4, alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "SectionTitle", parent=styles["Normal"],
        fontSize=8, textColor=PRIMARY, leading=10,
        fontName="Helvetica-Bold", spaceBefore=0, spaceAfter=4,
        textTransform="uppercase",
    ))
    styles.add(ParagraphStyle(
        "CardText", parent=styles["Normal"],
        fontSize=8.5, textColor=DARK_SEC, leading=12,
    ))
    styles.add(ParagraphStyle(
        "CardTextBold", parent=styles["Normal"],
        fontSize=9, textColor=DARK, leading=12,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        "ThCell", parent=styles["Normal"],
        fontSize=7.5, textColor=WHITE, leading=10,
        fontName="Helvetica-Bold",
    ))
    styles.add(ParagraphStyle(
        "ThCellRight", parent=styles["Normal"],
        fontSize=7.5, textColor=WHITE, leading=10,
        fontName="Helvetica-Bold", alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "TdCell", parent=styles["Normal"],
        fontSize=8, textColor=DARK_SEC, leading=11,
    ))
    styles.add(ParagraphStyle(
        "TdCellRight", parent=styles["Normal"],
        fontSize=8, textColor=DARK_SEC, leading=11,
        alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "TdCellBoldRight", parent=styles["Normal"],
        fontSize=8, textColor=DARK, leading=11,
        fontName="Helvetica-Bold", alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "SummaryLabel", parent=styles["Normal"],
        fontSize=9, textColor=DARK_SEC, leading=13,
        alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "SummaryValue", parent=styles["Normal"],
        fontSize=9, textColor=DARK, leading=13,
        fontName="Helvetica-Bold", alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "GrandTotalLabel", parent=styles["Normal"],
        fontSize=11, textColor=WHITE, leading=15,
        fontName="Helvetica-Bold", alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "GrandTotalValue", parent=styles["Normal"],
        fontSize=14, textColor=WHITE, leading=18,
        fontName="Helvetica-Bold", alignment=TA_RIGHT,
    ))
    styles.add(ParagraphStyle(
        "NoteText", parent=styles["Normal"],
        fontSize=8, textColor=MUTED, leading=11,
    ))
    styles.add(ParagraphStyle(
        "ThankYou", parent=styles["Normal"],
        fontSize=11, textColor=PRIMARY, leading=14,
        fontName="Helvetica-Bold", alignment=TA_CENTER,
        spaceBefore=12,
    ))

    elements = []

    # ── Invoice Meta Row ─────────────────────────────────────────
    inv_number = f"INV-{invoice.client.name[:3].upper()}-{invoice.year}{invoice.month:02d}"
    month_name = calendar.month_name[invoice.month]
    inv_date = invoice.created.strftime("%d %B %Y")
    period_str = f"{month_name} {invoice.year}"

    meta_data = [
        [
            Paragraph("INVOICE NUMBER", styles["MetaLabel"]),
            Paragraph("DATE", styles["MetaLabel"]),
            Paragraph("PERIOD", styles["MetaLabel"]),
            Paragraph("STATUS", styles["MetaLabel"]),
        ],
        [
            Paragraph(inv_number, styles["MetaValue"]),
            Paragraph(inv_date, styles["MetaValue"]),
            Paragraph(period_str, styles["MetaValue"]),
            Paragraph(invoice.status or "GENERATED", styles["MetaValue"]),
        ],
    ]
    meta_table = Table(meta_data, colWidths=["28%", "28%", "24%", "20%"])
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 8 * mm))

    # ── Bill To / From Cards ─────────────────────────────────────
    client = invoice.client
    client_lines = [f"<b>{client.name}</b>"]
    if client.contact_name:
        client_lines.append(client.contact_name)
    if client.contact_email:
        client_lines.append(client.contact_email)
    if client.contact_phone:
        client_lines.append(client.contact_phone)
    if client.address:
        client_lines.append(client.address)

    bill_to_content = [
        [Paragraph("BILL TO", styles["SectionTitle"])],
        [Paragraph("<br/>".join(client_lines), styles["CardText"])],
    ]
    bill_from_content = [
        [Paragraph("FROM", styles["SectionTitle"])],
        [Paragraph(
            "<b>AcceX</b><br/>"
            "hudsmers@gmail.com",
            styles["CardText"],
        )],
    ]

    bill_to_table = Table(bill_to_content, colWidths=["100%"])
    bill_to_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
        # Left accent border
        ("LINEBEFOREDECOR", (0, 0), (0, -1), 3, PRIMARY),
    ]))

    bill_from_table = Table(bill_from_content, colWidths=["100%"])
    bill_from_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
        ("LINEBEFOREDECOR", (0, 0), (0, -1), 3, PRIMARY),
    ]))

    cards_data = [[bill_to_table, Spacer(4 * mm, 0), bill_from_table]]
    cards_outer = Table(cards_data, colWidths=["48%", "4%", "48%"])
    cards_outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(cards_outer)
    elements.append(Spacer(1, 10 * mm))

    # ── Line Items Table ─────────────────────────────────────────
    elements.append(Paragraph("LINE ITEMS", styles["SectionTitle"]))
    elements.append(Spacer(1, 2 * mm))

    items_qs = (
        invoice.items
        .select_related("batch", "work_file")
        .order_by("batch__name", "work_file__relative_path")
    )

    col_widths = [0.07 * CONTENT_W, 0.43 * CONTENT_W, 0.14 * CONTENT_W,
                  0.16 * CONTENT_W, 0.20 * CONTENT_W]

    table_data = [[
        Paragraph("#", styles["ThCell"]),
        Paragraph("DESCRIPTION", styles["ThCell"]),
        Paragraph("QTY", styles["ThCellRight"]),
        Paragraph("UNIT COST", styles["ThCellRight"]),
        Paragraph("AMOUNT", styles["ThCellRight"]),
    ]]

    row_count = 0
    for idx, item in enumerate(items_qs, start=1):
        table_data.append([
            Paragraph(str(idx), styles["TdCell"]),
            Paragraph(item.description, styles["TdCell"]),
            Paragraph(f"{item.quantity:,.2f}", styles["TdCellRight"]),
            Paragraph(f"{item.unit_cost:,.2f}", styles["TdCellRight"]),
            Paragraph(f"{item.amount:,.2f}", styles["TdCellBoldRight"]),
        ])
        row_count += 1

    if row_count == 0:
        table_data.append([
            Paragraph("", styles["TdCell"]),
            Paragraph("No billable items for this period.", styles["TdCell"]),
            Paragraph("-", styles["TdCellRight"]),
            Paragraph("-", styles["TdCellRight"]),
            Paragraph("0.00", styles["TdCellBoldRight"]),
        ])

    items_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    t_style = [
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        # Outer box
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW", (0, 0), (-1, 0), 1, PRIMARY_DARK),
        # Inner horizontal lines
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, BORDER),
        # Padding
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]
    # Zebra stripes
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            t_style.append(("BACKGROUND", (0, i), (-1, i), ROW_ALT))
        else:
            t_style.append(("BACKGROUND", (0, i), (-1, i), WHITE))
    items_table.setStyle(TableStyle(t_style))
    elements.append(items_table)
    elements.append(Spacer(1, 6 * mm))

    # ── Summary / Totals ─────────────────────────────────────────
    total = invoice.total_amount or Decimal("0")
    item_count = row_count or 0

    summary_data = [
        [
            "",
            Paragraph("Subtotal", styles["SummaryLabel"]),
            Paragraph(f"${total:,.2f}", styles["SummaryValue"]),
        ],
        [
            "",
            Paragraph(f"Items ({item_count})", styles["SummaryLabel"]),
            Paragraph(str(item_count), styles["SummaryValue"]),
        ],
    ]
    summary_table = Table(summary_data, colWidths=["50%", "28%", "22%"])
    summary_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 8),
        ("LINEBELOW", (1, 0), (-1, 0), 0.3, BORDER),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 2 * mm))

    # Grand total row with accent background
    grand_data = [[
        "",
        Paragraph("TOTAL DUE", styles["GrandTotalLabel"]),
        Paragraph(f"${total:,.2f}", styles["GrandTotalValue"]),
    ]]
    grand_table = Table(grand_data, colWidths=["50%", "28%", "22%"])
    grand_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (1, 0), (-1, -1), PRIMARY),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 10),
        ("LEFTPADDING", (1, 0), (1, -1), 10),
        ("ROUNDEDCORNERS", [0, 4, 4, 0]),
    ]))
    elements.append(grand_table)
    elements.append(Spacer(1, 12 * mm))

    # ── Notes & Thank You ────────────────────────────────────────
    notes_data = [[
        Paragraph(
            "<b>Notes:</b><br/>"
            "Payment is due within 30 days of the invoice date. "
            "Please reference the invoice number in your payment.",
            styles["NoteText"],
        ),
    ]]
    notes_table = Table(notes_data, colWidths=["100%"])
    notes_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT_BG),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBEFOREDECOR", (0, 0), (0, -1), 3, PRIMARY),
    ]))
    elements.append(notes_table)

    elements.append(Paragraph("Thank you for your business!", styles["ThankYou"]))

    doc.build(elements, onFirstPage=_draw_header_band, onLaterPages=_draw_header_band)
    return buf.getvalue()
