# Builds storage/fonts/SarabunPdf-{Regular,Bold}.ttf from Sarabun for dompdf, which cannot shape Thai.
# Maps Sarabun's own mark variants to the Windows Thai PUA set that App\Support\Pdf\ThaiPua emits.
# Run from the project root: pip install fonttools && python resources/fonts/build-sarabun-pdf.py
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent

FONT_DIR = Path('storage/fonts')
TONES = ['0E48', '0E49', '0E4A', '0E4B', '0E4C']  # ่ ้ ๊ ๋ ์


def tone(code, variant=''):
    return f'uni{code}{variant}'


def pua_map(raised_left):
    mapping = {}
    for i, code in enumerate(TONES):
        mapping[int(code, 16)] = tone(code, '.small')  # plain tone sits high, like Windows Thai fonts
        mapping[0xF70A + i] = tone(code)  # shift down
        mapping[0xF705 + i] = tone(code, '.narrow')  # shift down-left
        mapping[0xF713 + i] = raised_left[code]  # shift left
    mapping.update({
        0xF710: 'uni0E31.narrow', 0xF701: 'uni0E34.narrow', 0xF702: 'uni0E35.narrow',
        0xF703: 'uni0E36.narrow', 0xF704: 'uni0E37.narrow', 0xF711: 'uni0E4D.narrow',
        0xF712: 'uni0E47.narrow',
        0xF718: 'uni0E38.small', 0xF719: 'uni0E39.small', 0xF71A: 'uni0E3A.small',
        0xF70F: 'yoYingthai.less', 0xF700: 'thoThanthai.less',
    })
    return mapping


def add_raised_left_tones(font):
    glyf, hmtx = font['glyf'], font['hmtx']
    # Same left shift the narrow upper vowel gets, so the raised tone stays over it
    shift = glyf['uni0E35.narrow'].xMax - glyf['uni0E35'].xMax
    names = {}
    for code in TONES:
        base = tone(code, '.small')
        name = tone(code, '.small.narrow')
        component = GlyphComponent()
        component.glyphName, component.x, component.y, component.flags = base, shift, 0, 0x4
        glyph = Glyph()
        glyph.numberOfContours, glyph.components = -1, [component]
        glyf[name] = glyph
        hmtx[name] = (0, glyf[base].xMin + shift)
        names[code] = name
    return names


def rename(font, weight):
    for record in font['name'].names:
        if record.nameID in (1, 4):
            record.string = record.toUnicode().replace('Sarabun', 'Sarabun PDF')
        elif record.nameID in (3, 6):
            record.string = record.toUnicode().replace('Sarabun-', 'SarabunPDF-')
    font['name'].setName(f'Sarabun with Thai marks on Windows PUA code points for dompdf ({weight})', 10, 3, 1, 0x409)


def build(weight):
    font = TTFont(FONT_DIR / f'Sarabun-{weight}.ttf')
    mapping = pua_map(add_raised_left_tones(font))
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap.update(mapping)
    rename(font, weight)
    target = FONT_DIR / f'SarabunPdf-{weight}.ttf'
    font.save(target)
    print(f'{target}: {len(mapping)} code points remapped')


if __name__ == '__main__':
    for weight in ('Regular', 'Bold'):
        build(weight)
