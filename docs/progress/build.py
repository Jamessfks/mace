#!/usr/bin/env python3
"""Render docs/progress/state.json into a standalone progress page.

Kept deliberately dependency-free and single-file: this page is watched by a
human while a long multi-agent run is in flight, so it must render from a
plain `python3 docs/progress/build.py` with nothing installed.
"""
import html
import json
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
state = json.loads((HERE / "state.json").read_text())

STATUS = {
    "building": ("#B4802A", "#FBF2DF", "building"),
    "queued": ("#7A7A72", "#F0EEE8", "queued"),
    "review": ("#2F6FA8", "#E6F0F8", "in review"),
    "won": ("#4F9A54", "#E8F3E9", "critic picked ours"),
    "blocked": ("#A83A2F", "#F8E9E6", "blocked"),
    "done": ("#4F9A54", "#E8F3E9", "done"),
}


def chip(status):
    fg, bg, label = STATUS.get(status, STATUS["queued"])
    return f'<span class="chip" style="color:{fg};background:{bg}">{html.escape(label)}</span>'


def esc(s):
    return html.escape(str(s))


pieces = state["pieces"]
won = sum(1 for p in pieces if p["status"] in ("won", "done"))

rows = []
for p in pieces:
    rounds = p.get("rounds", [])
    rhtml = ""
    if rounds:
        items = "".join(
            f'<li><b>R{r["n"]}</b> — <span class="verdict {("win" if r.get("win") else "loss")}">'
            f'{"ours" if r.get("win") else "theirs"}</span> · {esc(r["gap"])}</li>'
            for r in rounds
        )
        rhtml = f'<ul class="rounds">{items}</ul>'
    note = f'<div class="note">{esc(p["notes"])}</div>' if p.get("notes") else ""
    rows.append(
        f'<div class="piece"><div class="ph"><h3>{esc(p["name"])}</h3>{chip(p["status"])}</div>'
        f'<p>{esc(p["detail"])}</p>{note}{rhtml}</div>'
    )

bars = "".join(
    f'<div class="bar"><a href="{esc(b["url"])}">{esc(b["name"])}</a>'
    f'<span class="bstat">{esc(b["status"])}</span><p>{esc(b["role"])}</p></div>'
    for b in state["bars"]
)

cons = "".join(f"<li>{esc(c)}</li>" for c in state["constraints"])
log = "".join(
    f'<li><span class="lt">{esc(e["t"])}</span>{esc(e["msg"])}</li>' for e in reversed(state["log"])
)

stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SimpleAtom v{esc(state["version"])} — gauntlet progress</title>
<style>
:root{{--bg:#FBFAF7;--ink:#1E1E1B;--mut:#6B6B62;--line:#E4E1D8;--accent:#4F9A54}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);
 font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Inter,sans-serif;
 -webkit-font-smoothing:antialiased}}
.wrap{{max-width:940px;margin:0 auto;padding:44px 24px 80px}}
header{{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:30px}}
h1{{margin:0 0 6px;font-size:27px;letter-spacing:-.02em}}
h1 span{{color:var(--accent)}}
.goal{{color:var(--mut);max-width:660px;margin:0}}
.stamp{{color:var(--mut);font-size:12.5px;margin-top:14px;
 font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
h2{{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--mut);
 margin:38px 0 14px;font-weight:600}}
.bars{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
.bar{{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:#fff}}
.bar a{{color:var(--ink);font-weight:650;text-decoration:none;border-bottom:2px solid var(--accent)}}
.bar p{{margin:8px 0 0;color:var(--mut);font-size:13.5px}}
.bstat{{float:right;font-size:11.5px;color:var(--mut);
 font-family:ui-monospace,Menlo,monospace}}
.meas{{border:1px solid var(--line);border-left:3px solid var(--accent);
 border-radius:8px;padding:14px 16px;background:#fff}}
.meas b{{display:block;margin-bottom:4px}}
.meas p{{margin:0;color:var(--mut);font-size:13.5px}}
.piece{{border:1px solid var(--line);border-radius:10px;padding:15px 17px;
 background:#fff;margin-bottom:11px}}
.ph{{display:flex;align-items:center;gap:12px}}
.ph h3{{margin:0;font-size:15.5px;flex:1;letter-spacing:-.01em}}
.piece p{{margin:7px 0 0;color:var(--mut);font-size:13.5px}}
.note{{margin-top:8px;font-size:12.5px;color:var(--mut);
 font-family:ui-monospace,Menlo,monospace;background:#F5F3ED;
 padding:6px 9px;border-radius:6px}}
.chip{{font-size:11px;font-weight:650;padding:3px 9px;border-radius:20px;
 white-space:nowrap;letter-spacing:.02em}}
.rounds{{margin:11px 0 0;padding-left:17px;font-size:13px;color:var(--mut)}}
.rounds li{{margin:3px 0}}
.verdict{{font-weight:650}}
.verdict.win{{color:var(--accent)}}
.verdict.loss{{color:#A83A2F}}
ul.plain{{margin:0;padding-left:18px;color:var(--mut);font-size:13.5px}}
ul.log{{list-style:none;margin:0;padding:0;font-size:13.5px}}
ul.log li{{padding:9px 0;border-bottom:1px solid var(--line);color:var(--mut)}}
.lt{{display:inline-block;min-width:64px;color:var(--accent);font-weight:650;
 font-family:ui-monospace,Menlo,monospace;font-size:11.5px;text-transform:uppercase}}
.score{{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--mut)}}
@media(max-width:640px){{.bars{{grid-template-columns:1fr}}}}
</style></head><body><div class="wrap">
<header>
<h1>SimpleAtom <span>v{esc(state["version"])}</span> — gauntlet progress</h1>
<p class="goal">{esc(state["goal"])}</p>
<div class="stamp">updated {stamp} · <span class="score">{won}/{len(pieces)} pieces past the critic</span></div>
</header>

<h2>The bars</h2><div class="bars">{bars}</div>

<h2>The measurable half</h2>
<div class="meas"><b>{esc(state["measurable"]["name"])}</b>
<p>{esc(state["measurable"]["rule"])}</p>
<p style="margin-top:6px"><i>{esc(state["measurable"]["status"])}</i></p></div>

<h2>Pieces</h2>{"".join(rows)}

<h2>Hard constraints</h2><ul class="plain">{cons}</ul>

<h2>Log</h2><ul class="log">{log}</ul>
</div></body></html>
"""
(HERE / "index.html").write_text(doc)
print(f"wrote {HERE/'index.html'} — {won}/{len(pieces)} won")
