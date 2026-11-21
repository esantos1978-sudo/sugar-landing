/**
 * Smoke test funcional de la 7ª tarjeta (tee-07): selector de talla + Quick Add + toast.
 * Reutiliza la sesión de Chrome con --remote-debugging-port=9222.
 */
const BASE = 'http://127.0.0.1:8123/index.html';
const DEBUG = 'http://127.0.0.1:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`${DEBUG}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
});

let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(2600);

const clicked = await evaluate(`(async () => {
    const card = document.querySelector('[data-product="tee-07"]');
    const xl = card.querySelector('.size-btn[data-size="XL"]');
    xl.click();
    await new Promise((r) => setTimeout(r, 120));
    const afterSize = {
        active: card.querySelector('.size-btn.active').textContent.trim(),
        xlPressed: xl.getAttribute('aria-pressed'),
        mPressed: card.querySelector('.size-btn[data-size="M"]').getAttribute('aria-pressed')
    };
    const btn = card.querySelector('.quick-add-btn');
    btn.click();
    await new Promise((r) => setTimeout(r, 450));
    const toast = document.getElementById('cart-toast');
    return {
        afterSize,
        btnText: btn.querySelector('.btn-text').textContent,
        addedClass: btn.classList.contains('added'),
        toastVisible: toast.classList.contains('visible'),
        toastMessage: document.getElementById('toast-message').textContent,
        toastOpacity: getComputedStyle(toast).opacity
    };
})()`);

await sleep(3000);
const restored = await evaluate(`(() => {
    const btn = document.querySelector('[data-product="tee-07"] .quick-add-btn');
    return {
        btnText: btn.querySelector('.btn-text').textContent,
        addedClass: btn.classList.contains('added'),
        toastVisible: document.getElementById('cart-toast').classList.contains('visible')
    };
})()`);

const checks = [
    { name: 'talla XL queda activa y aria-pressed coherente',
      ok: clicked.afterSize.active === 'XL' && clicked.afterSize.xlPressed === 'true' && clicked.afterSize.mPressed === 'false',
      detail: clicked.afterSize },
    { name: 'quick add muestra ADDED [XL] en el botón',
      ok: clicked.btnText === 'ADDED [XL]' && clicked.addedClass, detail: { text: clicked.btnText, added: clicked.addedClass } },
    { name: 'toast visible con "ESSENTIAL TEE / NAVY (XL) ADDED TO BAG"',
      ok: clicked.toastVisible && /ESSENTIAL TEE \/ NAVY \(XL\) ADDED TO BAG/.test(clicked.toastMessage),
      detail: { visible: clicked.toastVisible, opacity: clicked.toastOpacity, message: clicked.toastMessage } },
    { name: 'toast y botón se restauran a los 3s',
      ok: !restored.toastVisible && restored.btnText === 'QUICK ADD +' && !restored.addedClass, detail: restored }
];

for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  -> ${JSON.stringify(c.detail)}`);
console.log(`\n=== SMOKE: ${checks.filter((c) => c.ok).length}/${checks.length} OK ===`);
ws.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
