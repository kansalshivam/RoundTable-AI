# RoundTable AI Design System — Nebula Dark

## Palette

| Token | Hex | Usage |
|---|---:|---|
| **Canvas** | `#120B29` | App background — deep indigo-black |
| **Surface** | `#1B1140` | Card / panel surfaces (glassmorphism) |
| **Border** | `#2E2158` | Hairline borders, dividers |
| **Text** | `#F1EDFB` | Primary text, warm-tinted near-white |
| **Muted text** | `#A79FC4` | Secondary/muted text |
| Lavender-50 | `#34235E` | Brightest accent surface on dark canvas |
| Lavender-100 | `#2C1E52` | Elevated card fills |
| Lavender-200 | `#241947` | Subtle borders |
| Lavender-300 | `#3A2A73` | Hover fills, secondary chips |
| Lavender-400 | `#6446B0` | Icon accents, muted interactive |
| **Lavender-500** | `#9678E3` | **Primary accent** (buttons, links, focus rings) |
| **Lavender-600** | `#B49BEE` | Primary hover / active state |
| Lavender-700 | `#C7B6F5` | Text-on-dark deep accents |
| **Lavender-800** | `#E7DFFC` | Headings on dark, high-contrast |
| Lavender-900 | `#FAF8FF` | Max-contrast accent text |
| **Mint** | `#3DE0C0` | Success / positive accent |
| **Peach** | `#FF8A5B` | Warning / highlight accent |
| **Sky** | `#4FA8FF` | Info states accent |

## Design Intent

**Overall mood:** Immersive, futuristic, premium — "glowing neon through deep space glass."

**Realism directive:** Multi-layered shadows, grain/noise texture overlays, glassmorphism (backdrop-filter blur + saturate), spring-based motion physics, specular highlights on glass edges.

## Elevation & Shadows

| Token | Value |
|---|---|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.30)` |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.40), 0 2px 4px rgba(0,0,0,0.25)` |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.50), 0 4px 8px rgba(0,0,0,0.30)` |
| `--shadow-glow-lavender` | `0 0 40px rgba(150,120,227,0.45)` |
| `--shadow-inset-soft` | `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.30)` |

## Library-to-Screen Assignment

| Library / pattern | Screen or component | Why |
|---|---|---|
| Tailwind v4 + CSS tokens | Base layout, cards, buttons, forms | CSS-first config, consistent dark glassmorphism |
| Motion (`motion/react`) v12 | Step tracker, checkbox, hover preview, dashboard tilt, scorecards, page transitions | Spring physics (`stiffness: 300, damping: 30`) |
| Anime.js v3 | Scorecard rubric entrance only | Dedicated synchronized timeline |
| GSAP + ScrollTrigger | Available for scroll-scrubbed/pinned sections | Heavy timeline sequences |
| Lenis | Smooth inertia scrolling (available sitewide) | Buttery scroll feel |
| `@phosphor-icons/react` | All static icons sitewide | Single standardized MIT icon system |
| Base UI Tabs | Record/upload mode switch | Accessible headless tabs |
| Interactive grid pattern | Login background | Pointer-responsive grid reveal |
| Aurora mesh + noise overlay | Shell-level atmosphere | Deep indigo/violet/mint nebula glow |
| SpotlightCard / cursor glow | Cards and focused surfaces | Pointer-responsive lavender emphasis |
| Hover audio preview | Speaker mapping cards | Auto-play on hover with fade volume |
| React Scroll Parallax | Available for parallax depth | Section depth effects |
| React Spring | Physics micro-interactions | Complementary to Motion |

## Typography Scale

| Role | Size / line-height | Weight |
|---|---|---|
| Page title | `30-44px / 1.05` | 800 |
| Section title | `25-34px / 1.12` | 800 |
| Card title | `20px / 1.25` | 760 |
| Body | `14-16px / 1.55` | 400-650 |
| Label / meta | `11-13px / 1.2` | 800 |

## Motion Rules

- **Primary easing:** Spring physics (`type: "spring", stiffness: 300, damping: 30`)
- **Stagger children:** 40–80ms delay between card/list item entrances
- **Hover transitions:** Spring-based translateY(-1px) + scale(1.01) + glow shadow
- **Reduced motion:** `prefers-reduced-motion` disables all decorative animation, login grid motion, galaxy/tilt movement, and scorecard entrance choreography
- **Convention:** Motion for React component animation, GSAP for scroll-scrubbed timelines, anime.js for lightweight one-off flourishes

## Accessibility

- **Focus rings:** `outline: 2px solid var(--color-lavender-500)` with `box-shadow: 0 0 0 4px rgba(150,120,227,0.25)`
- **Contrast:** All text/background pairings meet WCAG AA (4.5:1 body, 3:1 large text)
- **Cursor effects:** Desktop only, graceful no-op on touch devices
- **Reduced motion:** All animations have instant/opacity-only fallbacks
