"""Verify Chromium's PDF page box and actual vector line lengths, not SVG source only."""
import json
from pathlib import Path
import pdfplumber
with pdfplumber.open('outputs/schaalproef-1-50.pdf') as pdf:
    page = pdf.pages[0]
    lengths = [((line['x1']-line['x0'])**2+(line['y1']-line['y0'])**2)**.5*25.4/72 for line in page.lines]
    references = [length for length in lengths if abs(length-100) < .01]
    result = {'pages':len(pdf.pages),'page_width_mm':page.width*25.4/72,'page_height_mm':page.height*25.4/72,'reference_5000mm_printed_mm':references,'physical_line_tolerance_mm':.01,'paper_box_tolerance_mm':.2}
    # Chromium quantizes paper dimensions to printer units. This tolerance does not apply to plan geometry.
    assert len(pdf.pages)==1
    assert abs(result['page_width_mm']-297)<.2 and abs(result['page_height_mm']-210)<.2
    assert references, 'The 5 m vector reference is not 100 mm within 0.01 mm.'
    Path('work/pdf-verification.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
