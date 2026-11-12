// Mapa para marcar el punto de entrega de un pedido.
// pedidos.js lo usa a través de window.MapaPedido.
window.MapaPedido = (function () {
    'use strict';

    const hayMapa = typeof L !== 'undefined';

    // Centro del mapa si todavía no hay huerto guardado (aproximada del ITSOEH)
    const UBICACION_DEFAULT = { lat: 20.2336, lon: -99.2119 };
    const ZOOM_INICIAL = 13;
    const ZOOM_PIN = 18;
    const ZOOM_HUERTO = 15;

    // Precisión del GPS (en metros)
    const PRECISION_BUENA = 20;
    const PRECISION_ACEPTABLE = 50;
    const TIEMPO_GPS = 15000;

    let mapa = null;
    let pin = null;
    let circulo = null;
    let seleccion = null;        // { lat, lon, precision }
    let tokenDireccion = 0;      // para ignorar respuestas viejas del servicio de direcciones
    let vigilanteGps = null;
    let limiteGps = null;

    // ===== MySQL: huerto que viene de la base =====
    let huertoBD = undefined;    // undefined = aún no llega, null = el usuario no tiene huerto
    let marcaHuerto = null;      // punto verde del huerto en el mapa

    const $ = function (id) { return document.getElementById(id); };

    function campoDireccion() {
        return document.querySelector('#form-pedido [name="direccion"]');
    }

    function estado(texto, nivel) {
        const nodo = $('mapa-pedido-estado');
        nodo.textContent = texto;
        nodo.className = 'pedidos__mapa-estado' + (nivel ? ' pedidos__mapa-estado--' + nivel : '');
    }

    function botones(activos) {
        ['btn-pedido-gps', 'btn-pedido-huerto', 'btn-pedido-buscar'].forEach(function (id) {
            $(id).disabled = !activos;
        });
    }

    // ===== Coordenadas del huerto (para centrar el mapa) =====
    function coordenadasHuerto() {
        // MySQL: si ya llegó la respuesta de la base, se usa esa
        if (huertoBD !== undefined) return huertoBD;

        try {
            const huerto = JSON.parse(localStorage.getItem('datosHuerto')) || {};
            const lat = Number(String(huerto.latitud === undefined ? '' : huerto.latitud).replace(',', '.'));
            const lon = Number(String(huerto.longitud === undefined ? '' : huerto.longitud).replace(',', '.'));
            if (String(huerto.latitud || '').trim() === '' || String(huerto.longitud || '').trim() === '') return null;
            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
            return { lat: lat, lon: lon };
        } catch (error) {
            return null;
        }
    }

    // ===== MySQL: poner (o quitar) el punto verde del huerto =====
    function dibujarHuerto(huerto) {
        if (!mapa) return;
        if (marcaHuerto) {
            mapa.removeLayer(marcaHuerto);
            marcaHuerto = null;
        }
        if (!huerto) return;

        marcaHuerto = L.circleMarker([huerto.lat, huerto.lon], {
            radius: 7,
            color: '#fff',
            weight: 2,
            fillColor: '#3a973a',
            fillOpacity: 1
        }).addTo(mapa).bindTooltip('Tu huerto');
    }

    // ===== MySQL: traer el huerto del usuario desde la base =====
    async function cargarHuertoBD() {
        if (typeof obtenerHuerto !== 'function') return;   // api.js no está cargado

        const respuesta = await obtenerHuerto();
        if (!respuesta.ok) return;   // sin servidor: se queda con lo del navegador

        const h = respuesta.huerto;
        const lat = h ? Number(h.latitud) : NaN;
        const lon = h ? Number(h.longitud) : NaN;

        huertoBD = (h && h.latitud !== null && h.longitud !== null && !isNaN(lat) && !isNaN(lon))
            ? { lat: lat, lon: lon }
            : null;

        // Si el mapa ya estaba abierto, se actualiza
        if (mapa) {
            dibujarHuerto(huertoBD);
            if (huertoBD && !pin) {
                mapa.setView([huertoBD.lat, huertoBD.lon], ZOOM_HUERTO);
            }
        }
    }

    // ===== Texto según la precisión del GPS =====
    function describirPrecision(metros) {
        const m = Math.round(metros);
        if (metros <= PRECISION_BUENA) {
            estado('Ubicación con buena precisión (±' + m + ' m). Ajusta el pin si hace falta.', 'ok');
        } else if (metros <= PRECISION_ACEPTABLE) {
            estado('Precisión aceptable (±' + m + ' m). Si puedes, arrastra el pin al punto exacto.', 'aviso');
        } else {
            estado('Precisión baja (±' + m + ' m). Arrastra el pin al punto exacto de la entrega.', 'aviso');
        }
    }

    // ===== Colocar el pin =====
    // opciones: { centrar: true/false, precision: metros o null, direccion: 'sobrescribir' | 'completar' | 'no' }
    function colocarPin(lat, lon, opciones) {
        seleccion = { lat: lat, lon: lon, precision: opciones.precision };
        $('mapa-pedido').classList.remove('pedidos__mapa--error');

        if (pin) {
            pin.setLatLng([lat, lon]);
        } else {
            pin = L.marker([lat, lon], { draggable: true, autoPan: true }).addTo(mapa);
            pin.on('dragend', function () {
                const punto = pin.getLatLng();
                colocarPin(punto.lat, punto.lng, { centrar: false, precision: null, direccion: 'sobrescribir' });
            });
        }

        if (opciones.centrar) {
            mapa.setView([lat, lon], Math.max(mapa.getZoom(), ZOOM_PIN));
        } else {
            mapa.panTo([lat, lon]);
        }

        // Círculo con el margen de error del GPS
        if (circulo) {
            mapa.removeLayer(circulo);
            circulo = null;
        }
        if (opciones.precision !== null) {
            circulo = L.circle([lat, lon], {
                radius: opciones.precision,
                color: '#3a973a',
                weight: 1,
                fillOpacity: 0.12
            }).addTo(mapa);
            describirPrecision(opciones.precision);
        } else {
            estado('Punto de entrega marcado. Arrastra el pin si necesitas ajustarlo.', 'ok');
        }

        if (opciones.direccion !== 'no') {
            consultarDireccion(lat, lon, opciones.direccion);
        }
    }

    // ===== Llenar la dirección con lo que devuelve el mapa =====
    function aplicarDireccion(direccion, modo) {
        const calle = [direccion.road, direccion.house_number].filter(Boolean).join(' ');
        const colonia = direccion.suburb || direccion.neighbourhood || direccion.quarter ||
                        direccion.hamlet || direccion.village || '';
        const municipio = direccion.municipality || direccion.city || direccion.town ||
                          direccion.county || direccion.village || '';

        const texto = [calle, colonia, municipio]
            .filter(function (parte, indice, lista) {
                return parte && lista.indexOf(parte) === indice;
            })
            .join(', ');

        const campo = campoDireccion();
        if (texto && (modo === 'sobrescribir' || campo.value.trim() === '')) {
            campo.value = texto;
        }
    }

    // Dirección de unas coordenadas (servicio Nominatim de OpenStreetMap)
    async function consultarDireccion(lat, lon, modo) {
        const token = ++tokenDireccion;
        try {
            const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18' +
                        '&accept-language=es&lat=' + lat + '&lon=' + lon;
            const respuesta = await fetch(url);
            const datos = await respuesta.json();

            if (token !== tokenDireccion) return;   // ya se movió el pin otra vez
            if (datos && datos.address) {
                aplicarDireccion(datos.address, modo);
            }
        } catch (error) {
            // Si falla, el usuario puede escribir la dirección a mano
        }
    }

    // ===== Crear el mapa (la primera vez que se abre el formulario) =====
    function crearMapa() {
        const huerto = coordenadasHuerto();
        const centro = huerto || UBICACION_DEFAULT;

        mapa = L.map('mapa-pedido').setView([centro.lat, centro.lon], huerto ? ZOOM_HUERTO : ZOOM_INICIAL);

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

        // Punto verde de referencia: el huerto
        // MySQL: ahora se dibuja con dibujarHuerto() para poder actualizarlo
        dibujarHuerto(huerto);

        // Tocar el mapa mueve el pin
        mapa.on('click', function (evento) {
            colocarPin(evento.latlng.lat, evento.latlng.lng,
                       { centrar: false, precision: null, direccion: 'sobrescribir' });
        });
    }

    // ===== Abrir el mapa (cuando se despliega el formulario) =====
    function iniciar() {
        if (!hayMapa) {
            estado('No se pudo cargar el mapa. Revisa tu conexión.', 'error');
            botones(false);
            return;
        }
        if (!mapa) crearMapa();
        // El mapa necesita recalcular su tamaño ahora que el formulario ya es visible
        setTimeout(function () { mapa.invalidateSize(); }, 250);
    }

    // ===== Limpiar (cuando se cierra o se guarda el formulario) =====
    function detenerGps() {
        clearTimeout(limiteGps);
        if (vigilanteGps !== null) {
            navigator.geolocation.clearWatch(vigilanteGps);
            vigilanteGps = null;
        }
        $('btn-pedido-gps').disabled = !hayMapa;
    }

    function limpiar() {
        detenerGps();
        tokenDireccion++;
        seleccion = null;
        if (mapa) {
            if (pin) { mapa.removeLayer(pin); pin = null; }
            if (circulo) { mapa.removeLayer(circulo); circulo = null; }
        }
        $('mapa-pedido').classList.remove('pedidos__mapa--error');
        estado('Toca el mapa o arrastra el pin para marcar el punto de entrega.', '');
    }

    // ===== Lo que se guarda en el pedido =====
    function obtener() {
        if (!seleccion) return null;
        return {
            latitud: Number(seleccion.lat.toFixed(6)),
            longitud: Number(seleccion.lon.toFixed(6)),
            precision: seleccion.precision === null ? null : Math.round(seleccion.precision),
            direccion: campoDireccion().value.trim()
        };
    }

    function marcarError() {
        $('mapa-pedido').classList.add('pedidos__mapa--error');
    }

    // ===== Botón: Mi huerto (centra el mapa en el huerto) =====
    $('btn-pedido-huerto').addEventListener('click', function () {
        if (!mapa) return;
        const huerto = coordenadasHuerto();
        if (!huerto) {
            estado('Aún no has marcado tu huerto en el mapa. Hazlo desde tu perfil.', 'aviso');
            return;
        }
        mapa.setView([huerto.lat, huerto.lon], ZOOM_HUERTO);
        estado('Mapa centrado en tu huerto. Toca el punto de entrega.', '');
    });

    // ===== Botón: Buscar la dirección escrita =====
    $('btn-pedido-buscar').addEventListener('click', async function () {
        if (!mapa) return;
        const consulta = campoDireccion().value.trim();

        if (consulta === '') {
            estado('Escribe una dirección para buscarla.', 'aviso');
            return;
        }

        const boton = $('btn-pedido-buscar');
        boton.disabled = true;
        estado('Buscando...', 'aviso');

        try {
            const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1' +
                        '&countrycodes=mx&accept-language=es&q=' + encodeURIComponent(consulta);
            const respuesta = await fetch(url);
            const resultados = await respuesta.json();

            if (resultados.length === 0) {
                estado('No se encontró esa dirección. Prueba con otra o toca el mapa.', 'error');
            } else {
                colocarPin(Number(resultados[0].lat), Number(resultados[0].lon),
                           { centrar: true, precision: null, direccion: 'no' });
                estado('Dirección encontrada. Ajusta el pin al punto exacto de la entrega.', 'aviso');
            }
        } catch (error) {
            estado('No se pudo buscar. Revisa tu conexión.', 'error');
        } finally {
            boton.disabled = false;
        }
    });

    // ===== Botón: Mi ubicación (GPS que mejora la precisión unos segundos) =====
    $('btn-pedido-gps').addEventListener('click', function () {
        if (!mapa) return;
        if (!navigator.geolocation) {
            estado('Tu navegador no permite obtener la ubicación.', 'error');
            return;
        }
        if (vigilanteGps !== null) return;

        let mejor = null;
        $('btn-pedido-gps').disabled = true;
        estado('Buscando tu ubicación...', 'aviso');

        function terminar() {
            detenerGps();
            if (!mejor) {
                estado('No se pudo obtener tu ubicación. Toca el mapa para marcar el punto.', 'error');
                return;
            }
            colocarPin(mejor.lat, mejor.lon,
                       { centrar: true, precision: mejor.precision, direccion: 'sobrescribir' });
        }

        limiteGps = setTimeout(terminar, TIEMPO_GPS);

        vigilanteGps = navigator.geolocation.watchPosition(
            function (posicion) {
                const precision = posicion.coords.accuracy;

                if (!mejor || precision < mejor.precision) {
                    mejor = { lat: posicion.coords.latitude, lon: posicion.coords.longitude, precision: precision };
                    colocarPin(mejor.lat, mejor.lon, { centrar: true, precision: precision, direccion: 'no' });
                    estado('Mejorando precisión... ±' + Math.round(precision) + ' m', 'aviso');
                }

                if (mejor.precision <= PRECISION_BUENA) {
                    terminar();
                }
            },
            function (error) {
                if (mejor) {
                    terminar();
                    return;
                }
                detenerGps();
                estado(error.code === 1
                    ? 'No diste permiso para usar tu ubicación. Actívalo en el navegador o toca el mapa.'
                    : 'No se pudo obtener tu ubicación. Toca el mapa para marcar el punto.', 'error');
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: TIEMPO_GPS }
        );
    });

    // ===== MySQL: al cargar la página, pedir el huerto a la base =====
    cargarHuertoBD();

    return {
        iniciar: iniciar,
        limpiar: limpiar,
        obtener: obtener,
        marcarError: marcarError,
        disponible: function () { return hayMapa; }
    };
})();