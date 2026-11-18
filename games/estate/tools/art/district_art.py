"""구역 안 그림 (위에서 내려다본 임시 도트, 480×270). 나중에 에셋으로 교체.
  public/estate/d_<구역>.png   dungeon, tavern, manor, square, chapel
화면 오른쪽 150px(원본 기준 x≥322)은 서류 목록 창이 덮으므로 주요 장면은 왼쪽 320px 안에.
캐릭터·설치물(분수·동상·깃발…)은 게임에서 따로 그림 → 여기엔 바닥·벽·가구만.
실행: python3 games/estate/tools/art/district_art.py  (Pillow, numpy)
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', '..', '..', 'public', 'estate')
W, H = 480, 270


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


class Canvas:
    def __init__(self, seed):
        self.a = np.zeros((H, W, 3), float)
        self.rng = np.random.default_rng(seed)
        self.glows = []

    def rect(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = [int(round(v)) for v in (x0, y0, x1, y1)]
        self.a[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] = hexc(c)

    def px(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.a[int(y), int(x)] = hexc(c)

    def noise(self, x0, y0, x1, y1, c, amt=10, levels=3):
        """칠하고 픽셀마다 밝기를 몇 단계로만 흔듦 (도트 느낌 유지)"""
        self.rect(x0, y0, x1, y1, c)
        h, w = max(0, min(H, y1) - max(0, y0)), max(0, min(W, x1) - max(0, x0))
        if h == 0 or w == 0:
            return
        n = self.rng.integers(-(levels // 2), levels // 2 + 1, (h, w, 1)) * amt
        self.a[max(0, y0):max(0, y0) + h, max(0, x0):max(0, x0) + w] += n

    def mask_fill(self, mask, c, amt=8):
        n = self.rng.integers(-1, 2, mask.shape)[..., None] * amt
        self.a[mask] = (hexc(c) + n)[mask]

    def outline(self, x0, y0, x1, y1, c):
        self.rect(x0, y0, x1, y0 + 1, c)
        self.rect(x0, y1 - 1, x1, y1, c)
        self.rect(x0, y0, x0 + 1, y1, c)
        self.rect(x1 - 1, y0, x1, y1, c)

    def shade(self, x0, y0, x1, y1, f):
        x0, y0, x1, y1 = [int(round(v)) for v in (x0, y0, x1, y1)]
        self.a[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] *= f

    def circle(self, cx, cy, r, c, ry=None):
        ry = ry or r
        ys, xs = np.mgrid[0:H, 0:W]
        m = ((xs - cx) / r) ** 2 + ((ys - cy) / ry) ** 2 <= 1
        self.a[m] = hexc(c)
        return m

    def planks(self, x0, y0, x1, y1, c, ph=6, vertical=False):
        self.noise(x0, y0, x1, y1, c, 6)
        base = hexc(c)
        if not vertical:
            for y in range(y0, y1, ph):
                self.rect(x0, y, x1, y + 1, '#000000')
                self.a[y:y + 1, x0:x1] = base * 0.55
                off = self.rng.integers(0, 40)
                for x in range(x0 + off, x1, 40 + self.rng.integers(0, 20)):
                    self.a[y:min(y1, y + ph), x:x + 1] = base * 0.6
        else:
            for x in range(x0, x1, ph):
                self.a[y0:y1, x:x + 1] = base * 0.55

    def cobble(self, x0, y0, x1, y1, c, mortar, cell=7):
        self.rect(x0, y0, x1, y1, mortar)
        base = hexc(c)
        for y in range(y0, y1, cell):
            off = (cell // 2) if ((y - y0) // cell) % 2 else 0
            for x in range(x0 - off, x1, cell):
                w = cell - 1 - self.rng.integers(0, 2)
                h = cell - 1 - self.rng.integers(0, 2)
                tone = base * (0.85 + 0.25 * self.rng.random())
                xa, xb = max(x0, x + 1), min(x1, x + w)
                ya, yb = max(y0, y + 1), min(y1, y + h)
                if xb > xa and yb > ya:
                    self.a[ya:yb, xa:xb] = tone
                    self.a[ya:ya + 1, xa:xb] = tone * 1.12

    def glow(self, x, y, r):
        self.glows.append((x, y, r))

    def save(self, name, dark=0.0):
        ys, xs = np.mgrid[0:H, 0:W]
        a = self.a * (1 - dark)
        light = np.zeros((H, W))
        for (cx, cy, r) in self.glows:
            d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
            f = np.clip(1 - d / r, 0, 1) ** 1.4
            light = np.maximum(light, np.floor(f * 5) / 5 * 0.32)
        a = a + np.dstack([light * 255, light * 150, light * 50]) * 0.6
        Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f'd_{name}.png'))


def torch(cv, x, y):
    cv.rect(x - 1, y, x + 2, y + 12, '#4a3020')
    cv.rect(x - 2, y - 1, x + 3, y + 1, '#2a1a10')
    cv.rect(x - 1, y - 6, x + 2, y - 1, '#f0a030')
    cv.rect(x, y - 8, x + 1, y - 5, '#ffe080')
    cv.px(x - 1, y - 4, '#ff6a20')
    cv.glow(x, y - 4, 46)


def barrel(cv, x, y):
    cv.circle(x, y, 6, '#2a1a10')
    cv.circle(x, y, 5, '#7a4a24')
    cv.rect(x - 5, y - 1, x + 6, y, '#3a2414')
    cv.circle(x, y, 2, '#5a3418')


def crate(cv, x, y, s=10):
    cv.rect(x, y, x + s, y + s, '#2a1a10')
    cv.rect(x + 1, y + 1, x + s - 1, y + s - 1, '#9a6a3a')
    cv.rect(x + 1, y + s // 2, x + s - 1, y + s // 2 + 1, '#6a4422')
    cv.shade(x, y + s, x + s, y + s + 2, 0.6)


def stool(cv, x, y):
    cv.circle(x, y, 3, '#3a2414')
    cv.circle(x, y, 2, '#8a5a30')


def round_table(cv, x, y, r=12):
    cv.circle(x + 2, y + 3, r, '#2a1810')  # 그림자
    cv.circle(x, y, r, '#3a2414')
    cv.circle(x, y, r - 1, '#9a6434')
    cv.circle(x - 3, y - 3, r // 3, '#aa7444')
    # 잔·접시
    cv.rect(x - 4, y - 2, x - 2, y + 1, '#d8c890')
    cv.rect(x + 3, y + 1, x + 5, y + 4, '#c8a040')


# ───────────────────────── 던전 입구 ─────────────────────────
def dungeon():
    cv = Canvas(11)
    cv.noise(0, 0, W, H, '#3a3632', 9)
    # 풀 얼룩
    for _ in range(260):
        x, y = cv.rng.integers(0, W), cv.rng.integers(70, H)
        cv.px(x, y, '#3e4a30')
    # 절벽
    for x in range(W):
        top = 58 + int(6 * np.sin(x / 13) + 4 * np.sin(x / 5.3))
        cv.a[0:top, x] = hexc('#2e282e')
        cv.a[top - 3:top, x] = hexc('#4a4048')
        cv.a[top:top + 3, x] = hexc('#1e1a1e')
    for _ in range(120):
        x, y = cv.rng.integers(0, W), cv.rng.integers(0, 52)
        w, h = cv.rng.integers(4, 14), cv.rng.integers(3, 8)
        cv.shade(x, y, x + w, y + h, 1.25 if cv.rng.random() < .5 else 0.75)
    # 동굴 입구 (아치)
    ys, xs = np.mgrid[0:H, 0:W]
    arch = ((xs - 150) / 34) ** 2 + ((ys - 66) / 52) ** 2 <= 1
    rim = ((xs - 150) / 40) ** 2 + ((ys - 66) / 58) ** 2 <= 1
    cv.mask_fill(rim & (ys < 66), '#6a6068', 10)
    inner = arch & (ys < 66)
    depth = np.clip((ys - 14) / 52, 0, 1)
    cv.a[inner] = (np.dstack([depth * 24, depth * 18, depth * 26]))[inner]
    for i, y in enumerate((56, 60, 64)):  # 내려가는 계단
        cv.rect(150 - 22 + i * 3, y, 150 + 22 - i * 3, y + 1, '#3a3438')
    # 광장 (돌 포장)
    plaza = ((xs - 150) / 128) ** 2 + ((ys - 150) / 84) ** 2 <= 1
    tmp = Canvas(12)
    tmp.cobble(0, 0, W, H, '#6a625c', '#2e2a28', 9)
    cv.a[plaza & (ys > 66)] = tmp.a[plaza & (ys > 66)]
    # 아래로 난 길
    path = (np.abs(xs - 150 - 6 * np.sin(ys / 30)) < 18) & (ys > 210)
    cv.mask_fill(path, '#5a4a38', 8)
    # 횃불
    torch(cv, 104, 44)
    torch(cv, 196, 44)
    # 매표소 (관리인)
    cv.rect(242, 118, 296, 162, '#2a1a10')
    cv.rect(244, 120, 294, 160, '#8a5a30')
    cv.rect(240, 112, 298, 122, '#7a2a24')
    for x in range(242, 298, 6):
        cv.rect(x, 112, x + 3, 122, '#9a3a2a')
    cv.rect(250, 146, 288, 152, '#c8a060')  # 창구
    cv.rect(256, 126, 282, 136, '#e8d8a8')  # 간판
    cv.rect(260, 129, 278, 130, '#6a3a20')
    cv.rect(260, 132, 272, 133, '#6a3a20')
    cv.shade(244, 162, 298, 166, 0.55)
    cv.glow(268, 150, 30)
    # 상자·통
    crate(cv, 30, 120)
    crate(cv, 42, 128, 8)
    barrel(cv, 34, 150)
    barrel(cv, 300, 190)
    crate(cv, 286, 200)
    # 바위
    for (x, y, r) in [(20, 220, 8), (300, 90, 7), (60, 80, 5), (260, 236, 6), (340, 150, 9), (420, 210, 10)]:
        cv.circle(x + 2, y + 2, r, '#1a1618')
        cv.circle(x, y, r, '#5a5258')
        cv.circle(x - r // 3, y - r // 3, r // 2, '#6e666c')
    cv.save('dungeon', dark=0.12)


# ───────────────────────── 주점 ─────────────────────────
def tavern():
    cv = Canvas(21)
    cv.planks(0, 44, W, H, '#8a5a34', 7)
    cv.planks(0, 0, W, 44, '#4a2c1a', 8, vertical=True)
    cv.rect(0, 42, W, 46, '#2a1a10')
    # 선반 + 술병
    for sy in (12, 26):
        cv.rect(14, sy + 6, 214, sy + 8, '#2a1a10')
        cv.rect(14, sy + 5, 214, sy + 6, '#7a4a28')
        for x in range(18, 210, 6):
            col = ['#3a7a3a', '#7a2a2a', '#c8a040', '#3a4a8a', '#d8d0c0'][cv.rng.integers(0, 5)]
            h = cv.rng.integers(5, 8)
            cv.rect(x, sy + 5 - h, x + 3, sy + 5, col)
            cv.px(x + 1, sy + 4 - h, '#e8e0d0')
    # 벽난로
    cv.rect(232, 0, 292, 46, '#5a5258')
    for y in range(0, 46, 5):
        for x in range(232 + (y // 5 % 2) * 4, 292, 8):
            cv.rect(x, y, x + 7, y + 4, '#6e666c')
    cv.rect(244, 16, 280, 46, '#1a1010')
    cv.rect(248, 34, 276, 44, '#f08a20')
    cv.rect(254, 28, 270, 38, '#ffc040')
    cv.rect(258, 24, 264, 30, '#fff0a0')
    cv.glow(262, 40, 70)
    # 바 카운터
    cv.rect(12, 56, 216, 76, '#2a1a10')
    cv.rect(14, 57, 214, 64, '#b07440')
    cv.rect(14, 64, 214, 74, '#6a3a20')
    for x in range(20, 214, 14):
        cv.rect(x, 64, x + 1, 74, '#4a2414')
    for x in (40, 96, 150):
        cv.rect(x, 58, x + 4, 62, '#e8d8a8')  # 잔
    for x in range(26, 214, 22):
        stool(cv, x, 84)
    # 술통 더미
    for (x, y) in [(10, 110), (10, 124), (22, 117), (10, 138)]:
        barrel(cv, x + 6, y)
    # 탁자
    for (x, y) in [(76, 140), (178, 150), (272, 118), (110, 222), (236, 220)]:
        round_table(cv, x, y)
        for dx, dy in [(-16, 0), (16, 0), (0, -15), (0, 15)]:
            stool(cv, x + dx, y + dy)
    # 음유시인 자리 (작은 무대 깔개)
    cv.rect(296, 196, 320, 250, '#5a2a3a')
    cv.outline(296, 196, 320, 250, '#c8a040')
    # 등불
    for (x, y) in [(70, 100), (200, 110), (150, 200), (290, 170)]:
        cv.glow(x, y, 50)
    cv.save('tavern', dark=0.05)


# ───────────────────────── 저택 ─────────────────────────
def manor():
    cv = Canvas(31)
    # 대리석 바닥
    for y in range(48, H, 12):
        for x in range(0, W, 12):
            c = '#d4ccbc' if ((x // 12 + y // 12) % 2) else '#a8a090'
            cv.noise(x, y, x + 12, y + 12, c, 4)
    # 벽지 + 징두리
    cv.noise(0, 0, W, 40, '#6a1e28', 5)
    for x in range(0, W, 10):
        for y in range(4, 40, 10):
            cv.px(x + 5, y, '#8a3a40')
    cv.rect(0, 40, W, 48, '#4a2a1a')
    cv.rect(0, 40, W, 41, '#8a5a30')
    # 액자 (미술품 자리)
    for (x, c) in [(24, '#3a5a7a'), (74, '#7a6a3a'), (190, '#4a6a3a')]:
        cv.rect(x - 2, 6, x + 30, 32, '#c8a040')
        cv.rect(x, 8, x + 28, 30, c)
        cv.rect(x + 4, 18, x + 24, 26, '#2a2a2a')
    # 계단 (오른쪽 위)
    for i in range(9):
        y = i * 9
        cv.rect(246, y, 316, y + 9, '#8a6a4a' if i % 2 else '#9a7a5a')
        cv.rect(246, y + 8, 316, y + 9, '#4a3020')
    cv.rect(244, 0, 246, 82, '#4a2a1a')
    cv.rect(316, 0, 318, 82, '#4a2a1a')
    # 붉은 융단
    cv.rect(140, 48, 182, H, '#8a1a24')
    cv.rect(142, 48, 180, H, '#a82a30')
    cv.rect(142, 48, 144, H, '#d8a040')
    cv.rect(178, 48, 180, H, '#d8a040')
    # 긴 식탁 + 의자
    cv.shade(30, 132, 124, 166, 0.6)
    cv.rect(28, 118, 122, 154, '#3a1a10')
    cv.rect(30, 120, 120, 152, '#7a4a28')
    cv.rect(32, 132, 118, 140, '#e8e0d0')  # 식탁보
    for x in range(36, 118, 14):
        cv.rect(x, 110, x + 8, 117, '#5a2a1a')
        cv.rect(x, 156, x + 8, 163, '#5a2a1a')
    for x in (50, 76, 100):
        cv.rect(x, 128, x + 2, 134, '#d8b040')  # 촛대
        cv.px(x, 127, '#ffe080')
        cv.glow(x, 128, 26)
    # 갑옷·화분
    cv.rect(206, 52, 216, 76, '#8a8a98')
    cv.rect(208, 46, 214, 54, '#a8a8b8')
    cv.circle(220, 230, 8, '#5a3a2a')
    cv.circle(220, 224, 9, '#3a6a3a')
    cv.circle(18, 230, 8, '#5a3a2a')
    cv.circle(18, 224, 9, '#3a6a3a')
    # 샹들리에 빛
    for (x, y) in [(80, 90), (160, 140), (250, 200)]:
        cv.glow(x, y, 60)
    cv.save('manor', dark=0.08)


# ───────────────────────── 광장 ─────────────────────────
def square():
    cv = Canvas(41)
    cv.cobble(0, 0, W, H, '#8a8070', '#3e3a34', 8)
    ys, xs = np.mgrid[0:H, 0:W]
    ring = (((xs - 160) / 62) ** 2 + ((ys - 146) / 46) ** 2 <= 1) & (((xs - 160) / 56) ** 2 + ((ys - 146) / 40) ** 2 > 1)
    cv.mask_fill(ring, '#b8ac94', 6)
    # 우물 (동상 자리 = 우물 옆)
    cv.circle(160, 152, 12, '#3a3632')
    cv.circle(160, 150, 11, '#7a7268')
    cv.circle(160, 150, 7, '#1e2a3a')
    cv.rect(150, 136, 152, 150, '#4a3020')
    cv.rect(168, 136, 170, 150, '#4a3020')
    cv.rect(148, 134, 172, 138, '#7a2a24')
    # 노점 (줄무늬 차양)
    for (x, a, b) in [(24, '#c83a3a', '#efe0c8'), (110, '#3a6ac8', '#efe0c8'), (232, '#3a9a4a', '#efe0c8')]:
        cv.rect(x, 30, x + 60, 52, '#6a4a2a')
        cv.rect(x + 2, 32, x + 58, 50, '#9a7040')
        for i, gx in enumerate(range(x + 6, x + 56, 7)):
            cv.circle(gx, 40, 2, ['#d84a3a', '#e8c040', '#8ac04a', '#a86ad8'][i % 4])
        for i, sx in enumerate(range(x - 2, x + 62, 8)):
            cv.rect(sx, 12, sx + 8, 30, a if i % 2 == 0 else b)
        cv.rect(x - 2, 28, x + 62, 31, '#3a2a1a')
        cv.shade(x - 2, 52, x + 62, 56, 0.6)
    # 나무
    for (x, y) in [(20, 230), (300, 220), (290, 90)]:
        cv.circle(x + 3, y + 4, 16, '#2a2a20')
        cv.circle(x, y, 16, '#2e5a2a')
        cv.circle(x - 4, y - 4, 9, '#3e7a36')
        cv.circle(x + 5, y - 6, 5, '#4e8a40')
    # 벤치·가로등
    for (x, y) in [(60, 200), (230, 196)]:
        cv.rect(x, y, x + 26, y + 6, '#5a3a20')
        cv.rect(x, y, x + 26, y + 2, '#8a5a30')
    for (x, y) in [(100, 110), (220, 110), (100, 190), (222, 182)]:
        cv.rect(x, y, x + 2, y + 14, '#2a2a2a')
        cv.rect(x - 2, y - 4, x + 4, y, '#f0c060')
        cv.glow(x + 1, y - 2, 40)
    cv.save('square', dark=0.1)


# ───────────────────────── 성당 ─────────────────────────
def chapel():
    cv = Canvas(51)
    for y in range(36, H, 10):
        off = -9 if (y // 10) % 2 else 0
        for x in range(off, W, 14):
            cv.noise(max(0, x), y, x + 14, y + 10, '#6e6a70', 5)
            cv.rect(max(0, x), y, x + 14, y + 1, '#4a464c')
            cv.rect(x, y, x + 1, y + 10, '#4a464c')
    cv.noise(0, 0, W, 36, '#4a4450', 5)
    # 스테인드글라스
    for i, x in enumerate((30, 100, 210, 280)):
        cv.rect(x, 4, x + 26, 30, '#2a2430')
        for j in range(12):
            for k in range(6):
                c = ['#c83a4a', '#3a6ac8', '#e8c040', '#3a9a6a', '#a85ad8'][(i + j + k) % 5]
                cv.rect(x + 2 + k * 4, 6 + j * 2, x + 5 + k * 4, 8 + j * 2, c)
        cv.glow(x + 13, 40, 34)
    # 제단
    cv.rect(124, 36, 196, 64, '#3a3036')
    cv.rect(126, 38, 194, 62, '#e8e0d0')
    cv.rect(126, 52, 194, 54, '#c8a040')
    cv.rect(156, 20, 164, 40, '#d8b040')
    cv.rect(150, 26, 170, 30, '#d8b040')
    for x in (132, 186):
        cv.rect(x, 30, x + 2, 38, '#efe0c8')
        cv.px(x, 29, '#ffe080')
        cv.glow(x, 32, 30)
    # 통로 융단
    cv.rect(146, 64, 174, H, '#6a2a4a')
    cv.rect(148, 64, 172, H, '#8a3a5a')
    # 장의자
    for y in range(84, 250, 26):
        for (x0, x1) in ((30, 136), (184, 290)):
            cv.shade(x0, y + 10, x1, y + 14, 0.6)
            cv.rect(x0, y, x1, y + 10, '#3a2414')
            cv.rect(x0 + 1, y + 1, x1 - 1, y + 4, '#8a5a30')
            cv.rect(x0 + 1, y + 5, x1 - 1, y + 9, '#6a4020')
    # 헌금함
    cv.rect(200, 252, 214, 264, '#2a1a10')
    cv.rect(201, 253, 213, 263, '#8a6a30')
    cv.rect(205, 254, 209, 255, '#1a1010')
    cv.save('chapel', dark=0.1)


os.makedirs(OUT, exist_ok=True)
for f in (dungeon, tavern, manor, square, chapel):
    f()
print('ok')
