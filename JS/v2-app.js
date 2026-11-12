/* ==========================================================
   HUERTO WEB · V2 — Menú compartido de la app del dueño
   Pone el nombre y las iniciales del usuario en la tarjeta
   de abajo del menú lateral (ids: lateral-nombre, lateral-iniciales).
   Solo lee sessionStorage; no cambia nada de los otros JS.
   ========================================================== */

(function () {
    'use strict';

    const nombreCompleto = sessionStorage.getItem('nombreUsuario') || 'Mi cuenta';
    const partes = nombreCompleto.split(' ').filter(Boolean);

    const iniciales = partes
        .map(function (p) { return p[0]; })
        .slice(0, 2)
        .join('')
        .toUpperCase();

    // Nombre y primer apellido, con mayúscula inicial ("FERNANDA ESCSMILLA" -> "Fernanda Escsmilla")
    const nombreCorto = partes
        .slice(0, 2)
        .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); })
        .join(' ');

    const nombre = document.getElementById('lateral-nombre');
    const inicial = document.getElementById('lateral-iniciales');

    if (nombre) nombre.textContent = nombreCorto || 'Mi cuenta';
    if (inicial) inicial.textContent = iniciales || 'HW';

    /* Nombres con mayúscula inicial en los elementos marcados con
       data-nombre-bonito ("FERNANDA ESCSMILLA" -> "Fernanda Escsmilla").
       Se ejecuta al final, después de que los otros JS pusieron el texto. */
    document.querySelectorAll('[data-nombre-bonito]').forEach(function (el) {
        el.textContent = el.textContent
            .toLowerCase()
            .replace(/(^|\s)(\S)/g, function (todo, espacio, letra) {
                return espacio + letra.toUpperCase();
            });
    });
})();
