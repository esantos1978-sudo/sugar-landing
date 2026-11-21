/**
 * Validación real del render con Chrome headless + CDP.
 * Requiere: `python -m http.server 8123` y Chrome con --remote-debugging-port=9222
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8123/index.html';
const DEBUG = 'http://127.0.0.1:9222';
const OUT = path.resolve('.tmp/validation');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPageTarget() {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(`${DEBUG}/json/list`);
            const targets = await res.json();
            const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
            if (page) return page;
        } catch { /* Chrome todavía arrancando */ }
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
const httpResponses = [];
const failedRequests = [];
const requestUrls = new Map();
const runtimeExceptions = [];

ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
        return;
    }
    if (msg.method === 'Network.requestWillBeSent') {
        requestUrls.set(msg.params.requestId, msg.params.request.url);
    }
    if (msg.method === 'Network.responseReceived') {
        httpResponses.push({ url: msg.params.response.url, status: msg.params.response.status });
    }
    if (msg.method === 'Network.loadingFailed') {
        failedRequests.push({
            url: requestUrls.get(msg.params.requestId) ?? '?',
            error: msg.params.errorText,
            canceled: msg.params.canceled
        });
    }
    if (msg.method === 'Runtime.exceptionThrown') {
        runtimeExceptions.push(msg.params.exceptionDetails.text);
    }
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

async function waitForLocalImages(timeout = 20000) {
    const result = await evaluate(`(async () => {
        const deadline = Date.now() + ${timeout};
        const pending = () => [...document.images].filter((i) =>
            !String(i.getAttribute('src')).startsWith('http') && (!i.complete || i.naturalWidth === 0));
        while (Date.now() < deadline) {
            const missing = pending();
            if (missing.length === 0) return { ok: true };
            missing.forEach((i) => { i.loading = 'eager'; i.scrollIntoView({ block: 'center' }); });
            await new Promise((r) => setTimeout(r, 250));
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

async function hover(selector) {
    const point = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const wrap = el.querySelector('.product-img-wrap') || el;
        const r = wrap.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!point) throw new Error(`No encontrado: ${selector}`);
    await sleep(300);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
    await sleep(750); // transition 0.4s + margen
    return point;
}

async function unhover() {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0 });
    await sleep(700);
}

const probe = (selector) => `(() => {
    const card = document.querySelector(${JSON.stringify(selector)});
    if (!card) return null;
    const front = card.querySelector('.img-front');
    const back = card.querySelector('.img-back');
    const img = card.querySelector('.product-img-wrap img');
    const cs = (el) => el ? getComputedStyle(el) : { opacity: null, filter: null };
    return {
        product: card.dataset.product,
        imgCount: card.querySelectorAll('.product-img-wrap img').length,
        frontOpacity: front ? +cs(front).opacity : null,
        backOpacity: back ? +cs(back).opacity : null,
        frontFilter: front ? cs(front).filter : null,
        backFilter: back ? cs(back).filter : null,
        singleFilter: img ? cs(img).filter : null,
        frontSrc: front ? front.getAttribute('src') : (img ? img.getAttribute('src') : null),
        backSrc: back ? back.getAttribute('src') : null,
        frontLoaded: front ? front.complete && front.naturalWidth > 0 : (img ? img.complete && img.naturalWidth > 0 : false),
        backLoaded: back ? back.complete && back.naturalWidth > 0 : null
    };
})()`;
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await waitForLoad();
await scrollThroughPage();
const imagesReadyDesktop = await waitForLocalImages();

const imageReport = await evaluate(`(() => {
    const imgs = [...document.images].map((i) => ({
        src: i.getAttribute('src'),
        cls: i.className,
        complete: i.complete,
        naturalWidth: i.naturalWidth,
        naturalHeight: i.naturalHeight,
        loading: i.loading,
        decoding: i.decoding
    }));
    return { count: imgs.length, imgs };
})()`);

const layout = await evaluate(`(() => {
    const grid = document.querySelector('#drops .product-grid');
    const g = grid.getBoundingClientRect();
    const cards = [...grid.querySelectorAll('.product-item')].map((c) => {
        const r = c.getBoundingClientRect();
        return {
            product: c.dataset.product,
            left: +(r.left - g.left).toFixed(1),
            top: +(r.top - g.top).toFixed(1),
            width: +r.width.toFixed(1),
            height: +r.height.toFixed(1),
            imgs: c.querySelectorAll('.product-img-wrap img').length
        };
    });
    return {
        gridWidth: +g.width.toFixed(1),
        gridScrollWidth: grid.scrollWidth,
        gridClientWidth: grid.clientWidth,
        cards
    };
})()`);

const dropsClip = await evaluate(`(() => {
    const r = document.querySelector('#drops').getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
})()`);
const desktopGridShot = await screenshot('desktop-grid-1600.png', dropsClip);

const swapSelectors = [
    '[data-product="tee-black"]',
    '[data-product="tee-sage"]',
    '[data-product="tee-flamingo"]',
    '[data-product="tee-07"]'
];
const swapResults = [];
for (const selector of swapSelectors) {
    await hover(selector);
    const hovered = await evaluate(probe(selector));
    await unhover();
    const idle = await evaluate(probe(selector));
    swapResults.push({ selector, hovered, idle });
}

async function cardShot(selector, name) {
    await hover(selector);
    const clip = await evaluate(`(() => {
        const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
    })()`);
    const file = await screenshot(name, clip);
    await unhover();
    return file;
}
const hoverBlackShot = await cardShot('[data-product="tee-black"]', 'hover-tee-black.png');
const hover07Shot = await cardShot('[data-product="tee-07"]', 'hover-tee-07.png');

const singleSelectors = [
    '[data-product="tee-04"]',
    '[data-product="tee-05"]',
    '[data-product="tee-06"]'
];
const singleResults = [];
for (const selector of singleSelectors) {
    const idle = await evaluate(probe(selector));
    await hover(selector);
    const hovered = await evaluate(probe(selector));
    await unhover();
    singleResults.push({ selector, idle, hovered });
}

const desktopOverflow = await evaluate(`(() => ({
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
}))()`);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.reload', { ignoreCache: true });
await waitForLoad();
await scrollThroughPage();
const imagesReadyMobile = await waitForLocalImages();

const mobileReport = await evaluate(`(() => {
    const doc = document.documentElement;
    const grid = document.querySelector('#drops .product-grid');
    const cards = [...grid.querySelectorAll('.product-item')].map((c) => {
        const r = c.getBoundingClientRect();
        const f = c.querySelector('.img-front') || c.querySelector('.product-img-wrap img');
        const b = c.querySelector('.img-back');
        return {
            product: c.dataset.product,
            left: +r.left.toFixed(1),
            top: +r.top.toFixed(1),
            width: +r.width.toFixed(1),
            frontOpacity: +getComputedStyle(f).opacity,
            backOpacity: b ? +getComputedStyle(b).opacity : null,
            filter: getComputedStyle(f).filter,
            imgs: c.querySelectorAll('.product-img-wrap img').length
        };
    });
    return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        docScrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        gridScrollWidth: grid.scrollWidth,
        cards
    };
})()`);

const mobileClip = await evaluate(`(() => {
    const r = document.querySelector('#drops').getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
})()`);
const mobileShot = await screenshot('mobile-390-grid.png', mobileClip);
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
const gray = (filter) => {
    const m = /grayscale\(([\d.]+)\)/.exec(filter || '');
    return m ? Number(m[1]) : null;
};
const isLocal = (src) => typeof src === 'string' && !src.startsWith('http');

const localImgs = imageReport.imgs.filter((i) => isLocal(i.src));
const brokenLocal = localImgs.filter((i) => !i.complete || i.naturalWidth === 0);
check('imágenes locales cargan (naturalWidth > 0)',
    brokenLocal.length === 0 && localImgs.length > 0 && imagesReadyDesktop.ok,
    { total: localImgs.length, ready: imagesReadyDesktop, broken: brokenLocal.map((i) => i.src) });

const localHttp = httpResponses.filter((r) => r.url.includes('/assets/images/'));
const localUnique = [...new Set(localHttp.map((r) => r.url))];
const localNon200 = localHttp.filter((r) => r.status !== 200);
const localStatusOk = localImgs.every((img) => {
    const name = String(img.src).split('/').pop();
    const hit = localHttp.find((r) => r.url.endsWith('/' + name));
    return hit && hit.status === 200;
});
check('peticiones locales a /assets/images/ devuelven 200',
    localNon200.length === 0 && localUnique.length === localImgs.length && localStatusOk,
    { requests: localUnique.length, images: localImgs.length, non200: localNon200.map((r) => `${r.status} ${r.url}`) });


const backImgs = imageReport.imgs.filter((i) => String(i.cls).includes('img-back'));
check('4 imágenes -back.webp presentes y cargadas', backImgs.length === 4 && backImgs.every((i) => i.naturalWidth > 0),
    backImgs.map((i) => ({ src: i.src, w: i.naturalWidth })));

check('7 tarjetas en el grid', layout.cards.length === 7, layout.cards.map((c) => c.product));
const spanOf = (idx) => (idx === 0 ? 7 : idx <= 2 ? 5 : 3);
const expectWidth = (span) => {
    const gap = 16;
    const col = (layout.gridWidth - 11 * gap) / 12;
    return span * col + (span - 1) * gap;
};
check('spans 7/5/5 + 3/3/3/3 sin desbordar',
    layout.cards.every((c, idx) => Math.abs(c.width - expectWidth(spanOf(idx))) < 2) && layout.gridScrollWidth <= layout.gridClientWidth,
    layout.cards.map((c, idx) => `${c.product}: ${c.width}px (span ${spanOf(idx)})`));

const topRow = layout.cards.slice(0, 3);
const bottomRow = layout.cards.slice(3);
const [heroCard, rightTop, rightBottom] = topRow;
const gapPx = 16;
check('destacada (span 7) ocupa las 2 filas de la columna izquierda',
    heroCard.top === rightTop.top && Math.abs(heroCard.height - (rightTop.height + gapPx + rightBottom.height)) < 2,
    { hero: `${heroCard.product} h=${heroCard.height}`, right: `${rightTop.product} h=${rightTop.height} + ${rightBottom.product} h=${rightBottom.height}` });
check('columna derecha apilada (sobre/bajo, mismo left)',
    rightTop.left === rightBottom.left && Math.abs(rightBottom.top - (rightTop.top + rightTop.height + gapPx)) < 1,
    { left: [rightTop.left, rightBottom.left], top: [rightTop.top, rightBottom.top] });
check('fila 2 alineada (4 x 3)', bottomRow.every((c) => c.top === bottomRow[0].top) &&
    bottomRow.every((c) => Math.abs(c.width - bottomRow[0].width) < 1),
    bottomRow.map((c) => `${c.product}@${c.top}/${c.width}`));
const row1Bottom = Math.max(heroCard.top + heroCard.height, rightBottom.top + rightBottom.height);
check('fila 2 arranca debajo de la fila 1', bottomRow[0].top >= row1Bottom + gapPx - 1,
    { row1Bottom, fila2Top: bottomRow[0].top });
check('2 imágenes solo en black/sage/flamingo/tee-07', layout.cards.map((c) => c.imgs).join(',') === '2,2,2,1,1,1,2',
    layout.cards.map((c) => `${c.product}=${c.imgs}`));

for (const r of swapResults) {
    const { hovered: h, idle: i } = r;
    check(`hover ${r.selector}: cruza front 1→0 / back 0→1`,
        i.frontOpacity === 1 && i.backOpacity === 0 && h.frontOpacity === 0 && h.backOpacity === 1,
        { idle: `front ${i.frontOpacity} / back ${i.backOpacity}`, hover: `front ${h.frontOpacity} / back ${h.backOpacity}` });
    check(`hover ${r.selector}: B/N → color`, gray(i.frontFilter) === 1 && gray(h.frontFilter) === 0 && gray(h.backFilter) === 0,
        { idleFront: i.frontFilter, hoverFront: h.frontFilter, hoverBack: h.backFilter });
    check(`${r.selector}: usa -back.webp y ambas cargan`,
        /\.webp$/.test(h.frontSrc) && /-back\.webp$/.test(h.backSrc) && h.frontLoaded && h.backLoaded,
        { front: h.frontSrc, back: h.backSrc });
}

for (const r of singleResults) {
    check(`${r.selector}: una sola imagen, sin swap`, r.idle.imgCount === 1 && r.hovered.imgCount === 1 &&
        r.idle.backOpacity === null && r.idle.frontSrc === r.hovered.frontSrc,
        { imgs: r.hovered.imgCount, src: r.hovered.frontSrc });
    check(`${r.selector}: B/N → color en hover`, gray(r.idle.singleFilter) === 1 && gray(r.hovered.singleFilter) === 0,
        { idle: r.idle.singleFilter, hover: r.hovered.singleFilter });
}

check('desktop 1600px sin scroll horizontal', desktopOverflow.docScrollWidth <= desktopOverflow.innerWidth + 1, desktopOverflow);
const mCards = mobileReport.cards;
check('móvil 390px: sin scroll horizontal',
    mobileReport.docScrollWidth <= mobileReport.innerWidth + 1 && mobileReport.gridScrollWidth <= mobileReport.innerWidth,
    { innerWidth: mobileReport.innerWidth, docScrollWidth: mobileReport.docScrollWidth, gridScrollWidth: mobileReport.gridScrollWidth });
check('móvil: 7 tarjetas apiladas a una columna',
    mCards.length === 7 && mCards.every((c) => Math.abs(c.width - mCards[0].width) < 1) &&
    mCards.every((c) => Math.abs(c.left - mCards[0].left) < 1) && mCards[0].width > 250,
    mCards.map((c) => `${c.product}@${c.left}/${c.width}`));
check('móvil: front en B/N visible y back oculto',
    mCards.every((c) => c.frontOpacity === 1 && (c.backOpacity === null || c.backOpacity === 0) && gray(c.filter) === 1),
    mCards.map((c) => `${c.product}: front ${c.frontOpacity}, back ${c.backOpacity}, ${c.filter}`));

const failed = checks.filter((c) => !c.ok);
const report = {
    generatedAt: new Date().toISOString(),
    url: BASE,
    imagesReady: { desktop: imagesReadyDesktop, mobile: imagesReadyMobile },
    screenshots: { desktopGridShot, hoverBlackShot, hover07Shot, mobileShot },
    network: {
        localImageRequests: localUnique.length,
        non200: localNon200,
        failed: failedRequests.filter((f) => !f.canceled),
        runtimeExceptions,
        externalImages: imageReport.imgs.filter((i) => !isLocal(i.src)).map((i) => ({ src: i.src, loaded: i.naturalWidth > 0 }))
    },
    layout,
    swapResults,
    singleResults,
    mobileReport,
    imageReport,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
    checks
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

console.log('=== IMÁGENES LOCALES ===');
for (const i of localImgs) {
    console.log(`${i.naturalWidth > 0 ? 'OK  ' : 'FAIL'} ${i.naturalWidth}x${i.naturalHeight}  ${i.src}  [${i.cls || '-'}]`);
}
console.log(`\n=== EXTERNAS ===`);
for (const i of report.network.externalImages) console.log(`${i.loaded ? 'OK  ' : 'FAIL'} ${i.src}`);
console.log('\n=== LAYOUT DESKTOP 1600 ===');
console.log(JSON.stringify(layout));
console.log('\n=== MÓVIL 390 ===');
console.log(JSON.stringify({ innerWidth: mobileReport.innerWidth, docScrollWidth: mobileReport.docScrollWidth, cards: mCards }));
console.log('\n=== CHECKS ===');
for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail === '' ? '' : `  -> ${JSON.stringify(c.detail)}`}`);
}
console.log(`\n=== RESUMEN: ${checks.length - failed.length}/${checks.length} OK, ${failed.length} fallos ===`);
console.log(`Capturas: ${OUT}`);

ws.close();
process.exit(failed.length ? 1 : 0);





