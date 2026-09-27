---
name: verify
description: Verify a change to middleton.io in the page itself before calling it done. Use after editing any page, stylesheet, or script on the site (homepage, blog template, case studies, prototypes, KevinOS), and before pushing to main. Runs headless Chrome at desktop and phone width, checks for JS errors, sideways scroll, layout shift, and em dashes in copy, runs the Impeccable detector, and saves screenshots to look at.
---

# Verify a site change

Kevin's manual check after any change is: open the page on a laptop and a phone, click around, watch the console, and look for anything that jumps, overflows, or reads as generated. This skill is that check, so you run it yourself instead of handing it back.

## Run it

```bash
node tools/verify.mjs <page-path> [more pages]
# e.g.
node tools/verify.mjs prototypes/mfp/
node tools/verify.mjs index.htm blog/
node tools/verify.mjs --out /tmp/verify prototypes/mfp/   # choose where screenshots go
```

Pass every page your change can reach. A change to `fv.css` reaches the homepage, blog, and case studies; a change inside `prototypes/mfp/` reaches only that page.

## What it checks

Hard checks (exit code 1 if any fail):
- JavaScript errors at 1280px or 390px
- Horizontal scroll at either width
- Layout shift (CLS) over 0.1, Google's "good" threshold
- Em dashes in visible copy (a house rule; see PRODUCT.md)

Reported, not failed on:
- Impeccable detector findings. Some are deliberate (a prototype that borrows another brand's font, a chart grid); judge each against DESIGN.md and the page's own brief.

## Then look

Open the two screenshots it prints and actually look at them before saying the change is done. The checks catch mechanics; they do not catch a headline that breaks on one word, a caption that makes no sense, or a section that feels off. When the change is interactive (buttons, toggles, demo scenarios), exercise it in the page too, not just on load.

## Fix, re-run, report

Fix what fails and re-run until the hard checks pass. When you report back, say which pages you verified, at which widths, and anything you chose to leave (with the reason).

## Grow the loop

Whenever Kevin points out something he had to catch by eye, ask whether it can be measured, and if so add it to `tools/verify.mjs` so it is caught next time: a performance budget, an accessibility check, a DESIGN.md rule. That is how this skill should grow.
