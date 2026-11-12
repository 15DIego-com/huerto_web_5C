/* ==========================================================
   HUERTO WEB · V2 — Pantalla de bienvenida (index.html)
   1. Menú hamburguesa en celular
   2. Franja de cultivos infinita
   3. Animación de aparición al hacer scroll
   4. Año actual en el pie de página
   ========================================================== */

document.addEventListener('DOMContentLoaded', function () {

    /* ---------- 1. Menú hamburguesa ---------- */
    const header = document.getElementById('bvHeader');
    const menuBtn = document.getElementById('bvMenuBtn');

    if (header && menuBtn) {
        menuBtn.addEventListener('click', function () {
            const abierto = header.classList.toggle('bv-abierto');
            menuBtn.setAttribute('aria-expanded', abierto);
            menuBtn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
        });

        // Al tocar un enlace del menú, se cierra
        header.querySelectorAll('.bv-nav a').forEach(function (enlace) {
            enlace.addEventListener('click', function () {
                header.classList.remove('bv-abierto');
                menuBtn.setAttribute('aria-expanded', 'false');
                menuBtn.setAttribute('aria-label', 'Abrir menú');
            });
        });
    }

    /* ---------- 2. Franja infinita ----------
       Se duplica el texto para que la animación CSS
       (que mueve la pista -50%) se vea sin cortes. */
    const franja = document.getElementById('bvFranja');

    if (franja) {
        const original = franja.innerHTML;
        franja.innerHTML = original + original + original + original;
    }

    /* ---------- 3. Aparición al hacer scroll ---------- */
    const elementos = document.querySelectorAll('.hw-aparecer');

    if ('IntersectionObserver' in window) {
        // Activa la animación solo cuando el JS ya está listo
        document.documentElement.classList.add('hw-js');

        const observador = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                if (entrada.isIntersecting) {
                    entrada.target.classList.add('hw-visible');
                    observador.unobserve(entrada.target);
                }
            });
        }, { threshold: 0.15 });

        elementos.forEach(function (el) {
            observador.observe(el);
        });
    } else {
        // Navegadores viejos: mostrar todo de una vez
        elementos.forEach(function (el) {
            el.classList.add('hw-visible');
        });
    }

    /* ---------- 4. Año actual ---------- */
    const anio = document.getElementById('bvAnio');

    if (anio) {
        anio.textContent = new Date().getFullYear();
    }
});

