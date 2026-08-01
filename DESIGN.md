# DESIGN.md: middleton.io

The visual system for Kevin Middleton's site. Written for agents: read this before
changing any styling, so new work inherits the system instead of the model's defaults.

**Source of truth for values: `fv.css`.** The homepage loads exactly one stylesheet,
`/fv.css`, and `index.htm` is the live homepage file (not `index.html`). Other
surfaces own their own systems and are pointered at the end of this document.

> Rewritten 2026-07-31. The previous version documented the pre-relaunch system:
> it named `styles-merged.css` as the source of truth (that file now exists only
> in `archive/_assets/`), and half its tokens (`--coral`, `--text-primary`,
> `--card-bg`, `--font-family`) do not exist in `fv.css`. An agent following it
> would have written CSS that silently did nothing. Values below were extracted
> from the shipped stylesheet and read back as computed values in both themes.

---

## Identity

Warm, editorial, human. Not a SaaS template, not a dark-mode dev portfolio.
The site reads as a person who builds things, so the craft has to hold up on
inspection: corners match, spacing is deliberate, nothing is left at a default.

**Surface modes** (what each page is *for*):
- `/` homepage: **persuade**. Recruiters and hiring managers deciding in ~30 seconds.
- `/blog/`: **read**. Long-form, comfortable line lengths, minimal chrome.
- `/kevinos/`: **experience**. A deliberate retro-OS bit. Its weirdness is the point.
- `/prototypes/`, micro-sites: **experience/persuade**, each with its own liberty.

---

## Color

There is no single brand hex. The system is built on **roles**, not names, and
almost every role flips between light and dark. Six named hues carry identity;
everything structural is neutral.

### Structural roles

| Token | Light | Dark | What it is |
|---|---|---|---|
| `--bg` | `#F4F4F5` | `#0F0F12` | page ground |
| `--bg2` | `#E9E9EC` | `#17171B` | raised ground, hover fill |
| `--ink` | `#111113` | `#F2F2F4` | primary text, heavy rules |
| `--ink2` | `#5B5B62` | `#A2A2AC` | body copy, secondary text |
| `--rule` | `#D8D8DD` | `#2C2C33` | hairline between rows |
| `--rule-strong` | `#8B8B90` | `#656570` | a rule that must be *seen* |
| `--tag-line` | `#8C8C94` | `#6E6E7A` | outline of a pill that reads as an object |
| `--invert` | `#111113` | `#EDEDF0` | the deliberate contrast panel |
| `--on-invert` | `#F2F2F4` | `#111113` | text on that panel |
| `--nav-bg` | `rgba(244,244,245,.92)` | `rgba(15,15,18,.92)` | sticky nav, translucent |
| `--tint-soft` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.06)` | faintest wash |

`--invert` is separate from `--ink` on purpose: `--ink` also carries text and
borders, which invert with the mode, and the contrast panel must stay a panel.

### Accents on a ground

These exist in pairs because the same colour cannot serve two grounds. Picking
the wrong one of a pair is the most common colour bug in this codebase.

| Token | Light | Dark | Drawn on |
|---|---|---|---|
| `--accent-text` | `#AB3142` | `#D26978` | the page |
| `--accent-on-invert` | `#CF5F6F` | `#AB3142` | the `--invert` panel |
| `--gold-rule` | `#815B0C` | `#E8A317` | the page |
| `--gold-on-invert` | `#E8A317` | `#815B0C` | the `--invert` panel |

### The six hues (mode-stable)

`--marigold #E8A317` · `--madder #C3384B` · `--viridian #2C7A63` ·
`--cobalt #1F4B8F` · `--plum #6D4AA8` · `--fuchsia #9E227D`

Text on them: `--on-hue #FFFFFF`, except marigold, which is a *light* surface and
takes `--on-mari #241700`.

Each hue has a `c1`–`c6` triad so you never have to decide how to use it:

- `--cN-line`: outline. Moves per mode, because it must clear 3:1 against the page.
- `--cN-fill`: the pure hue. Never moves; a filled chip brings its own ground.
- `--cN-on`: text on that fill.
- `--cN-text`: the hue used *as text on the page*. Moves per mode.

`c1` gold, `c2` madder, `c3` viridian, `c4` cobalt, `c5` plum, `c6` fuchsia.
Cobalt, plum and fuchsia all lift their `line` and `text` values in dark mode
(`#1F4B8F` → `#4B6FA5`, etc.) because the base hues fall under the floor on a
dark page. `--swap-1..4` exist for the same reason in chip contexts.

### Rules

1. **Never hardcode a hex in new work.** Use a token. The exception is a value
   that sits on a fixed ground of its own, such as the lightbox scrim, where the
   page tokens are the wrong reference; comment it when you do.
2. **Ask which ground it lands on before picking a token.** See below.
3. Elements with a fixed background of their own render the same in both modes.
   Do not write dark-mode overrides for them.

---

## The two-ground problem

The single most repeated trap here. A colour drawn **on the page** and the same
colour drawn **on the `--invert` panel** are never the same value at the same
time, because the two grounds move in opposite directions between modes.

Concretely, gold:

```
              light page   dark page
--gold-rule     #815B0C     #E8A317     <- gold ON THE PAGE
--gold-on-invert #E8A317    #815B0C     <- gold ON THE PANEL
```

They are exact inverses of each other. This is why each needs its own token and
why reusing one for the other is always wrong in one mode.

This has bitten twice. Raw `--marigold` measures **1.97** against the light page,
so an open Experience row drew its bottom rule in a colour that made the edge
*disappear* rather than highlight, and it looked correct to anyone testing in
dark mode only. Before you reach for an accent, ask what is behind it, and check
the other theme.

---

## Contrast contract

This site takes measured contrast seriously; `fv.css` cites **25** specific
ratios in its comments. Hold new work to the same standard.

- Body and small text: **4.5:1** against its real composited background.
- Graphical objects that carry meaning (rules, outlines, chips, icons): **3:1**.
- Touch targets: **44×44** minimum.
- State must not rely on colour alone. An open row changes its rule *colour*,
  but the `+` glyph also rotates.

When you change a colour, measure it rather than eyeballing it:

- Kill transitions first (`*{transition:none!important;animation:none!important}`),
  or you will read a value mid-animation.
- Composite the **real** background by walking up until you hit an opaque one.
  A translucent tint over an unknown ground is not a colour.
- Handle both `rgb()` and `color(srgb …)`; `color-mix()` computes to the latter.
- Check **both themes**. Most bugs here pass in one and fail in the other.

A tint is not automatically a contrast failure. Sector pills carry their hue on
a **border** at 4.69–7.76 with a 17:1 label, and the 22% fill exists only to tell
the four sectors apart. No tint of these hues reaches 3:1 on a near-white page,
and it does not need to.

---

## Type

Two families, both system stacks. **No webfont is loaded on the homepage**. There
is no Google Fonts link in `index.htm`.

- `--sans` → `"Helvetica Neue", Helvetica, Arial, sans-serif`
- `--mono` → `"SF Mono", Menlo, ui-monospace, "Cascadia Mono", Consolas, monospace`

Mono is not decoration. It marks the *ledger* register: dates, sector pills,
skill tags, kickers, mode switches, counters. Prose is never mono.

Headings are fluid, never fixed. The house pattern is
`font-size: clamp(<floor>, <vw>, <ceiling>)` with tight tracking
(`letter-spacing: -.02em` to `-.04em`) and `line-height` near `.95`–`1.05` at
display sizes. Existing examples: `clamp(2.1rem, 7.4vw, 5.4rem)` for the hero,
`clamp(1.9rem, 6vw, 4.2rem)` for a section headline,
`clamp(1.6rem, 3.4vw, 2.5rem)` for a subhead.

Small mono UI text runs `.53rem`–`.68rem` with `letter-spacing: .1em` and
`text-transform: uppercase`. Below about `.62rem` legibility, not contrast, is
usually the binding constraint.

---

## Space, shape, depth

- **Radius:** `--r: 10px` is the house radius. `--radius-lg` aliases it;
  `--radius-full: 99px` for pills. There is no small/medium/large ramp.
- **Spacing:** `--spacing-xs .25rem`, `sm .5rem`, `md .85rem`, `lg 1.15rem`,
  `xl 1.8rem`, `2xl 2.8rem`.
- **Shadows** move with the mode, because a shadow on a dark page needs far more
  alpha to read at all:

  | Token | Light | Dark |
  |---|---|---|
  | `--shadow-1` / `--shadow-06` | `0 1px 3px rgba(0,0,0,.06)` | `…,.5` |
  | `--shadow-2` / `--shadow-12` | `0 4px 14px rgba(0,0,0,.10)` | `…,.6` |
  | `--shadow-3` / `--shadow-20` | `0 10px 30px rgba(0,0,0,.15)` | `…,.7` |

- **Transitions:** `--transition-fast .12s ease`, `--transition-base .2s ease`.
  Hover colour transitions are `.18s`–`.2s`. There are **7** `prefers-reduced-motion`
  blocks; add to them rather than shipping motion that ignores the setting.

---

## Interaction conventions

Match these rather than inventing a new one.

**Cards.** `.bc` sets `border-radius: var(--r)`, `padding: 1.05rem`,
`display: grid` with `align-content: space-between`, and `position: relative`.
Hover lift is `translateY(-6px)`. The homepage arranges them in `.bento`,
`grid-template-columns: repeat(3,1fr)` with rows `7.6rem 15.8rem`.

**The "go somewhere" affordance** is `.go`: a full-width bar pinned to the bottom
of the card (`position:absolute; left:0; right:0; bottom:0`) over `--scrim-dark`,
or `--scrim-light` on the marigold card. It is a labelled bar ("Book a slot",
"Boot it up"), not a bare glyph in a corner. Give every card a real verb.

**Outbound links inside body copy** end with `.arw-ne`, a drawn `↗` at `.72em`,
plus a visually hidden "(opens in a new tab)". The glyph is a masked box using
`currentColor`, not a font character, so it matches the weight of the type it
sits in. `.arw` is the same idea for the `0 → 1` form.

**The CTA pill** is `.cta`: `--marigold` ground with `--on-mari` text,
`translateY(-2px)` on hover.

**Focus** is `outline: 3px solid var(--ink); outline-offset: 2px`, used verbatim
in four places. Match it. On a fixed dark ground such as the lightbox, gold is
the substitute, since `--ink` would vanish.

**No layout shift on hover.** Use shadow and transform, never padding, border
width, or font size.

**Reserve space for images.** Every `<img>` carries `width`/`height` alongside
`width:100%; height:auto` in CSS. Responsive *and* CLS-stable.

---

## Layout

- The homepage is a **bento grid**; cards are self-contained and each states one idea.
- **Cap and centre long-form content.** Text must never sprawl the full width of a
  maximised window. Verified caps: article column `720px`, KevinOS experience list
  `760px`, blog index `1040px` (in `blog/blog.css`), all `margin-inline: auto`.
- **Measure prose in `ch`, not `px`.** Established: `68ch` for descriptions,
  `72ch` for list items, `62ch` for standfirsts. 45–75ch is the readable band.
  A correct measure can still *look* broken if the space beside it is empty; fix
  the emptiness, not the measure.
- **When content wraps to its own row, centre it.** Prefer container-relative
  solutions (flex-wrap with a sensible `flex-basis`, caps) over `@media`. This
  matters inside KevinOS windows, which are narrow *within* a wide viewport, so
  viewport media queries never fire.
- Wide content (tables, code, diagrams) scrolls inside its own container; the page
  body never scrolls horizontally.

---

## Known traps

Each of these has actually shipped a bug here.

**The palette is declared in six places.** `:root` (85 tokens), `:root` under
`prefers-color-scheme: dark` (36), `:root[data-theme="dark"]` (36),
`:root[data-theme="light"]` (69), `.fv` (55), and `.fv` under dark (24). A token
added to one is silently missing from the other five. **For a token only one
component needs, declare it scoped to `.fv` plus its dark override and stop
there**. That is how `--gold-rule` and `--tag-line` were added. Touch all six
only for something genuinely global.

**Descendant selectors leak into children.** `.rrow-tags span` matched the spans
*inside* a tag as well as the tag itself, so a drawn arrow inherited the pill's
padding and border and could never reach its specified size. Use `>` when you
mean "the element", not "anything inside it".

**`grid-row: 1 / -1` does not span what it looks like.** With no declared
`grid-template-rows` every row is implicit, so `-1` resolves to the end of the
*explicit* grid, line 1, and the span silently collapses to a single row. If a
column needs to sit beside multi-element content, wrap that content so each
column is one grid item.

**`:has()` contributes its argument's specificity,** and equal specificity is
resolved by source order. A `:has()` rule can beat a plainer one you expected to win.

**Custom properties inherit downward only.** Setting `--x` on a child is
invisible to its parent. If a container styles itself from a token, the token has
to be set on the container.

**Verify what the user sees, not what you changed.** The recurring failure here
has been fixing the data and not checking the render, or fixing a container and
not its contents.

---

## Other surfaces

Each owns its own system. Do not assume homepage tokens apply.

**KevinOS**. `kevinos/kevinos.css` (~200KB; 50 distinct custom properties,
declared 208 times across its theme blocks) and `kevinos/index.html`. Its own
world: **Outfit** and **JetBrains Mono**, Georgia
for serif accents, dark as the `:root` default with light via
`prefers-color-scheme` and `[data-theme]`. It has a fixed icon-tile palette that
deliberately does **not** invert between modes. Bullet lead-ins are bolded there,
and were the precedent for doing the same on the homepage.

**Blog**. Loads `fv.css` **and then** `blog/blog.css` (~15KB), so it inherits
the homepage system and layers on top. It carries its own shim layer mapping
legacy names onto current ones (`--accent: var(--marigold)`,
`--coral-text: var(--accent-text)`, `--font-heading` → the system sans), which is
why `--coral-text` still appears in blog CSS and is *not* dead. Generated HTML
comes from `tools/blog-generate.mjs` in this repo; fenced code blocks become
`.prompt-block` with a Copy button, and inline backticks become `<code>`.

**Compatibility shims.** `fv.css` still defines `--surface: var(--bg2)`,
`--border: var(--rule)`, `--text-muted: var(--ink2)` and similar. These are
bridges for older page-scoped CSS (`body.p-recipes`, `body.p-slides`). **They are
not the design system.** Write new homepage work against `--bg2`, `--rule`,
`--ink2` directly.

---

## Anti-references (do not produce)

- Purple/violet gradients, glassmorphism, neon-on-black "AI" aesthetics.
- AI beige, generic drop shadows on everything, decorative motion with no meaning.
- Stock SaaS buzzwords in copy: *streamline, empower, supercharge, world-class,
  enterprise-grade, next-generation, cutting-edge, seamless*. Say the concrete thing.
- Em dashes in polished copy. Use a period or restructure. (House rule.)
- "Shape" as a noun for tone/structure/feel. (House rule.)
- Gendered pronouns for the AI assistant. Use "my assistant" or "it". (House rule.)
- Sanding the strangeness off KevinOS to make it look like a modern SaaS app.

---

## Guardrails

- **Never redesign KevinOS toward contemporary taste.** The retro-OS bit is the
  differentiator. Fix bugs, spacing, and a11y; leave the aesthetic alone.
- The homepage, KevinOS, and the blog share some tokens but are *not* meant to
  look identical. Respect each surface's mode.
- Images: JPEG for anything that doubles as `og:image` (universal social-scraper
  support). WebP only for inline images that need alpha. Never ship multi-MB PNGs.
  Serve a thumbnail at display size and keep the original for the lightbox.
- Accessibility: every image has `alt`; one `<h1>` per page; KevinOS windows are
  non-modal `role="dialog"` (multi-window desktop, so do **not** add `aria-modal`).
  A modal overlay, such as the Experience lightbox, *does* take `aria-modal`,
  a focus trap, Escape, and focus returned to whatever opened it.
- Never claim a fix works without measuring it in **both** themes and at a phone
  width. Assert the viewport actually applied before trusting a responsive check.

---

## Checking this document

Values here were extracted from `fv.css` and read back as computed values in both
themes. If you change tokens, re-extract rather than editing the tables by hand.
Reading the *computed* value is what makes this trustworthy: it resolves the real
cascade across all six palette blocks, rather than whichever one you happened to
open. Paste into the console, once per colour scheme:

```js
(() => {
  const host = document.querySelector('.fv') || document.body;
  const cs = getComputedStyle(host), names = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    (function walk(list) {
      for (const r of list) {
        if (r.cssRules) walk(r.cssRules);
        if (r.style) for (const p of r.style) if (p.startsWith('--')) names.add(p);
      }
    })(rules);
  }
  return Object.fromEntries([...names].sort()
    .map(n => [n, cs.getPropertyValue(n).trim()]).filter(([, v]) => v));
})()
```

To find every block that would need a new *global* token, rather than a
`.fv`-scoped one:

```bash
grep -n -- "--ink:" fv.css
```

