---
version: "1.0"
name: "Gong Brand System"
description: "Brand design system for Gong revenue AI platform. Used for interview presentations and collateral."

colors:
  # Primary
  purple-haze: "#3E0075"
  violet: "#8039DF"
  lavender: "#997CED"

  # Secondary
  bright-fuschia: "#FF2370"
  bright-green: "#4CFEC8"
  bright-sky: "#3CAFF2"
  bright-yellow: "#FFE03F"

  # Neutrals
  text-gray: "#36333A"
  blue-gray: "#EEF4FE"
  white: "#FFFFFF"

  # Semantic mappings
  primary: "#3E0075"
  secondary: "#8039DF"
  accent: "#997CED"
  surface: "#FFFFFF"
  surface-alt: "#EEF4FE"
  on-primary: "#FFFFFF"
  on-surface: "#36333A"
  on-surface-alt: "#3E0075"
  error: "#FF2370"
  success: "#4CFEC8"
  info: "#3CAFF2"
  warning: "#FFE03F"

typography:
  display-lg:
    fontFamily: "BN Axel Grotesk"
    fontSize: "80px"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: "-1%"
    textTransform: "uppercase"
    usage: "Logo font. Use very rarely. ALL CAPS only. Short phrases, sub-brand names."

  display-md:
    fontFamily: "BN Axel Grotesk"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: "-1%"
    textTransform: "uppercase"
    usage: "Mobile display. ALL CAPS only."

  headline-lg:
    fontFamily: "Inter"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-3%"

  headline-md:
    fontFamily: "Inter"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-3%"

  headline-sm:
    fontFamily: "Inter"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-3%"

  title-lg:
    fontFamily: "Inter"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-1%"

  title-md:
    fontFamily: "Inter"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-1%"

  subtitle:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-2%"
    color: "{colors.violet}"

  eyebrow:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: "20px"
    letterSpacing: "+5%"
    textTransform: "uppercase"

  body-lg:
    fontFamily: "Inter"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.5

  body-md:
    fontFamily: "Inter"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5

  label-lg:
    fontFamily: "Inter"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.4

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  xxxl: "64px"

rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"

components:
  slide-title:
    fontFamily: "{typography.title-lg}"
    color: "{colors.purple-haze}"
    usage: "Title case for short titles. Sentence case for full sentences."

  slide-subtitle:
    fontFamily: "{typography.subtitle}"
    color: "{colors.violet}"

  slide-body:
    fontFamily: "{typography.body-md}"
    color: "{colors.text-gray}"

  slide-eyebrow:
    fontFamily: "{typography.eyebrow}"
    color: "{colors.violet}"
    textTransform: "uppercase"

  emphasis-word:
    color: "{colors.violet}"
    usage: "Highlight one word or short phrase in a title. Never highlight too much."

  card:
    backgroundColor: "{colors.blue-gray}"
    padding: "{spacing.lg}"
    rounded: "{rounded.lg}"

  card-accent:
    backgroundColor: "{colors.violet}"
    padding: "{spacing.lg}"
    rounded: "{rounded.lg}"
    textColor: "{colors.white}"
---

# Gong Brand Design System

## Overview

Gong's visual brand is **bold, energetic, confident, relatable, and trustworthy**. The brand identity centers on a vibrant burst of energy and positivity, with the logo symbolizing celebration, conversation, and individuality.

Three core visual principles guide all design:

1. **Easy to Read** -- Bright and energetic, not dark and dreary. Light backgrounds preferred. Sufficient color contrast always.
2. **Easy to Understand** -- Makes noise but never at the expense of comprehension. Prioritize clarity. Logical color choices (don't use red for positive, green for negative).
3. **Easy to Remember** -- Simple over complex. Pare things down to their essence. Prioritize takeaways. Bite-sized chunks with clear takeaways.

## Colors

### Primary Palette

**Purple Haze** (`#3E0075`) is the dominant brand color. Used for backgrounds, titles, and graphics. This is Gong's signature deep purple.

**Violet** (`#8039DF`) is the primary accent. Used for subtitles, emphasis text within titles, accent elements, and backgrounds. The burst symbol in the logo uses this color.

**Lavender** (`#997CED`) is a lighter accent. Used sparingly for accent elements, backgrounds, and occasionally text.

### Secondary Palette

Secondary colors are NOT used for text (hard to read). They serve as accents and graphic elements only.

**Bright Fuschia** (`#FF2370`) -- Accents and as a substitute for red on graphs to signify decrease, loss, or error. Never use actual red.

**Bright Green** (`#4CFEC8`) -- Accent color for graphics or button backgrounds. Use for positive/increase signals in data visualization.

**Bright Sky** (`#3CAFF2`) -- Accent color for graphics or button backgrounds.

**Bright Yellow** (`#FFE03F`) -- Accent color for graphics or button backgrounds.

### Neutrals

**Text Gray** (`#36333A`) -- Body copy. The default text color on light backgrounds.

**Blue Gray** (`#EEF4FE`) -- Backgrounds. A cool, light wash that provides subtle contrast against white.

### Color Usage Rules

- Prefer light backgrounds over dark. The brand is bright and energetic, not moody.
- Text on dark backgrounds should be white (`#FFFFFF`).
- On white/light backgrounds, titles use Purple Haze, subtitles use Violet, body uses Text Gray.
- For data visualization: use Bright Fuschia for negative/decrease (never red), Bright Green for positive/increase, Bright Sky and Bright Yellow for neutral categories.
- Color choices in charts and graphs must be logical. If something is positive, it should look positive.

## Typography

### Logo Font: BN Axel Grotesk

Used very rarely. ALL CAPS only. Reserved for cover slides, sub-brand names, and high-impact single phrases. Never use for long sentences (5+ lines dilutes impact). Any usage likely involves the Gong Creative Team.

### Primary Font: Inter

The workhorse font for all content.

- **Titles**: Inter Bold. Use title case for short titles, sentence case for longer titles that are complete sentences.
- **Subtitles/Subheadings**: Inter Medium, colored in Violet (`#8039DF`).
- **Secondary headers**: Inter Bold, for section headings within a slide.
- **Body copy**: Inter Regular, colored in Text Gray (`#36333A`).
- **Eyebrows**: Inter Bold, 14px, ALL CAPS, +5% letter spacing. Colored in Violet.

### Title Rules

- Strong titles are short. Add context via subtitles.
- Use title case for actual titles. Sentence case for longer descriptive titles.
- Emphasize single words or short phrases in Violet (`#8039DF`). Never highlight too much.
- Don't use both a subhead and an eyebrow on the same element. Pick one.

## Layout

### Spacing Strategy

Use generous whitespace. The brand should feel open and breathable, not cramped. Allow ample spacing around key elements (especially logos and hero text) for resonance and emphasis.

### Slide Design

- Prefer light backgrounds (white or Blue Gray `#EEF4FE`).
- Dark backgrounds (Purple Haze) are acceptable for cover slides and high-impact moments but should not be used on consecutive slides.
- Content should be pared down to essentials. If a slide feels busy, remove elements.
- Text must have sufficient contrast against its background. Dark text on dark backgrounds is explicitly forbidden.

## Graphic Elements

### The Gong Burst

The burst is derived from the logo and is the most striking brand element. Use for covers, digital ads, and feature slides. Do NOT overuse on consecutive slides -- it makes things feel busy and overwhelming.

### Circles

Circles are a repeated theme in Gong branding. They can signify data points, draw attention to layout elements, and provide visual interest. Use them as decorative accents, chart markers, or framing devices.

## Logo

### Symbol Meaning

The Gong logo burst represents three things: celebration (vibrant energy and positivity), conversation (the visual language of dialogue), and individuality (a unique "G" symbol).

### Logo Colors

- On white: Burst in Violet (`#8039DF`), logotype in Purple Haze (`#3E0075`)
- On Purple Haze: Burst in Lavender (`#9069E7`), logotype in White
- On Violet: Burst in White, logotype in White

### Logo Rules

- Never alter the symbol size relative to the logotype
- Never change the typeface
- Never apply effects (shadows, gradients, glows)
- Never change the colors outside approved combinations
- Never outline, rotate, stretch, or reposition elements
- Never place on distracting or busy backgrounds
- Minimum height: 24px (symbol), 24px (horizontal lockup), 47px (vertical lockup)
- Maintain clear space equal to the symbol height around all sides

## Do's and Don'ts

### Do

- Use light, bright backgrounds as the default
- Keep text high-contrast and easy to read
- Use lowercase for body text (easier to scan than ALL CAPS)
- Make color choices logical (green = positive, fuschia = negative)
- Pare content down to essentials with clear takeaways
- Break material into bite-sized chunks
- Use the burst sparingly for maximum impact
- Emphasize single words in Violet for visual hierarchy

### Don't

- Use dark backgrounds for multiple consecutive slides
- Put low-contrast text on any background
- Use the logo font (BN Axel) for long sentences
- Use secondary colors (fuschia, green, sky, yellow) for text
- Use red in data visualization (use Bright Fuschia instead)
- Overuse the burst graphic
- Use both an eyebrow and a subhead on the same element
- Highlight too many words in a title
- Make slides feel busy or overwhelming

## Asset Sources

- Brand guidelines deck: https://docs.google.com/presentation/d/1Lud5iIrK6vV1YwXoRx51CvRh0-HVa8_8aYAoa2PDTT0/
- Logos and icons: https://www.lingoapp.com/112942/s/LOGOS-R8n2MQ?v=0
- Color palette: https://www.lingoapp.com/112942/s/COLORS-Rj2v29?v=0
- Fonts: https://www.lingoapp.com/112942/s/FONTS-R9mYmM?v=0
- Full brand library: gong.io/brand-site
