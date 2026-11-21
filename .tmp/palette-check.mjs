/**
 * Valida la paleta 60-30-10 (blanco / negro brutalista / fucsia) en render real.
 * Requiere: `python -m http.server 8123` + Chrome con --remote-debugging-port=9222
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8123/index.html';
const DEBUG = 'http://127.0.0.1:9222';
const OUT = path.resolve('.tmp/validation');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPageTarget() {
    for (let i = 0; i < 80; i++) {
        try {
            const res = await fetch(`${DEBUG}/json/list`);
            const targets = await res.json();
            const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
            if (page) return page;
        } catch { /* Chrome arrancando */ }
        await sleep(250);
    }
    throw new Error('No se pudo conectar al puerto de depuración de Chrome');
}

const target = await findPageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
});

let msgId = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else p.resolve(msg.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
    });
    if (exceptionDetails) {
        throw new Error(`${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`);
    }
    return result.value;
}

async function waitForLoad() {
    await new Promise((resolve) => {
        const onMsg = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.method === 'Page.loadEventFired') {
                ws.removeEventListener('message', onMsg);
                resolve();
            }
        };
        ws.addEventListener('message', onMsg);
        setTimeout(resolve, 15000);
    });
    await sleep(900);
}

async function scrollThroughPage() {
    await evaluate(`(async () => {
        const step = Math.round(window.innerHeight * 0.75);
        for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 140));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 250));
        return document.body.scrollHeight;
    })()`);
    await sleep(700);
}

async function waitForLocalImages(timeout = 25000) {
    const result = await evaluate(`(async () => {
        const deadline = Date.now() + ${timeout};
        const isLocal = (i) => {
            const src = String(i.getAttribute('src') || '');
            return src.startsWith('assets/') || src.includes('127.0.0.1:8123');
        };
        const pending = () => [...document.images].filter((i) =>
            isLocal(i) && (!i.complete || i.naturalWidth === 0));
        while (Date.now() < deadline) {
            const missing = pending();
            if (missing.length === 0) return { ok: true, total: document.images.length };
            missing.forEach((i) => { i.loading = 'eager'; i.scrollIntoView({ block: 'center' }); });
            await new Promise((r) => setTimeout(r, 300));
        }
        return { ok: false, pending: pending().map((i) => i.getAttribute('src')) };
    })()`);
    await evaluate('window.scrollTo(0, 0)');
    await sleep(400);
    return result;
}

async function screenshot(name, clip) {
    const params = { format: 'png', captureBeyondViewport: true };
    if (clip) params.clip = { ...clip, scale: 1 };
    const { data } = await send('Page.captureScreenshot', params);
    const file = path.join(OUT, name);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
}

async function hoverPoint(selector, { scroll = true } = {}) {
    const pointOf = () => evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        if (${scroll}) el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    let point = await pointOf();
    if (!point) throw new Error(`No encontrado: ${selector}`);
    await sleep(350);
    for (let attempt = 0; attempt < 4; attempt++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
        await sleep(280);
        const hovered = await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            return Boolean(el && el.matches(':hover'));
        })()`);
        if (hovered) {
            await sleep(420); /* deja terminar las transiciones de hover (0.3s) */
            return { ...point, hovered: true };
        }
        point = await pointOf();
    }
    throw new Error(`No se pudo activar :hover en ${selector}`);
}

async function unhover() {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0 });
    await sleep(600);
}

/** Propiedades computadas (nombres kebab de CSS) */
const css = (selector, props, pseudo = null) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const cs = getComputedStyle(el, ${JSON.stringify(pseudo)});
    const out = {};
    for (const p of ${JSON.stringify(props)}) out[p] = cs.getPropertyValue(p).trim();
    return out;
})()`);

const rectOf = (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
})()`);

const clipOf = (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
})()`);

/* ================= Setup ================= */
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await waitForLoad();
await scrollThroughPage();
const imagesReady = await waitForLocalImages();

const EXPECT = {
    bg: 'rgb(255, 255, 255)',
    surface: 'rgb(244, 244, 244)',
    text: 'rgb(10, 10, 10)',
    muted: 'rgb(102, 102, 102)',
    border: 'rgb(10, 10, 10)',
    borderLight: 'rgba(0, 0, 0, 0.1)',
    accent: 'rgb(255, 0, 153)',
    accentHover: 'rgb(212, 0, 127)',
    inverseText: 'rgb(250, 250, 250)',
    inverseMuted: 'rgb(161, 161, 170)',
    photoBg: 'rgb(231, 231, 230)'
};

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const eq = (a, b) => norm(a) === norm(b);
const hideToast = () => evaluate(`document.getElementById('cart-toast').style.visibility = 'hidden'`);
const showToast = () => evaluate(`document.getElementById('cart-toast').style.visibility = ''`);

/* ================= 1. Variables y base ================= */
const rootVars = await evaluate(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = ['--bg','--text','--accent','--surface','--border','--border-light','--muted','--accent-hover','--accent-contrast','--inverse-text','--inverse-muted','--photo-bg'];
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    return out;
})()`);
check(':root declara las variables de la nueva paleta',
    rootVars['--bg'].toLowerCase() === '#ffffff' &&
    rootVars['--text'].toLowerCase() === '#0a0a0a' &&
    rootVars['--accent'].toLowerCase() === '#ff0099' &&
    rootVars['--surface'].toLowerCase() === '#f4f4f4' &&
    rootVars['--border'].toLowerCase() === '#0a0a0a' &&
    rootVars['--border-light'].replace(/\s+/g, '') === 'rgba(0,0,0,0.1)',
    rootVars);

const body = await css('body', ['background-color', 'color']);
check('body: fondo blanco puro y texto negro casi puro',
    eq(body['background-color'], EXPECT.bg) && eq(body.color, EXPECT.text), body);

/* ================= 2. Ticker, nav, hero ================= */
const marquee = await css('.marquee-container', ['background-color', 'color', 'border-bottom-color']);
check('ticker superior: fucsia con texto negro y linea negra',
    eq(marquee['background-color'], EXPECT.accent) && eq(marquee.color, EXPECT.text) &&
    eq(marquee['border-bottom-color'], EXPECT.border), marquee);

const nav = await css('nav.nav-brutal', ['background-color', 'border-bottom-color']);
const navLink = await css('.nav-link', ['color']);
await hoverPoint('.nav-link');
const navLinkHover = await css('.nav-link', ['color']);
await unhover();
check('nav sobre blanco: borde negro y enlace negro -> fucsia al hover',
    norm(nav['background-color']) === 'rgba(0, 0, 0, 0)' && eq(nav['border-bottom-color'], EXPECT.border) &&
    eq(navLink.color, EXPECT.text) && eq(navLinkHover.color, EXPECT.accentHover),
    { nav, idle: navLink.color, hover: navLinkHover.color });

const navLogo = await css('nav.nav-brutal .logo-svg', ['color']);
const footerLogo = await css('footer .logo-svg', ['color']);
check('logo SVG hereda color: negro en nav, blanco en footer',
    eq(navLogo.color, EXPECT.text) && eq(footerLogo.color, EXPECT.inverseText),
    { nav: navLogo.color, footer: footerLogo.color });

const hero = await css('.hero-title', ['color']);
const heroOutline = await css('.outline-text', ['-webkit-text-stroke-color']);
const heroMeta = await css('.hero-meta', ['border-top-color']);
const heroScroll = await css('.hero-meta-scroll', ['color']);
const heroScrim = await css('.hero-image-container', ['background-color', 'content', 'pointer-events'], '::after');
check('hero: titular negro, outline negro, meta sutil y scroll en fucsia',
    eq(hero.color, EXPECT.text) && eq(heroOutline['-webkit-text-stroke-color'], EXPECT.text) &&
    eq(heroMeta['border-top-color'], EXPECT.borderLight) && eq(heroScroll.color, EXPECT.accentHover),
    { hero: hero.color, outline: heroOutline['-webkit-text-stroke-color'], meta: heroMeta['border-top-color'], scroll: heroScroll.color });
check('hero: velo blanco sobre la foto garantiza lectura del titular',
    eq(heroScrim['background-color'], 'rgba(255, 255, 255, 0.55)') && eq(heroScrim['pointer-events'], 'none'),
    heroScrim);

/* ================= 3. Grid y tarjetas ================= */
const grid = await css('#drops', ['background-color', 'border-top-color']);
const counter = await css('#drops .grid-header span:last-child', ['color']);
const cardIdle = await css('[data-product="tee-black"]', ['background-color', 'border-top-color', 'border-top-width', 'box-shadow']);
check('grid blanco separado por linea negra; contador en fucsia',
    eq(grid['background-color'], EXPECT.bg) && eq(grid['border-top-color'], EXPECT.border) &&
    eq(counter.color, EXPECT.accentHover),
    { grid, counter: counter.color });

const photoPlate = await css('[data-product="tee-black"] .product-img-wrap', ['background-color']);
check('plato de foto con el gris real del estudio (sin halo)',
    eq(photoPlate['background-color'], EXPECT.photoBg), photoPlate);

const rectIdle = await rectOf('[data-product="tee-black"]');
await hoverPoint('[data-product="tee-black"] .product-img-wrap');
const cardHover = await css('[data-product="tee-black"]', ['border-top-color', 'box-shadow']);
const rectHover = await rectOf('[data-product="tee-black"]');
await hideToast();
const hoverClip = await clipOf('[data-product="tee-black"]');
const hoverShot = await screenshot('palette-hover-card.png', {
    x: hoverClip.x - 14, y: hoverClip.y - 14, width: hoverClip.width + 28, height: hoverClip.height + 28
});
await showToast();
await unhover();
check('tarjeta en reposo: blanca con borde negro 1px y sin sombra',
    eq(cardIdle['background-color'], EXPECT.bg) && eq(cardIdle['border-top-color'], EXPECT.border) &&
    norm(cardIdle['border-top-width']) === '1px' && norm(cardIdle['box-shadow']) === 'none',
    cardIdle);
check('hover: borde fucsia + sombra dura brutalista sin reflow',
    eq(cardHover['border-top-color'], EXPECT.accent) &&
    norm(cardHover['box-shadow']) === 'rgb(255, 0, 153) 4px 4px 0px 0px' &&
    rectIdle.w === rectHover.w && rectIdle.h === rectHover.h && rectIdle.x === rectHover.x,
    { hover: cardHover, idleRect: rectIdle, hoverRect: rectHover });

const info = await css('[data-product="tee-black"] .product-info-rich', ['background-color', 'border-top-color']);
const price = await css('[data-product="tee-black"] .product-price', ['color']);
const badge = await css('[data-product="tee-black"] .product-badge', ['background-color', 'color', 'border-top-color']);
const neonBadge = await css('[data-product="tee-06"] .product-badge', ['background-color', 'color']);
check('panel de compra blanco separado por linea sutil',
    eq(info['background-color'], EXPECT.bg) && eq(info['border-top-color'], EXPECT.borderLight), info);
check('precio en fucsia legible y badges (blanco / fucsia) coherentes',
    eq(price.color, EXPECT.accentHover) &&
    eq(badge['background-color'], EXPECT.bg) && eq(badge.color, EXPECT.text) &&
    eq(badge['border-top-color'], EXPECT.border) &&
    eq(neonBadge['background-color'], EXPECT.accent) && eq(neonBadge.color, EXPECT.text),
    { price: price.color, badge, neonBadge });

const sizeIdle = await css('[data-product="tee-black"] .size-btn:not(.active)', ['background-color', 'color', 'border-top-color']);
const sizeActive = await css('[data-product="tee-black"] .size-btn.active', ['background-color', 'color', 'border-top-color']);
check('tallas: outline negro y talla activa en negro con texto blanco',
    eq(sizeIdle['background-color'], 'rgba(0, 0, 0, 0)') && eq(sizeIdle['border-top-color'], EXPECT.border) &&
    eq(sizeIdle.color, EXPECT.text) &&
    eq(sizeActive['background-color'], EXPECT.text) && eq(sizeActive.color, EXPECT.bg),
    { sizeIdle, sizeActive });

const ctaIdle = await css('[data-product="tee-black"] .quick-add-btn', ['background-color', 'color', 'border-top-color', 'border-top-width']);
await hoverPoint('[data-product="tee-black"] .quick-add-btn');
const ctaHover = await css('[data-product="tee-black"] .quick-add-btn', ['background-color', 'color', 'border-top-color']);
await unhover();
check('Quick Add: negro/texto blanco -> fucsia/texto negro al hover',
    eq(ctaIdle['background-color'], EXPECT.text) && eq(ctaIdle.color, EXPECT.bg) &&
    norm(ctaIdle['border-top-width']) === '1px' &&
    eq(ctaHover['background-color'], EXPECT.accent) && eq(ctaHover.color, EXPECT.text),
    { idle: ctaIdle, hover: ctaHover });

/* Halo: color medio del borde de cada foto vs. fondo del plato */
const seam = await evaluate(`(async () => {
    const imgs = [...document.querySelectorAll('#drops .product-img-wrap img')];
    const out = [];
    for (const img of imgs) {
        try { await img.decode(); } catch { /* ya cargada */ }
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const pts = [[2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]];
        const px = pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3));
        const avg = [0, 1, 2].map((i) => Math.round(px.reduce((a, p) => a + p[i], 0) / px.length));
        const wrap = getComputedStyle(img.closest('.product-img-wrap')).backgroundColor;
        out.push({ src: img.getAttribute('src'), avg, wrap });
    }
    return out;
})()`);
const parseRgb = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(norm(s));
    if (!m) return null;
    return m[1].split(',').slice(0, 3).map((v) => Number(v.trim()));
};
const seamReport = (seam || []).map((s) => {
    const w = parseRgb(s.wrap) || [0, 0, 0];
    const delta = Math.max(...s.avg.map((v, i) => Math.abs(v - w[i])));
    return { ...s, delta };
});
const worstSeam = seamReport.reduce((a, b) => (b.delta > a.delta ? b : a), { delta: 0 });
check('fotos integradas sin halo con el plato (delta max <= 10/255)',
    seamReport.length >= 3 && worstSeam.delta <= 10, { worst: worstSeam, all: seamReport });

/* ================= 4. Next Drop ================= */
const nextDrop = await css('#next-drop', ['background-color', 'border-top-color']);
const nextCard = await css('#next-drop .product-item', ['background-color', 'border-top-color']);
const notifyIdle = await css('.notify-btn', ['background-color', 'color', 'border-top-color']);
await hoverPoint('[data-product="next-01"] .notify-btn');
const notifyHover = await css('[data-product="next-01"] .notify-btn', ['background-color', 'color', 'border-top-color']);
const nextHoverShot = await screenshot('palette-notify-hover.png', await clipOf('[data-product="next-01"]'));
await unhover();
const sectionLabel = await css('.section-label', ['color']);
const sectionSubtitle = await css('.section-subtitle', ['color']);
const nextBadge = await css('#next-drop .neon-badge', ['background-color', 'color']);
check('Next Drop sobre blanco con tarjetas de borde negro y badges fucsia',
    eq(nextDrop['background-color'], EXPECT.bg) && eq(nextDrop['border-top-color'], EXPECT.border) &&
    eq(nextCard['background-color'], EXPECT.bg) && eq(nextCard['border-top-color'], EXPECT.border) &&
    eq(nextBadge['background-color'], EXPECT.accent) && eq(nextBadge.color, EXPECT.text),
    { nextDrop, nextCard, nextBadge });
check('Next Drop: kicker/entradilla legibles (fucsia AA + gris)',
    eq(sectionLabel.color, EXPECT.accentHover) && eq(sectionSubtitle.color, EXPECT.muted),
    { sectionLabel: sectionLabel.color, sectionSubtitle: sectionSubtitle.color });
check('Notify Me: outline negro -> relleno fucsia con texto negro',
    eq(notifyIdle['background-color'], 'rgba(0, 0, 0, 0)') && eq(notifyIdle.color, EXPECT.text) &&
    eq(notifyIdle['border-top-color'], EXPECT.border) &&
    eq(notifyHover['background-color'], EXPECT.accent) && eq(notifyHover.color, EXPECT.text) &&
    eq(notifyHover['border-top-color'], EXPECT.accent),
    { idle: notifyIdle, hover: notifyHover });

/* ================= 5. Manifesto / Bleed / Lookbook ================= */
const manifesto = await css('#manifesto', ['background-color', 'border-top-color']);
const manifestoTxt = await css('.manifesto-p', ['color']);
const manifestoNeon = await css('.manifesto-neon', ['color']);
const manifestoTitle = await css('.manifesto-title', ['color']);
const statLabel = await css('.stat-label', ['color']);
const statNum = await css('.stat-num', ['color']);
const statsLine = await css('.manifesto-stats', ['border-top-color']);
check('manifesto: superficie #f4f4f4 con linea negra y tipografia negra',
    eq(manifesto['background-color'], EXPECT.surface) && eq(manifesto['border-top-color'], EXPECT.border) &&
    eq(manifestoTitle.color, EXPECT.text) && eq(statNum.color, EXPECT.text),
    { manifesto, manifestoTitle, statNum });
check('manifesto: texto secundario gris AA y acento fucsia legible',
    eq(manifestoTxt.color, EXPECT.muted) && eq(manifestoNeon.color, EXPECT.accentHover) &&
    eq(statLabel.color, EXPECT.muted) && eq(statsLine['border-top-color'], EXPECT.borderLight),
    { body: manifestoTxt.color, neon: manifestoNeon.color, label: statLabel.color, line: statsLine['border-top-color'] });

const bleedTitle = await css('.bleed-title', ['color']);
const bleedOutline = await css('.bleed-outline', ['-webkit-text-stroke-color']);
const bleedSub = await css('.bleed-subtitle', ['color']);
const bleedLabel = await css('.bleed-label', ['color']);
const bleedImgFilter = await css('.bleed-bg img', ['filter']);
check('Bleed: titular claro + foto oscurecida (BORN IN THE BLOCK legible)',
    eq(bleedTitle.color, EXPECT.inverseText) && eq(bleedOutline['-webkit-text-stroke-color'], EXPECT.inverseText) &&
    eq(bleedSub.color, EXPECT.inverseMuted) && eq(bleedLabel.color, EXPECT.accent) &&
    /brightness\((0\.[0-4]\d*)\)/.test(norm(bleedImgFilter.filter)),
    { title: bleedTitle.color, outline: bleedOutline['-webkit-text-stroke-color'], sub: bleedSub.color, filter: bleedImgFilter });

const look = await css('#lookbook', ['background-color', 'border-top-color']);
const lookLabel = await css('.lookbook-label', ['color']);
const lookCaption = await css('.lookbook-caption', ['color']);
const lookIndex = await css('.lookbook-caption span', ['color']);
check('lookbook blanco: titulo negro, kicker y numeros fucsia, pie gris',
    eq(look['background-color'], EXPECT.bg) && eq(look['border-top-color'], EXPECT.border) &&
    eq(lookLabel.color, EXPECT.accentHover) && eq(lookCaption.color, EXPECT.muted) &&
    eq(lookIndex.color, EXPECT.accentHover),
    { look, lookLabel: lookLabel.color, lookCaption: lookCaption.color, lookIndex: lookIndex.color });

/* ================= 6. Footer, toast y marquee inferior ================= */
const footer = await css('footer', ['background-color', 'color']);
const footerText = await css('.footer-text', ['color']);
const footerLink = await css('.footer-links a', ['color']);
await hoverPoint('.footer-links a');
const footerLinkHover = await css('.footer-links a', ['color']);
await unhover();
check('footer negro: peso visual del 30% y texto claro legible',
    eq(footer['background-color'], EXPECT.text) && eq(footer.color, EXPECT.inverseText) &&
    eq(footerText.color, EXPECT.inverseMuted) && eq(footerLink.color, EXPECT.inverseText) &&
    eq(footerLinkHover.color, EXPECT.accent),
    { footer, footerText: footerText.color, link: footerLink.color, hover: footerLinkHover.color });

const toastRest = await evaluate(`(() => {
    const el = document.getElementById('cart-toast');
    const r = el.getBoundingClientRect();
    return {
        hasVisibleClass: el.classList.contains('visible'),
        top: Math.round(r.top),
        viewportHeight: window.innerHeight,
        translate: getComputedStyle(el).transform
    };
})()`);
check('toast oculto en reposo (debajo del viewport, sin clase visible)',
    !toastRest.hasVisibleClass && toastRest.top >= toastRest.viewportHeight - 1, toastRest);

await evaluate(`document.getElementById('cart-toast').classList.add('visible')`);
await sleep(650);
const toast = await css('#cart-toast', ['background-color', 'color', 'border-top-color', 'box-shadow']);
const toastShot = await screenshot('palette-toast.png', await clipOf('#cart-toast'));
await evaluate(`document.getElementById('cart-toast').classList.remove('visible')`);
await sleep(500);
check('toast negro con borde fucsia y texto claro (contraste alto)',
    eq(toast['background-color'], EXPECT.text) && eq(toast.color, EXPECT.inverseText) &&
    eq(toast['border-top-color'], EXPECT.accent), toast);

const bottomMarquee = await css('.bottom-marquee', ['border-top-color', 'border-bottom-color']);
const marqueeText = await css('.marquee-text', ['color']);
check('marquee inferior: texto negro entre dos lineas negras',
    eq(bottomMarquee['border-top-color'], EXPECT.border) && eq(bottomMarquee['border-bottom-color'], EXPECT.border) &&
    eq(marqueeText.color, EXPECT.text), { bottomMarquee, marqueeText: marqueeText.color });

/* ================= 7. Contraste WCAG ================= */
const toRgb = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(norm(s));
    return m ? m[1].split(',').slice(0, 3).map((v) => Number(v.trim())) : null;
};
const chan = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (rgb) => 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
const ratio = (a, b) => {
    const l1 = lum(toRgb(a));
    const l2 = lum(toRgb(b));
    return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2));
};
const pairs = [
    ['texto negro / blanco', EXPECT.text, EXPECT.bg, 12],
    ['texto secundario #666 / blanco', EXPECT.muted, EXPECT.bg, 4.5],
    ['texto secundario #666 / #f4f4f4', EXPECT.muted, EXPECT.surface, 4.5],
    ['fucsia #d4007f / blanco', EXPECT.accentHover, EXPECT.bg, 4.5],
    ['fucsia #d4007f / #f4f4f4', EXPECT.accentHover, EXPECT.surface, 4.5],
    ['negro sobre fucsia (CTA hover)', EXPECT.text, EXPECT.accent, 4.5],
    ['blanco sobre negro (CTA)', EXPECT.bg, EXPECT.text, 4.5],
    ['blanco sobre negro (footer)', EXPECT.inverseText, EXPECT.text, 4.5],
    ['#a1a1aa sobre negro (footer meta)', EXPECT.inverseMuted, EXPECT.text, 4.5],
    ['fucsia #ff0099 sobre negro (footer hover)', EXPECT.accent, EXPECT.text, 4.5]
];
const contrastReport = pairs.map(([name, fg, bg, min]) => ({ name, ratio: ratio(fg, bg), min }));
const failingPairs = contrastReport.filter((p) => p.ratio < p.min);
check('contraste AA en todos los pares de texto de la paleta',
    failingPairs.length === 0, { failing: failingPairs, all: contrastReport });

/* ================= 8. Capturas desktop ================= */
await evaluate('window.scrollTo(0, 0)');
await sleep(400);
await hideToast();
const topShot = await screenshot('palette-topnav.png', { x: 0, y: 0, width: 1600, height: 320 });
const heroShot = await screenshot('palette-hero.png', await clipOf('.hero-brutal'));
const gridShot = await screenshot('palette-grid.png', await clipOf('#drops'));
const nextShot = await screenshot('palette-next-drop.png', await clipOf('#next-drop'));
const manifestoShot = await screenshot('palette-manifesto.png', await clipOf('#manifesto'));
const lookbookShot = await screenshot('palette-lookbook.png', await clipOf('#lookbook'));
const footerShot = await screenshot('palette-footer.png', await clipOf('footer'));
const bleedShot = await screenshot('palette-bleed.png', await clipOf('.bleed-overlay'));
const fullShot = await screenshot('palette-full.png', {
    x: 0, y: 0, width: 1600, height: Math.min(await evaluate('document.body.scrollHeight'), 12000)
});
await showToast();

const desktopOverflow = await evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))()`);
check('desktop 1600px sin scroll horizontal', !desktopOverflow.overflow, desktopOverflow);

/* ================= 9. Movil 390px ================= */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
await waitForLoad();
await scrollThroughPage();
await waitForLocalImages(15000);
await evaluate('window.scrollTo(0, 0)');
await sleep(500);
await hideToast();

const mobileOverflow = await evaluate(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))()`);
check('movil 390px sin scroll horizontal', !mobileOverflow.overflow, mobileOverflow);

const bottomNav = await css('.mobile-bottom-nav', ['display', 'background-color', 'border-top-color']);
const bottomNavIdle = await css('.mobile-bottom-nav .nav-item:not(.active)', ['color']);
const bottomNavActive = await css('.mobile-bottom-nav .nav-item.active', ['color']);
check('bottom nav movil: fondo blanco puro, linea negra, iconos negros y activo fucsia',
    norm(bottomNav.display) === 'flex' && eq(bottomNav['border-top-color'], EXPECT.border) &&
    norm(bottomNav['background-color']) === 'rgb(255, 255, 255)' &&
    eq(bottomNavIdle.color, EXPECT.text) && eq(bottomNavActive.color, EXPECT.accentHover),
    { bottomNav, idle: bottomNavIdle.color, active: bottomNavActive.color });

const mobileScrim = await css('.hero-image-container', ['background-color'], '::after');
const mobileHeroTitle = await css('.hero-title', ['color']);
check('movil: titular negro y velo mas ligero sobre la foto',
    eq(mobileHeroTitle.color, EXPECT.text) && eq(mobileScrim['background-color'], 'rgba(255, 255, 255, 0.35)'),
    { title: mobileHeroTitle.color, scrim: mobileScrim['background-color'] });

const mobileHeroShot = await screenshot('palette-mobile-hero.png', await clipOf('.hero-brutal'));
const mobileCardShot = await screenshot('palette-mobile-card.png', await clipOf('[data-product="tee-black"]'));
const mobileGridShot = await screenshot('palette-mobile-grid.png', await clipOf('#drops'));
await evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
await sleep(700);
const mobileFootShot = await screenshot('palette-mobile-footer.png');

/* ================= 10. Informe ================= */
const failed = checks.filter((c) => !c.ok);
const report = {
    generatedAt: new Date().toISOString(),
    viewport: '1600x1000 + 390x844',
    images: imagesReady,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
    contrast: contrastReport,
    photoSeam: seamReport,
    artifacts: OUT
};
writeFileSync(path.join(OUT, 'palette-report.json'), JSON.stringify(report, null, 2));

console.log('\n=== PALETA 60-30-10 / BRUTALISTA — VALIDACION ===');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
if (failed.length) {
    console.log('\n--- Detalle de fallos ---');
    for (const f of failed) console.log(`\n${f.name}\n${JSON.stringify(f.detail, null, 2)}`);
}
console.log('\nContraste (AA >= 4.5, texto grande >= 3):');
for (const p of contrastReport) console.log(`  ${p.ratio >= p.min ? 'ok ' : 'BAJO'} ${p.ratio}:1  ${p.name}`);
console.log('\nHalo de fotos (delta RGB vs plato):');
for (const s of seamReport) console.log(`  ${s.delta}/255  ${s.src} (foto ${s.avg.join(',')} vs plato ${s.wrap})`);
console.log(`\nCapturas: ${OUT}`);
console.log(`Resultado: ${checks.length - failed.length}/${checks.length} checks OK\n`);

ws.close();
process.exit(failed.length ? 1 : 0);


