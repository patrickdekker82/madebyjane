import json,re
import pdfplumber
expected=json.load(open('work/quote-pdf-expected.json',encoding='utf8'))
with pdfplumber.open('outputs/qa/offerte-demo.pdf') as pdf:
    text='\n'.join(p.extract_text() or '' for p in pdf.pages)
    for i in range(1,expected['rows']+1):
        assert text.count(f'POST-{i:03d}')==1, f'Missing or duplicated row {i}'
    assert 'Totaal: '+expected['total'].replace('.',',')+' EUR' in text
    for p in pdf.pages:
        body=[c for c in p.chars if 25<float(c['top'])<float(p.height)-25]
        assert body, f'Empty page {p.page_number}'
        assert all(float(c['x0'])>=-0.1 and float(c['x1'])<=float(p.width)+0.1 for c in p.chars), 'Horizontal clipping'
    plan=pdf.pages[-1]
    lengths=[abs(float(l['x1'])-float(l['x0']))*25.4/72 for l in plan.lines if abs(float(l['y1'])-float(l['y0']))<0.1]
    assert any(abs(n-expected['referenceMm'])<0.02 for n in lengths), f'No exact 100mm scale reference: {lengths}'
    print(f"Verified {len(pdf.pages)} pages, {expected['rows']} unique rows, exact total and 100 mm reference line.")
