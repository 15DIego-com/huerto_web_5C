/* ==========================================================
   HUERTO WEB · V2 — Extras de "Mi cosecha"
   No modifica inventario.js. Cada vez que inventario.js dibuja
   las tarjetas, este archivo las lee y:
   1. Calcula el total de kilos, cuántos productos hay y cuál es el mayor
   2. Le pone a cada tarjeta su proporción (barrita de abajo)
   ========================================================== */

(function () {
    'use strict';

    const lista = document.getElementById('lista-productos');
    if (!lista) return;

    const stats = document.getElementById('cos-stats');
    const totalKg = document.getElementById('cos-total-kg');
    const totalProductos = document.getElementById('cos-total-productos');
    const top = document.getElementById('cos-top');

    // "1,234.5 kg" -> 1234.5
    function leerKilos(texto) {
        const numero = parseFloat(String(texto).replace(/[^\d.]/g, ''));
        return isNaN(numero) ? 0 : numero;
    }

    function formatoKg(numero) {
        return numero.toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' kg';
    }

    function actualizar() {
        const tarjetas = Array.from(lista.querySelectorAll('.cos-producto'));

        const datos = tarjetas.map(function (tarjeta) {
            const cantidad = tarjeta.querySelector('.cos-producto__cantidad');
            const nombre = tarjeta.querySelector('.cos-producto__nombre');
            return {
                tarjeta: tarjeta,
                kilos: leerKilos(cantidad ? cantidad.textContent : 0),
                nombre: nombre ? nombre.textContent : ''
            };
        });

        // Sin productos: se ocultan los números
        if (stats) stats.hidden = datos.length === 0;
        if (datos.length === 0) return;

        const suma = datos.reduce(function (total, d) { return total + d.kilos; }, 0);
        const mayor = datos.reduce(function (a, b) { return b.kilos > a.kilos ? b : a; });

        if (totalKg) totalKg.textContent = formatoKg(suma);
        if (totalProductos) totalProductos.textContent = datos.length;
        if (top) top.textContent = mayor.nombre || '—';

        // 2. Proporción de cada producto respecto al que más hay
        datos.forEach(function (d) {
            // Valor de 0 a 1 (mínimo 0.06 para que siempre se vea un poquito)
            const proporcion = mayor.kilos > 0 ? Math.max(0.06, d.kilos / mayor.kilos) : 0;
            d.tarjeta.style.setProperty('--pct', proporcion.toFixed(3));
            d.tarjeta.title = d.nombre + ': ' + Math.round(suma ? d.kilos / suma * 100 : 0) + '% de tu cosecha';
        });
    }

    // Se vuelve a calcular cada vez que inventario.js cambia la lista
    new MutationObserver(actualizar).observe(lista, { childList: true });
    actualizar();
})();
