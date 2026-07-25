# DESIGN.md — middleton.io

The visual system for Kevin Middleton's site. Written for agents: read this before
changing any styling so new work inherits the system instead of the model's defaults.

Source of truth for values: `styles-merged.css` (`:root`). KevinOS has its own
system in `kevinos/kevinos.css`; the blog layers on top of the homepage tokens
via `blog/blog.css`.

---

## Identity

Warm, editorial, human. Not a SaaS template, not a dark-mode dev portfolio.
The site reads as a person who builds things, so the craft has to hold up on
inspection — corners match, spacing is deliberate, nothing is left at a default.

**Surface modes** (what each page is *for*):
- `/` homepage — **persuade**. Recruiters and hiring managers deciding in ~30 seconds.
- `/blog/` — **read**. Long-form, comfortable line lengths, minimal chrome.
- `/kevinos/` — **experience**. A deliberate retro-OS bit. Its weirdness is the point.
- `/prototypes/`, micro-sites — **experience/persuade**, each with its own liberty.

---

## Color

**Brand constant:** `--coral: #FF7F50`. It is the same value in light *and* dark
mode, on purpose. It is the one thing that never shifts. `--accent` aliases it.

Light / dark pairs (dark overrides in `@media (prefers-color-scheme: dark)`):

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F0EEE9` | `#0d1117` |
| `--surface` | `#F5F4F0` | `#161b22` |
| `--card-bg` | `#ffffff` | `#161b22` |
| `--text-primary` | `#1a202c` | `#e6edf3` |
| `--text-secondary` | `#4a5568` | `#8b949e` |
| `--text-muted` | `#94a3b8` | `#6e7681` |
| `--border` | `#ddd8d0` | `#30363d` |

Mode-stable: `--coral`, `--coral-hover: #e06840`, `--deep-ink: #0A2342`,
`--amber`, `--gold`, `--teal`, `--steel-blue`, `--slate`, `--white`.

**Rules**
1. Never hardcode a hex in new work. Use a token. For translucent white use
   `rgba(var(--white-rgb), x)`, never `rgba(255,255,255,x)`.
2. **Never use `--text-muted` for resting body text on a dark surface.** It dims
   to `#6e7681` in dark mode and goes unreadable. Use `--text-light` (`#e6edf3`).
   This was a real bug on the "Writing on AI & Work" card.
3. Cards with a fixed background (`--deep-ink` navy, the coral gradient) render
   identically in both modes. Don't write dark-mode overrides for them.

---

## Type

- Body: `--font-family` → **Inter**
- Headings: `--font-heading` → **Epilogue** (700/800/900)
- KevinOS: **Outfit** + **JetBrains Mono** (its own world)
- Mono/code: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas`

Article titles use `clamp(30px, 5vw, 40px)` with `text-wrap: balance`.
Body copy in articles is 18px / 1.75.

---

## Space, shape, depth

- Radii: `--radius-sm .5rem`, `--radius-md 1rem`, `--radius-lg 1.5rem`, `--radius-full`.
  Bento cards use **20px**.
- Spacing scale: `--spacing-xs .5rem` → `--spacing-2xl 4rem`.
- Shadows: `--shadow-sm` → `--shadow-xl`, plus `--shadow-06/12/20`.
- Transitions: `--transition-fast 150ms`, `--transition-base 250ms`, `--transition-slow 350ms`.
  Hover color transitions are `0.2s`.

---

## Interaction conventions

These are the house patterns. Match them rather than inventing a new one.

**Corner arrow.** Linked bento cards get a `↗` (`\2197`) via `a.bento-card::before`:
`1.1rem`, `rgba(255,255,255,0.4)` resting → `0.8` on hover with
`transform: translate(2px, -2px)`, pinned `bottom: 16px; right: 16px`. Any
"go somewhere" affordance on a card uses this exact treatment — same glyph, same
size, same corner. If a card's content would collide with it, reserve bottom
padding on the card rather than moving the arrow.

**Link hover.**
- On dark surfaces: color → `--accent` (coral). This is the site-wide default.
- On the coral card (coral-on-coral impossible): white text + `text-decoration:
  underline` with `text-underline-offset: 3px`.
- Resting link text on a colored card starts bright (`rgba(var(--white-rgb), .92)`
  or `--text-light`), not muted, so hover is a small step and not a jump.

**No layout shift on hover.** Use `box-shadow` spread for highlight pills, never
padding/border/size changes. Card lift is `translateY(-4px)` + a deeper shadow.

**Reserve space for images.** `<img>` carries `width`/`height` (the blog generator
emits them from `sharp` metadata) paired with `width:100%; height:auto` in CSS.
Responsive *and* CLS-stable.

---

## Layout

- Homepage is a **bento grid**; cards are self-contained and each states one idea.
- **Cap and center long-form content.** Text must never sprawl the full width of a
  maximized window. Established caps: article column `720px`, KevinOS profile grid
  `720px`, KevinOS experience list `760px`, blog index `1040px` — all
  `margin-inline: auto`.
- **When content wraps to its own row, center it.** Use `flex-wrap` with a
  sensible `flex-basis` (e.g. text `flex: 1 1 260px`) so a narrow container stacks
  gracefully instead of crushing a column. This matters inside KevinOS windows,
  which are narrow *within* a wide viewport — so viewport media queries do not
  fire. Prefer container-relative solutions (flex-wrap, caps) over `@media`.
- Wide content (tables, code, diagrams) scrolls inside its own container; the page
  body never scrolls horizontally.

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
- The homepage, KevinOS, and the blog share tokens but are *not* meant to look
  identical. Respect each surface's mode.
- Images: JPEG for anything that doubles as `og:image` (universal social-scraper
  support). WebP only for inline images that need alpha. Never ship multi-MB PNGs.
- Accessibility: every image has `alt`; one `<h1>` per page; windows in KevinOS are
  non-modal `role="dialog"` (multi-window desktop — do **not** add `aria-modal`).
