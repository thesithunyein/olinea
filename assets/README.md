# Olinea logo sprite sheet
# One ring, two tones. Every cut is a square crop of the same artwork; nothing is hand-drawn per size.
# Generated once. Do not hand-edit. If the mark needs to change, edit the source and regenerate.

SRC = "assets/logo.jpg"  # parent artwork the mark was cut from; kept in-repo, not served

SIZES = {
    # name: (px, tone)
    "logo-mark":      (256, "dark"),
    "logo-mark-ink":  (256, "ink"),
    "logo-mark-white-96": (96, "light"),
    "logo-mark-ink-96":   (96, "ink"),
    "logo-mark-white-48": (48, "light"),
    "logo-mark-ink-48":   (48, "ink"),
    "favicon":        (180, "dark"),
}

# Ring in flat white (dark theme) or flat ink-black (light theme), with the diagonal
# hatch only on the top-right quadrant of the loop; the lower-left swoosh is flat.
