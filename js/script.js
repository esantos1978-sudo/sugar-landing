/**
 * SUGAR® — Urban Streetwear
 * Reveal progresivo de los productos al entrar en el viewport.
 */
document.addEventListener('DOMContentLoaded', () => {
    const items = document.querySelectorAll('.fade-in');
    if (!items.length) return;

    // Accesibilidad: si el usuario prefiere menos movimiento, mostramos todo.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Fallback para navegadores sin IntersectionObserver.
    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('visible'));
        return;
    }

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
});
