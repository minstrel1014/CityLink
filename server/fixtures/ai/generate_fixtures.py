#!/usr/bin/env python3
"""Regenerate the two extraction fixtures.

Both files are committed so the unit test and the prototype run against real
bytes rather than against a mock. They are deliberately small (a few KB) and
contain no personal data.

    python3 -m venv /tmp/fixenv
    /tmp/fixenv/bin/pip install reportlab python-docx
    /tmp/fixenv/bin/python server/fixtures/ai/generate_fixtures.py

Requires reportlab 4.x/5.x and python-docx 1.x. Output is deterministic apart
from the PDF's /CreationDate, so a regenerated file may differ in metadata while
the extracted text stays identical.
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent

PDF_LINES = [
    ("title", "CS2103 Group Project Brief"),
    ("subtitle", "Semester A 2026/27 - Group 7"),
    ("body", "This brief is the fixture used by the CityLink extraction spike."),
    ("body", "It contains enough prose to prove that a text layer is recovered,"),
    ("body", "including wrapped lines that must be joined with a space."),
    ("heading", "Deliverables"),
    ("body", "1. A working prototype, demonstrated in week 10."),
    ("body", "2. A written report of at most twelve pages."),
    ("body", "3. A short reflection on what the team would change."),
    ("heading", "Constraints"),
    ("body", "No third-party service may hold student data without consent."),
    ("body", "Files must stay downloadable after an analysis is refused."),
    ("page2_title", "Page two - marking scheme"),
    ("body", "Prototype 40 percent. Report 40 percent. Reflection 20 percent."),
    ("body", "Late submission loses ten percent per calendar day."),
]

DOCX_PARAGRAPHS = [
    ("heading", "CS2103 Meeting Notes"),
    ("body", "Attendees: Ada, Bo, Chen, Dee."),
    ("body", "Decided to keep the storage layer provider-neutral until the"),
    ("body", "supervisor signs off on the disclosure text."),
    ("heading", "Actions"),
    ("body", "Ada to draft the consent screen."),
    ("body", "Bo to measure extraction time on a 20 MB PDF."),
    ("body", "Chen to confirm the retention wording with the department."),
]

DOCX_TABLE = [
    ("Owner", "Task", "Due"),
    ("Ada", "Consent screen", "Week 8"),
    ("Bo", "Extraction timing", "Week 9"),
    ("Chen", "Retention wording", "Week 9"),
]


def build_pdf() -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(
        str(HERE / "notes.pdf"),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title="CS2103 Group Project Brief",
        author="CityLink fixture",
    )
    flow = []
    for kind, line in PDF_LINES:
        if kind == "page2_title":
            flow.append(PageBreak())
            flow.append(Paragraph(line, styles["Heading1"]))
            flow.append(Spacer(1, 4 * mm))
        elif kind == "title":
            flow.append(Paragraph(line, styles["Title"]))
        elif kind == "subtitle":
            flow.append(Paragraph(line, styles["Heading2"]))
            flow.append(Spacer(1, 4 * mm))
        elif kind == "heading":
            flow.append(Spacer(1, 3 * mm))
            flow.append(Paragraph(line, styles["Heading2"]))
        else:
            flow.append(Paragraph(line, styles["BodyText"]))
    doc.build(flow)


def build_docx() -> None:
    from docx import Document

    document = Document()
    document.add_heading(DOCX_PARAGRAPHS[0][1], level=1)
    for kind, line in DOCX_PARAGRAPHS[1:]:
        if kind == "heading":
            document.add_heading(line, level=2)
        else:
            document.add_paragraph(line)
    table = document.add_table(rows=0, cols=3)
    table.style = "Table Grid"
    for row in DOCX_TABLE:
        cells = table.add_row().cells
        for cell, value in zip(cells, row):
            cell.text = value
    document.save(str(HERE / "notes.docx"))


if __name__ == "__main__":
    build_pdf()
    build_docx()
    for name in ("notes.pdf", "notes.docx"):
        path = HERE / name
        print(f"{name}: {path.stat().st_size} bytes")
