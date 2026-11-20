<div align="center">

# SUGR® — Streetwear E-Commerce Landing

### *Brutalist Design meets High-Conversion UX.*

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Vercel](https://img.shields.io/badge/Deployed_on_Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com)

### [🔗 Live Demo → sugar-landing.vercel.app](https://sugar-landing.vercel.app)

*A one-page, zero-dependency storefront built to sell a drop — and to prove that premium design and raw performance are not a trade-off.*

</div>

---

## 📑 Table of Contents

- [🎯 About the Project](#-about-the-project)
- [✨ Key Features](#-key-features)
- [🛠️ Tech Stack](#-tech-stack)
- [📂 Project Structure](#-project-structure)
- [⚡ Performance & Accessibility](#-performance--accessibility)
- [🧩 Design System](#-design-system)
- [🚀 Getting Started](#-getting-started)
- [☁️ Deployment](#-deployment)
- [📈 Why It Converts](#-why-it-converts)
- [🗺️ Roadmap](#-roadmap)
- [📄 License & Credits](#-license--credits)

---

## 🎯 About the Project

**SUGR®** is a premium streetwear label built on authenticity: *"Born in the block."* This landing page is not a generic template with a logo dropped on top — it is a brand artefact designed to make the visitor **feel the street before they see the price**.

The visual language is **Neo-Brutalism**: raw 1px borders, oversized **Unbounded** typography, outlined headline text, full-bleed monochrome photography and a single neon-pink accent (`#FF0099`) used with surgical restraint. Nothing is soft, nothing is rounded, nothing is decorative for the sake of it.

Underneath that aggressive surface lives a **conversion-first e-commerce UX**: thumb-reachable navigation, preselected sizes, a single-tap *Quick Add* flow and instant feedback on every action. The result is a storefront that reads like an editorial, behaves like a native app, and loads like a static page.

> **The challenge:** deliver a drop-ready storefront for a fashion brand with zero backend, zero build pipeline and zero framework overhead — without sacrificing the product interactions modern shoppers expect.
>
> **The approach:** semantic HTML as the foundation, utility-first CSS for speed of iteration, hand-written CSS for motion and layout, and ~120 lines of vanilla JS for the commerce logic.

---

## ✨ Key Features

- ✅ **Asymmetric CSS Grid** — A 12-column layout (`grid-template-columns: repeat(12, 1fr)`) where the hero product spans 7 columns and 2 rows while the remaining drops stack at 5 columns. The result is a dynamic, editorial product grid instead of yet another uniform card wall.
- ✅ **E-Commerce UX** — Interactive size selector (`aria-pressed` state synced with the active class) and a *Quick Add* button that confirms the exact product **and** size in a live Toast notification — no page reload, no dead-end click.
- ✅ **Next Drop / Waitlist Section** — A second, uniform 4-up grid (`.next-drop-grid`) for the upcoming collection, with neon `COMING SOON` badges and non-destructive *Notify Me* buttons that confirm with a 2-second `REGISTERED ✓` state. Collapses to 2 columns on tablet and 1 column on mobile.
- ✅ **Scroll-Snap Lookbook** — Full-bleed horizontal gallery using `scroll-snap-type: x mandatory` + `scroll-snap-align: center`, with a hidden scrollbar for a native-app feel on touch devices.
- ✅ **Mobile-First Navigation** — Fixed bottom navigation bar on mobile (`≤ 768px`), engineered around the thumb-zone and padded with `env(safe-area-inset-bottom)` so it never collides with iOS gesture bars.
- ✅ **Performance Optimized** — WebP assets, `fetchpriority="high"` + `loading="eager"` on the LCP hero image, and `loading="lazy"` + `decoding="async"` on everything below the fold.
- ✅ **Zero Bloat** — 100% Vanilla JS (no jQuery, no React) and Tailwind CSS via CDN. No `npm install`, no bundler, no hydration cost.
- ✅ **Progressive Enhancement** — The page is fully readable without JavaScript thanks to a `<noscript>` fallback that reveals every `.fade-in` element; commerce interactions simply layer on top.
- ✅ **Motion That Respects Users** — Scroll reveals use `IntersectionObserver`, and the entire motion layer is disabled under `prefers-reduced-motion: reduce`, both in CSS and in JS.
- ✅ **Brutalist Micro-Details** — Infinite CSS-only marquees (top ticker + oversized bottom marquee), grayscale-to-color image hover, outlined display type via `-webkit-text-stroke`, and custom inline SVG logotype.

---

## 🛠️ Tech Stack

| Technology | Role in this project |
| :--- | :--- |
| **HTML5** | Semantic structure and accessibility: `<nav>`, `<main>`, `<section>`, `<footer>`, plus ARIA labels, `aria-live` and `aria-pressed` states. |
| **Tailwind CSS** | Utility-first styling (CDN build) for rapid iteration on spacing, responsive utilities and small state styles. |
| **Custom CSS** | The design layer: brutalist borders, marquees, image filters, `clamp()` fluid type, scroll-snap and all motion. |
| **Vanilla JS** | Intersection Observer reveals, size selector state, Quick Add + Toast logic and mobile nav state — no dependencies. |
| **Vercel** | Deploy, CI/CD on every push to `main`, and global edge hosting. |
| **Unbounded** | Display typeface (Google Fonts, weights 300/500/700/900) that carries the entire brand voice. |

**Deliberately absent:** React, Vue, GSAP, jQuery, CSS-in-JS, a bundler and a `node_modules` folder. Every kilobyte in this repo earns its place.

---

## 📂 Project Structure

```text
sugar-landing/
├── index.html          # Estructura semántica principal
├── css/
│   └── styles.css      # Estilos personalizados y animaciones
├── js/
│   └── script.js       # Lógica de UI, Observer y E-commerce
├── assets/
│   └── images/         # Assets optimizados (WebP/JPG/PNG)
│       ├── hero-bg.webp        # LCP image (fetchpriority="high")
│       ├── bleed-block.webp    # "Born in the block" full-bleed overlay
│       ├── lookbook-01.webp    # Lookbook slide 01
│       ├── lookbook-02.jpg     # Lookbook slide 02
│       ├── lookbook-03.webp    # Lookbook slide 03
│       ├── tee-black.png       # Product: Heavyweight Tee / Black
│       ├── tee-sage.png        # Product: Logo Tee / Sage
│       └── tee-flamingo.png    # Product: Graphic Tee / Flamingo
└── README.md           # You are here
```

No transpilation, no minification step, no config archaeology: what you clone is what ships.

> ⚠️ **Next Drop assets:** the four products in `#next-drop` currently point to temporary Unsplash URLs. Replace them with `assets/images/next-01.webp` … `next-04.webp` before the final deploy (the `TODO` comment in `index.html` marks the exact spot).

---

## ⚡ Performance & Accessibility

Performance and accessibility were treated as **design constraints**, not as a post-launch audit.

### ⚡ Performance decisions

- WebP for photographic assets (`hero-bg`, `bleed-block`, lookbook slides), with transparent PNGs kept only where the product cut-out requires an alpha channel.
- The hero image — the LCP element — is the only image loaded eagerly, and it carries `fetchpriority="high"`.
- Everything below the fold uses `loading="lazy"` + `decoding="async"` so the first paint is never blocked.
- All animations are CSS-only (`transform`/`opacity`) with `will-change` hints on the marquees.
- No JS framework, no hydration, no blocking bundle: the entire interaction layer is ~120 lines.
- Fluid typography via `clamp()` removes the need for dozens of media-query font overrides.

### ♿ Accessibility decisions

- Semantic landmarks (`<nav>`, `<main>`, `<section>`, `<footer>`) and descriptive `alt` text on every image.
- `role="status"` + `aria-live="polite"` on the cart Toast, so screen readers announce additions.
- `aria-pressed` kept in sync with the active size button.
- `aria-current` set on the active mobile nav item.
- Decorative marquees hidden from assistive tech (`aria-hidden="true"`).
- `prefers-reduced-motion` honoured in CSS **and** JS (reveals show instantly).
- `<noscript>` fallback guarantees content is visible without JavaScript.
- `env(safe-area-inset-bottom)` keeps the bottom nav clear of device gesture areas.

> 💡 Run `Lighthouse` against the live demo to verify the current scores — this project intentionally avoids third-party scripts, so the budget stays predictable.

---

## 🧩 Design System

Every visual decision is driven by a small, documented set of tokens in `css/styles.css`:

| Token | Value | Applied to |
| :--- | :--- | :--- |
| `--bg` | `#0A0A0A` | Page canvas — near-black, never pure `#000` for body copy comfort |
| `--text` | `#F4F4F5` | Primary type, 1px borders, SVG logotype |
| `--accent` | `#FF0099` | Neon pink: active states, CTAs, ticker, scarcity and waitlist signals |
| `--muted` | `#666666` | Secondary metadata, inactive nav items |
| `--line` | `rgba(255,255,255,0.1)` | The brutalist hairline grid that holds the layout together |
| Display font | `Unbounded` 300–900 | Headlines, prices, buttons, labels |
| Type scale | `clamp(2rem, 13vw, 16rem)` | Hero headline that scales without breakpoints |

---

## 🚀 Getting Started

No installation. No build. No package manager.

```bash
# 1. Clone the repository
git clone https://github.com/esantos1978-sudo/sugar-landing.git
cd sugar-landing

# 2. Serve it locally (any static server works)
python -m http.server 8000
```

Then open **http://localhost:8000**.

> **Requirements:** a modern browser and an internet connection (Tailwind's CDN build and Google Fonts are loaded remotely). Opening `index.html` directly with `file://` also works for preview.

---

## ☁️ Deployment

The site is hosted on **Vercel** with continuous deployment from `main`:

1. Import the repository into Vercel.
2. **Framework preset:** `Other`.
3. **Build command:** none — leave empty.
4. **Output directory:** repository root.
5. Deploy. Every push triggers a new production build; every pull request gets a preview URL.

Because the output is static, any host (Netlify, Cloudflare Pages, GitHub Pages, S3) would work with zero changes.

---

## 📈 Why It Converts

Design is only valuable when it moves a business metric. These are the deliberate conversion decisions baked into the page:

| Decision | What it solves | Where it lives |
| :--- | :--- | :--- |
| **Preselected size** on every product | Removes a mandatory choice before purchase | `.size-btn.active` |
| **Quick Add** with inline confirmation | A single tap from interest to bag — no product page detour | `js/script.js` |
| **Contextual Toast** (`PRODUCT (SIZE) ADDED TO BAG`) | Instant, unambiguous feedback, announced to screen readers | `#cart-toast` |
| **Thumb-zone bottom nav** | Mobile users never stretch to reach navigation | `.mobile-bottom-nav` |
| **Featured product with neon border + `EDITION 100`** | Creates a visual hierarchy and a focal point in the grid | `.product-item:nth-child(3)` |
| **Scarcity messaging** (`NO RESTOCKS`, `0 Restocks`) | Frames the drop as time-sensitive and limited | Ticker / manifesto stats |
| **Quality proof** (`320 GSM`, `GARMENT DYED`, `100% Organic Cotton`) | Justifies premium pricing at a glance | Product badges / stats |
| **Editorial motion** (scroll reveals, marquees) | Guides the eye through the story without a single carousel plugin | `.fade-in`, `IntersectionObserver` |

The page tells a story in a fixed order — **identity → origins → product → next drop → manifesto → social proof** — so the visitor is emotionally primed before seeing a price.

---

## 🗺️ Roadmap

The current build is a complete, conversion-oriented front end on purpose: it validates the brand and the flow before any commerce backend exists. Natural next phases:

- [ ] **Cart drawer + persistence** — promote the existing Toast into a real bag using `localStorage`.
- [ ] **Checkout integration** — Stripe Checkout or Shopify Buy Button, wired to the existing product cards.
- [ ] **Size guide** — accessible modal (`<dialog>`) triggered from each size selector.
- [ ] **Waitlist backend** — persist *Notify Me* signups (email + ESP/webhook) instead of the local 2-second confirmation state.
- [ ] **Content layer** — move products to Markdown/JSON or a headless CMS so drops ship without touching markup.
- [ ] **Production CSS build** — compile Tailwind with the CLI and purge unused utilities to replace the CDN runtime.
- [ ] **Analytics & events** — instrument `quick_add`, size changes and lookbook engagement.
- [ ] **Social preview** — Open Graph image, favicon set and `sitemap.xml`.

---

## 📄 License & Credits

- **Design & development:** crafted as a public case study for an automation & web development agency.
- **Brand, copy & product photography:** © 2026 **SUGR®**. All rights reserved.
- **Code:** published for review and portfolio purposes. No license is granted for commercial reuse of the SUGR® brand identity or its assets.

---

<div align="center">

### Built with intent. Shipped without bloat.

**Need a storefront like this for your brand?**
Let's turn your drop into a conversion machine.

[![Live Demo](https://img.shields.io/badge/View_Live_Site-FF0099?style=for-the-badge&logo=vercel&logoColor=black)](https://sugar-landing.vercel.app)
[![GitHub](https://img.shields.io/badge/Source_Code-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/esantos1978-sudo/sugar-landing)

<sub>SUGR® — Streetwear E-Commerce Landing · Neo-Brutalism meets high-conversion UX.</sub>

</div>
