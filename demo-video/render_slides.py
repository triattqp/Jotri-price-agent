#!/usr/bin/env python3
"""Render 5 terminal-style slides (1920x1080) for the Terminal 3 demo video."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG = (14, 15, 17)        # charcoal
PANEL = (24, 26, 30)
ORANGE = (196, 93, 49)
GREEN = (88, 200, 120)
WHITE = (233, 231, 223)
GREY = (150, 152, 158)
YELLOW = (232, 199, 99)

MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

f_title = ImageFont.truetype(SANS_B, 64)
f_sub = ImageFont.truetype(SANS, 34)
f_mono = ImageFont.truetype(MONO, 38)
f_mono_sm = ImageFont.truetype(MONO, 32)
f_foot = ImageFont.truetype(SANS, 28)

SLIDES = [
    {
        "file": "slide-s1.png",
        "kicker": "AMANI PRICE AGENT  ·  TERMINAL 3 MICRO GRANT",
        "title": "THE PROBLEM",
        "lines": [
            ("$", "$ agent holds the payer's wallet key", GREY),
            ("$", "$ agent holds API keys in the clear", GREY),
            ("$", "$ one leak  →  money gone", (232, 120, 90)),
            ("", "", GREY),
            ("✓", "✓  own did:t3n identity", GREEN),
            ("✓", "✓  scoped owner mandate", GREEN),
            ("✓", "✓  tamper-evident audit log", GREEN),
            ("✓", "✓  never holds a key", GREEN),
        ],
    },
    {
        "file": "slide-s2.png",
        "kicker": "DEMO  ·  REAL JOTRI PRICE API  ·  DRY-RUN",
        "title": "1 · MANDATE — ISSUED & VERIFIED",
        "lines": [
            ("$", "$ owner DID: did:t3n:agent-Nols-…", WHITE),
            ("$", "$ agent DID: did:t3n:agent-IxOA-…", WHITE),
            ("$", "$ scope: GET /price  |  max/call: $0.001", WHITE),
            ("$", "$ daily cap: $0.10  |  expires: 24h", WHITE),
            ("", "", GREY),
            ("✓", "✓  owner signature valid, mandate in force", GREEN),
        ],
    },
    {
        "file": "slide-s3.png",
        "kicker": "DEMO  ·  REAL JOTRI PRICE API  ·  DRY-RUN",
        "title": "2 · PRICE REQUEST — 402 CHALLENGE",
        "lines": [
            ("$", "$ GET /price?coin=bitcoin", WHITE),
            ("✓", "✓  402 Payment Required — challenge parsed", GREEN),
            ("$", "$ scheme: exact  |  network: eip155:8453", WHITE),
            ("$", "$ amount: 1000  =  $0.001 USDC", WHITE),
            ("$", "$ payTo: 0x076b…dedc", WHITE),
            ("", "", GREY),
            ("✓", "✓  route in scope, $0.001 <= max/call $0.001", GREEN),
        ],
    },
    {
        "file": "slide-s4.png",
        "kicker": "DEMO  ·  REAL JOTRI PRICE API  ·  DRY-RUN",
        "title": "3 · AUDIT TRAIL — TAMPER-EVIDENT",
        "lines": [
            ("$", "$ verify hash chain…", WHITE),
            ("✓", "✓  chain valid, 5 entries", GREEN),
            ("", "", GREY),
            ("$", "$ attacker edits one entry: max/call → $100.00", (232, 120, 90)),
            ("✓", "✓  tampering detected at seq 2", GREEN),
            ("$", "$ the log cannot be silently edited", WHITE),
        ],
    },
    {
        "file": "slide-s5.png",
        "kicker": "AMANI PRICE AGENT  ·  TERMINAL 3 MICRO GRANT",
        "title": "NEXT · THE T3 ENCLAVE",
        "lines": [
            ("$", "$ free signup: terminal3.io", WHITE),
            ("$", "$ did:t3n + API key + 20,000 credits", WHITE),
            ("$", "$ signing moves into an Intel TDX enclave", WHITE),
            ("$", "$ mandate → sealed vault contract", WHITE),
            ("", "", GREY),
            ("✓", "✓  trust-native, on T3 Network", GREEN),
        ],
    },
]

import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

for s in SLIDES:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # top accent bar
    d.rectangle([0, 0, W, 10], fill=ORANGE)
    # kicker
    d.text((90, 70), s["kicker"], font=f_sub, fill=ORANGE)
    # title
    d.text((90, 120), s["title"], font=f_title, fill=WHITE)
    # divider
    d.rectangle([90, 215, W - 90, 218], fill=(60, 62, 66))
    # terminal panel
    d.rounded_rectangle([90, 260, W - 90, H - 130], radius=18, fill=PANEL)
    y = 310
    for _, text, color in s["lines"]:
        if text == "":
            y += 30
            continue
        d.text((140, y), text, font=f_mono, fill=color)
        y += 72
    # footer
    d.text((90, H - 80), "Amani Price Agent  ·  jotri.ai  ·  DoraHacks — Terminal 3 Build+Scale Agent Micro Grant",
           font=f_foot, fill=GREY)
    img.save(s["file"])
    print("wrote", s["file"])
