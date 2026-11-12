(function () {
    'use strict';

    const CLAVE_HUERTO = 'datosHuerto';
    const ZOOM = 17;

    const contenedor = document.getElementById('ubicacion-mapa');
    const formulario = document.getElementById('form-ubicacion');
    if (!contenedor || !formulario) return;

    const conDatos = document.getElementById('mapa-con-datos');
    const vacio = document.getElementById('mapa-vacio');
    let mapa = null;

    // ===== Leer el huerto guardado =====
    function leerHuerto() {
        try {
            return JSON.parse(localStorage.getItem(CLAVE_HUERTO)) || {};
        } catch (error) {
            return {};
        }
    }

    function leerCoordenadas(huerto) {
        const textoLat = huerto.latitud === undefined || huerto.latitud === null ? '' : String(huerto.latitud);
        const textoLon = huerto.longitud === undefined || huerto.longitud === null ? '' : String(huerto.longitud);
        if (textoLat.trim() === '' || textoLon.trim() === '') return null;

        const lat = Number(textoLat.replace(',', '.'));
        const lon = Number(textoLon.replace(',', '.'));
        const validas = !isNaN(lat) && !isNaN(lon) &&
                        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        return validas ? { lat: lat, lon: lon } : null;
    }

    // ===== Dibujar el mapa con el pin =====
    function dibujarMapa(coords, huerto) {
        const precision = Number(huerto.precision);

        // Coordenadas y precisión en texto
        let textoCoords = coords.lat.toFixed(6) + ', ' + coords.lon.toFixed(6);
        if (precision > 0) {
            textoCoords += ' · ±' + Math.round(precision) + ' m';
        }
        document.getElementById('mapa-coords').textContent = textoCoords;

        // Enlace para abrir en Google Maps
        document.getElementById('btn-abrir-mapa').href =
            'https://www.google.com/maps/search/?api=1&query=' + coords.lat + ',' + coords.lon;

        // Si Leaflet no cargó (sin internet), se muestran solo las coordenadas
        if (typeof L === 'undefined') {
            document.getElementById('mapa-perfil').hidden = true;
            return;
        }

        mapa = L.map('mapa-perfil', { scrollWheelZoom: false }).setView([coords.lat, coords.lon], ZOOM);

        const calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        });
        const satelite = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                maxNativeZoom: 18,
                attribution: 'Imágenes &copy; Esri'
            });

        calles.addTo(mapa);
        L.control.layers({ 'Mapa': calles, 'Satélite': satelite }, null, { position: 'topright' }).addTo(mapa);

        // Pin del huerto con su nombre
        const pin = L.marker([coords.lat, coords.lon]).addTo(mapa);
        const nombre = document.createElement('strong');
        nombre.textContent = huerto.nombre ? String(huerto.nombre) : 'Mi huerto';
        pin.bindPopup(nombre);

        // Círculo con el margen de error del GPS (si se usó el GPS)
        if (precision > 0) {
            L.circle([coords.lat, coords.lon], {
                radius: precision,
                color: '#3a973a',
                weight: 1,
                fillOpacity: 0.12
            }).addTo(mapa);
        }

        setTimeout(function () { mapa.invalidateSize(); }, 250);
    }

    // ===== Mostrar el mapa o el aviso de "sin ubicación" =====
    // MySQL: ahora es una función para poder volver a dibujar cuando llegan los datos de la base
    function mostrarSegunGuardado() {
        // MySQL: si ya había un mapa dibujado, se quita para dibujar el nuevo
        if (mapa) {
            mapa.remove();
            mapa = null;
        }
        conDatos.hidden = true;
        vacio.hidden = true;

        const huerto = leerHuerto();
        const coords = leerCoordenadas(huerto);

        if (coords) {
            conDatos.hidden = false;
            dibujarMapa(coords, huerto);
        } else {
            vacio.hidden = false;
        }
    }

    mostrarSegunGuardado();

    // ===== MySQL: volver a dibujar cuando perfil.js trae el huerto de la base =====
    document.addEventListener('huerto-actualizado', mostrarSegunGuardado);

    // ===== Ocultar el mapa mientras se edita la ubicación =====
    function sincronizarConEdicion() {
        contenedor.hidden = !formulario.hidden;
        if (!contenedor.hidden && mapa) {
            setTimeout(function () { mapa.invalidateSize(); }, 50);
        }
    }

    new MutationObserver(sincronizarConEdicion)
        .observe(formulario, { attributes: true, attributeFilter: ['hidden'] });
})();