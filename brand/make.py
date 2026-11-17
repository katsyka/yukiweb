#!/usr/bin/env python3
"""YukiWeb logo (helmet with a search-bar visor, A1·1). Writes the SVGs; render.py turns them into PNGs.
B is the color of the visor and swoosh: brand yellow, or var(--acc) inside the app so it follows the accent."""
INK, Y = "#16181e", "#ffd23f"

def inner(b=Y, ink=INK):
    return (f'<path fill="{ink}" stroke="none" d="M12 47.5C8 43 6.5 37 7 31 8 17.5 19.5 8 34 8c13 0 22.5 7.5 25 18l1.6 10c1.8 2.6 2.4 5 2 8-.8 5.5-5 9-10.6 9H31c-7.5 0-14.5-1.5-19-5.5Z"/>'
            f'<path fill="{b}" stroke="none" d="M34 28C22 29.2 13 35.5 9 44.4 15 39.1 23 34.5 34 33.2Z"/>'
            f'<rect fill="{b}" stroke="none" x="28" y="20.5" width="34.5" height="13" rx="6.5"/>'
            f'<circle cx="36" cy="27" r="3.8" fill="none" stroke="{ink}" stroke-width="2.5"/>'
            f'<path d="m38.8 29.8 2.5 2.5" fill="none" stroke="{ink}" stroke-width="2.5" stroke-linecap="round"/>')

# The mark alone, centred in a square (helmet spans x 6.5-62.6, y 8-53).
def mark(b=Y, attrs=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 0 61 61"{attrs}>{inner(b)}</svg>'

# App icon: the mark on a yellow rounded tile.
def tile(radius=14, scale=.8, bg=Y):
    rect = f'<rect width="64" height="64" rx="{radius}" fill="{bg}"/>' if radius is not None else f'<rect width="64" height="64" fill="{bg}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{rect}'
            f'<g transform="translate(32 32) scale({scale}) translate(-34.5 -30.5)">{inner(bg)}</g></svg>')

# Android adaptive foreground: transparent, mark inside the 66/108 safe zone.
def foreground():
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">'
            f'<g transform="translate(54 54) scale(1.0) translate(-34.5 -30.5)">{inner(Y)}</g></svg>')

if __name__ == "__main__":
    open("mark.svg", "w").write(mark())
    open("icon.svg", "w").write(tile())
    open("icon-square.svg", "w").write(tile(radius=None, scale=.82))
    open("icon-round.svg", "w").write(tile(radius=32, scale=.72))
    open("foreground.svg", "w").write(foreground())
    print("ok")
