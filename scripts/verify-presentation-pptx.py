import json
import re
import zipfile

EMU = 914400
expected = json.load(open('work/presentation-pptx-expected.json', encoding='utf8'))
z = zipfile.ZipFile('outputs/qa/presentatie-demo.pptx')
names = z.namelist()

size = re.search(r'<p:sldSz cx="(\d+)" cy="(\d+)"',
                 z.read('ppt/presentation.xml').decode())
width, height = int(size.group(1)) / EMU, int(size.group(2)) / EMU
assert abs(width - 10) < 0.001 and abs(height - 5.625) < 0.001, \
    f'Diaformaat {width}x{height} inch, 10x5.625 verwacht'

slides = sorted(n for n in names if re.match(r'ppt/slides/slide\d+\.xml$', n))
assert len(slides) == expected['slides'], \
    f"{len(slides)} dia's, {expected['slides']} verwacht"

images = [n for n in names if re.match(r'ppt/media/.+\.(png|jpe?g)$', n)]
assert len(images) == expected['sheets'], \
    f"{len(images)} afbeeldingen, {expected['sheets']} planblad(en) verwacht"

tables, pictures, fonts = 0, 0, set()
for name in slides:
    xml = z.read(name).decode()
    body = [t for t in re.findall(r'<a:t>([^<]*)</a:t>', xml) if t.strip()]
    assert body, f'Dia zonder tekst: {name}'
    tables += xml.count('<a:tbl>')
    pictures += xml.count('<p:pic>')
    fonts.update(re.findall(r'typeface="([^"]+)"', xml))
assert tables >= 3, f'{tables} echte tabellen; teksten en tabellen horen bewerkbaar te zijn'
assert pictures == expected['sheets'], f'{pictures} afbeeldingen op dia, {expected["sheets"]} verwacht'
# Alleen lettertypen die overal aanwezig zijn; anders verschuift de opmaak
# stilzwijgend op de computer van de klant.
allowed = {'Georgia', 'Arial', '+mn-lt', '+mj-lt'}
assert fonts <= allowed, f'Onverwachte lettertypen: {sorted(fonts - allowed)}'

print(f"Gecontroleerd: {len(slides)} dia's van {width}x{height} inch, {tables} bewerkbare tabellen, "
      f"{pictures} planblad-afbeelding(en), lettertypen {sorted(fonts)}, "
      f"{len(expected['warnings'])} gemelde waarschuwing(en).")
