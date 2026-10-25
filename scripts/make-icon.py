# Regenerate icon.svg: python3 scripts/make-icon.py glow > icon.svg
# Low-poly bell icon generator: rows of the bell silhouette, strip-triangulated,
# inner vertices jittered, each triangle shaded mint by light direction + jitter.
import random, sys, math
random.seed(7)
CX = 32
# (y, half-width) down the bell profile
ROWS = [(9.5, 1.4), (12.5, 3.6), (16.5, 8.4), (22, 12), (28.5, 13.8), (35, 15), (40.5, 18), (44.5, 21.5)]
N = 4  # segments across each row
LIGHT = (-0.6, -0.8)  # from top-left

def lerp(a, b, t): return a + (b - a) * t
def hexmix(c1, c2, t):
    a = [int(c1[i:i+2], 16) for i in (1, 3, 5)]; b = [int(c2[i:i+2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(lerp(x, y, t)):02x}' for x, y in zip(a, b))

pts = []
for r, (y, w) in enumerate(ROWS):
    row = []
    for i in range(N + 1):
        x = CX - w + 2 * w * i / N
        yy = y
        if 0 < i < N and 0 < r < len(ROWS) - 1:  # jitter inner vertices only
            x += random.uniform(-0.9, 0.9); yy += random.uniform(-0.9, 0.9)
        row.append((x, yy))
    pts.append(row)

tris = []
for r in range(len(pts) - 1):
    a, b = pts[r], pts[r + 1]
    for i in range(N):
        if (i + r) % 2:
            tris += [(a[i], a[i+1], b[i]), (a[i+1], b[i+1], b[i])]
        else:
            tris += [(a[i], b[i+1], b[i]), (a[i], a[i+1], b[i+1])]
# clapper: a small faceted diamond
cy = 50
clap = [(CX, 46), (CX + 4.4, cy), (CX, 54.5), (CX - 4.4, cy), (CX + 0.4, cy - 0.5)]
tris += [(clap[0], clap[1], clap[4]), (clap[1], clap[2], clap[4]), (clap[2], clap[3], clap[4]), (clap[3], clap[0], clap[4])]
# two "ping" shards beside the bell
for s in (-1, 1):
    x0 = CX + s * 25.5
    tris += [((x0, 17), (x0 + s * 3.6, 24), (x0 + s * 0.2, 27)), ((x0 + s * 0.2, 27), (x0 + s * 3.6, 24), (x0 + s * 1.2, 34))]

def shade(t, light_c, dark_c):
    (x1, y1), (x2, y2), (x3, y3) = t
    nx, ny = (x1 + x2 + x3) / 3 - CX, (y1 + y2 + y3) / 3 - 30
    d = (nx * LIGHT[0] + ny * LIGHT[1]) / 22  # -1 lit .. +1 shadowed
    k = min(1, max(0, 0.5 - 0.5 * d + random.uniform(-0.2, 0.2)))
    return hexmix(dark_c, light_c, k)

def svg(bg, light_c='#D1FAE5', dark_c='#17786E'):
    random.seed(11)
    polys = ''.join(f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in t)}" fill="{shade(t, light_c, dark_c)}" stroke="{shade(t, light_c, dark_c)}" stroke-width=".35" stroke-linejoin="round"/>' for t in tris)
    if bg == 'glow':
        # Dark tile inset 2.5 so a soft mint glow fits around it; a thin mint rim and a faint
        # halo behind the bell keep it distinct on dark-grey and on white backgrounds.
        defs = ('<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#103F3A"/><stop offset="1" stop-color="#071C19"/></linearGradient>'
                '<radialGradient id="h" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="#34D399" stop-opacity=".28"/><stop offset="1" stop-color="#34D399" stop-opacity="0"/></radialGradient>'
                '<filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="1.3" flood-color="#34D399" flood-opacity=".55"/></filter></defs>')
        tile = (defs + '<rect x="2.5" y="2.5" width="59" height="59" rx="14" fill="url(#t)" filter="url(#g)"/>'
                '<rect x="3" y="3" width="58" height="58" rx="13.5" fill="none" stroke="#6EE7B7" stroke-opacity=".45" stroke-width="1"/>'
                '<circle cx="32" cy="30" r="24" fill="url(#h)"/>')
        # Light rim along every outer edge so the facets don't melt into the dark tile.
        fmt = lambda ps: ' '.join(f'{x:.1f},{y:.1f}' for x, y in ps)
        bell = [r[0] for r in pts] + [r[-1] for r in reversed(pts)]
        rim = 'fill="none" stroke="#A7F3D0" stroke-opacity=".8" stroke-width=".9" stroke-linejoin="round"'
        outlines = f'<polygon points="{fmt(bell)}" {rim}/>' + f'<polygon points="{fmt(clap[:4])}" {rim}/>'
        for t in tris[-4:]:  # the two shards, two triangles each
            outlines += f'<polygon points="{fmt(t)}" {rim}/>'
        g = f'<g transform="translate(32 32) scale(.9) translate(-32 -32)">{polys}{outlines}</g>'
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{tile}{g}</svg>'
    tile = '' if bg is None else f'<rect width="64" height="64" rx="15" fill="{bg}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">{tile}{polys}</svg>'

if __name__ == '__main__':
    variant = sys.argv[1]
    print({'dark': svg('#0B2A27'), 'light': svg('#ECFDF5'), 'none': svg(None), 'glow': svg('glow')}[variant])
