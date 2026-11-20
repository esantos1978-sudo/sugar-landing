/**
 * SUGR® — Urban Streetwear
 * Reveal progresivo de los productos al entrar en el viewport.
 * Interacciones de e-commerce: selector de tallas, Quick Add + toast y nav móvil.
 */
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.fade-in');

    // Accesibilidad: si el usuario prefiere menos movimiento, mostramos todo.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Fallback para navegadores sin IntersectionObserver.
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('visible'));
    } else {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    // La animación es de entrada: dejamos de observar el elemento.
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        items.forEach(el => observer.observe(el));
    }

    // 1. Size Selection Logic
    document.querySelectorAll('.size-selector').forEach(selector => {
        const buttons = selector.querySelectorAll('.size-btn');

        // Estado inicial accesible (coherente con la clase .active del HTML).
        buttons.forEach(btn => btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false'));

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            });
        });
    });

    // 2. Quick Add & Toast Notification Logic
    const toast = document.getElementById('cart-toast');
    const toastMessage = document.getElementById('toast-message');
    const quickAddButtons = document.querySelectorAll('.quick-add-btn');
    const TOAST_DURATION = 2500;
    let toastTimeout;
    let resetState = null;

    // Restaura el feedback del último botón pulsado (evita textos "ADDED" colgados).
    const restoreButton = () => {
        if (!resetState) return;
        resetState.label.textContent = resetState.originalText;
        resetState.button.classList.remove('added');
        resetState = null;
    };

    quickAddButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const productCard = btn.closest('.product-item');
            if (!productCard) return;

            const nameEl = productCard.querySelector('.product-name');
            const sizeEl = productCard.querySelector('.size-btn.active');
            const label = btn.querySelector('.btn-text');
            if (!nameEl || !sizeEl || !label) return;

            const productName = nameEl.textContent.trim();
            const activeSize = sizeEl.textContent.trim();

            // Si se añade otro producto antes del reset, limpiamos el anterior.
            restoreButton();

            const originalText = label.textContent;
            label.textContent = `ADDED [${activeSize}]`;
            btn.classList.add('added');
            resetState = { button: btn, label, originalText };

            if (toast && toastMessage) {
                toastMessage.textContent = `${productName} (${activeSize}) ADDED TO BAG`;
                toast.classList.add('visible');

                clearTimeout(toastTimeout);
                toastTimeout = setTimeout(() => {
                    toast.classList.remove('visible');
                    restoreButton();
                }, TOAST_DURATION);
            } else {
                // Sin toast en el DOM, devolvemos el botón a su estado original igualmente.
                clearTimeout(toastTimeout);
                toastTimeout = setTimeout(restoreButton, TOAST_DURATION);
            }
        });
    });

    // 3. Mobile Bottom Nav: estado activo al navegar entre secciones
    const mobileNavItems = document.querySelectorAll('.mobile-bottom-nav .nav-item');
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            mobileNavItems.forEach(navItem => {
                navItem.classList.remove('active');
                navItem.removeAttribute('aria-current');
            });
            item.classList.add('active');
            item.setAttribute('aria-current', 'true');
        });
    });

    // 4. "Notify Me" Feedback (Next Drop): no añade al carrito, solo confirma
    //    el registro con un estado temporal. Usamos una clase (no estilos
    //    inline) para no romper el :hover definido en CSS.
    document.querySelectorAll('.notify-btn').forEach(btn => {
        const label = btn.querySelector('.btn-text');
        if (!label) return;

        const originalText = label.textContent;
        let resetTimeout;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            clearTimeout(resetTimeout);

            label.textContent = 'REGISTERED ✓';
            btn.classList.add('registered');

            resetTimeout = setTimeout(() => {
                label.textContent = originalText;
                btn.classList.remove('registered');
            }, 2000);
        });
    });
});
