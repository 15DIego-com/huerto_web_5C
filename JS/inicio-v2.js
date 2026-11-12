/* ==========================================================
   HUERTO WEB · V2 — Extras de la pantalla de inicio
   No modifica inicio.js, pedidos.js ni pedido-mapa.js:
   solo lee los mismos datos (sessionStorage y localStorage)
   para llenar las partes nuevas del diseño.
   1. Fecha de hoy en el encabezado
   2. Saludo con mayúscula inicial
   3. Nombre del huerto, número de cultivos y dirección
   4. Mapa pequeño con el pin del huerto
   (el nombre del menú lateral lo pone v2-app.js)
   ========================================================== */

(function () {
    'use strict';

    /* ---------- Utilidades ---------- */
    function $(id) {
        return document.getElementById(id);
    }

    function leerHuerto() {
        try {
            return JSON.parse(localStorage.getItem('datosHuerto')) || null;
        } catch (error) {
            return null;
        }
    }

    /* ---------- 1. Fecha de hoy ---------- */
    const fecha = $('fecha-hoy');
    if (fecha) {
        const texto = new Date().toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        // "viernes, 6 de noviembre" -> "Viernes 6 de noviembre"
        fecha.textContent = texto.charAt(0).toUpperCase() + texto.slice(1).replace(',', '');
    }

    // El saludo de inicio.js puede venir en MAYÚSCULAS: se acomoda
    const saludo = $('nombre-usuario');
    if (saludo && saludo.textContent) {
        const t = saludo.textContent;
        saludo.textContent = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }

    /* ---------- 3 y 4. Datos del huerto y mapa ---------- */
    let mapa = null;
    let pin = null;

    function pintarHuerto() {
        const huerto = leerHuerto();

        // Nombre del huerto
        if ($('huerto-nombre')) {
            $('huerto-nombre').textContent = (huerto && huerto.nombre) ? huerto.nombre : 'Mi huerto';
        }

        // Número de cultivos
        const total = $('huerto-total');
        if (total) {
            const cultivos = (huerto && huerto.cultivo)
                ? huerto.cultivo.split(',').map(function (c) { return c.trim(); }).filter(Boolean)
                : [];
            total.hidden = cultivos.length === 0;
            total.textContent = cultivos.length + (cultivos.length === 1 ? ' cultivo' : ' cultivos');
        }

        // Dirección
        if ($('huerto-direccion')) {
            const partes = huerto
                ? [huerto.calle, huerto.municipio, huerto.estado].filter(Boolean)
                : [];
            $('huerto-direccion').textContent = partes.length ? partes.join(', ') : 'Sin dirección registrada';
        }

        // Mapa pequeño
        const lat = huerto ? parseFloat(huerto.latitud) : NaN;
        const lon = huerto ? parseFloat(huerto.longitud) : NaN;
        const hayUbicacion = !isNaN(lat) && !isNaN(lon);

        if ($('huerto-vacio')) {
            $('huerto-vacio').hidden = hayUbicacion;
        }

        if (!hayUbicacion || typeof L === 'undefined') return;

        if (!mapa) {
            mapa = L.map('mapa-mi-huerto', {
                zoomControl: false,
                attributionControl: true,
                scrollWheelZoom: false,
                dragging: !L.Browser.mobile
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap'
            }).addTo(mapa);

            const icono = L.divIcon({
                className: 'in-pin',
                html: '<span></span>',
                iconSize: [36, 36],
                iconAnchor: [18, 36]
            });

            pin = L.marker([lat, lon], { icon: icono }).addTo(mapa);
        } else {
            pin.setLatLng([lat, lon]);
        }

        mapa.setView([lat, lon], 16);
        setTimeout(function () { mapa.invalidateSize(); }, 200);
    }

    /* inicio.js vuelve a llamar mostrarResumen() cuando llegan los
       datos de la base. Se "envuelve" esa función para actualizar
       también el huerto, sin tocar inicio.js. */
    if (typeof window.mostrarResumen === 'function') {
        const original = window.mostrarResumen;
        window.mostrarResumen = function () {
            original.apply(this, arguments);
            pintarHuerto();
        };
    }

    pintarHuerto();
})();
