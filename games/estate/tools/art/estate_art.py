"""영지 전경 그림을 레이어로 만든다 (임시 그림, 나중에 에셋으로 교체).
  public/estate/bg.png          배경 (하늘·산·왕도·땅·길·연기)
  public/estate/b_<id>.png      건물 하나씩 (화면 전체 크기, 투명 배경 → 같은 위치에 겹쳐 그리면 됨)
  public/estate/buildings.json  건물별 영역 (라벨 위치·클릭 영역 대략)
실행: python3 games/estate/tools/art/estate_art.py  (Pillow, numpy 필요)
"""
import json, os, random
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', '..', 'public', 'estate')
parts = json.load(open(os.path.join(HERE, 'estate_parts.json'), encoding='utf-8'))
LIGHT = """
ys,xs=np.mgrid[0:H,0:W]
arr=np.array(im).astype(float)
light=np.zeros((H,W))
for (cx,cy,r) in glows:
    dd=np.sqrt((xs-cx)**2+(ys-cy)**2); f=np.clip(1-dd/r,0,1)**1.5; light=np.maximum(light,np.floor(f*5)/5*0.28)
arr=arr+np.dstack([light*255,light*150,light*50])*0.55
"""
BUILDINGS = ['chapel', 'tower', 'manor', 'tavern', 'guild', 'market', 'square', 'dungeon']

def render(enabled):
    g = {'np': np, 'random': random, 'Image': Image}
    code = parts['base'] + '\n' + '\n'.join(parts[b] for b in BUILDINGS if b in enabled) + '\n' + parts['smoke'] + '\n' + LIGHT
    exec(compile(code, 'estate', 'exec'), g)
    return np.clip(g['arr'], 0, 255).astype(np.uint8)

os.makedirs(OUT, exist_ok=True)
bg = render(set())
Image.fromarray(bg).save(os.path.join(OUT, 'bg.png'))
meta = {}
for b in BUILDINGS:
    img = render({b})
    mask = (img != bg).any(axis=2)
    rgba = np.zeros((*img.shape[:2], 4), np.uint8)
    rgba[mask, :3] = img[mask]
    rgba[mask, 3] = 255
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'b_{b}.png'))
    ys, xs = np.nonzero(mask)
    meta[b] = {'x0': int(xs.min()), 'y0': int(ys.min()), 'x1': int(xs.max()), 'y1': int(ys.max())}
json.dump(meta, open(os.path.join(OUT, 'buildings.json'), 'w'), indent=1)
print(meta)
