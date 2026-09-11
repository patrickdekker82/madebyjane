import json
import pdfplumber

MM = 25.4 / 72
expected = json.load(open('work/presentation-expected.json', encoding='utf8'))
with pdfplumber.open('outputs/qa/presentatie-demo.pdf') as pdf:
    portrait = [p for p in pdf.pages if p.height > p.width]
    landscape = [p for p in pdf.pages if p.width > p.height]
    assert portrait, 'Geen staande tekstpagina gevonden'
    assert len(landscape) == expected['planBlocks'], (
        f"{len(landscape)} liggende bladen, {expected['planBlocks']} verwacht")
    for page in pdf.pages:
        body = [c for c in page.chars if 25 < float(c['top']) < float(page.height) - 25]
        assert body, f'Lege pagina {page.page_number}'
        assert all(float(c['x0']) >= -0.1 and float(c['x1']) <= float(page.width) + 0.1
                   for c in page.chars), f'Tekst valt buiten pagina {page.page_number}'
    # Maatvastheid: de schaalreferentie moet op papier exact 100 mm zijn.
    bars = [round((float(l['x1']) - float(l['x0'])) * MM, 4)
            for p in landscape for l in p.lines
            if abs(float(l['y1']) - float(l['y0'])) < 0.1]
    assert any(abs(b - expected['referenceMm']) < 0.02 for b in bars), \
        f"Geen exacte schaalreferentie van {expected['referenceMm']} mm: {bars}"
    print(f"Gecontroleerd: {len(pdf.pages)} pagina's, {len(landscape)} planblad(en), "
          f"schaalreferentie exact {expected['referenceMm']} mm.")
