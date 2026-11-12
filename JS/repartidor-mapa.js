// Mapa del repartidor: pines de las entregas, su ubicación en vivo y enlaces de navegación.
// repartidor.js lo usa a través de window.MapaReparto.
window.MapaReparto = (function () {
    'use strict';

    const hayMapa = typeof L !== 'undefined';

    // Centro del mapa si no hay huerto guardado (aproximada del ITSOEH)
    const UBICACION_DEFAULT = { lat: 20.2336, lon: -99.2119 };
    const ZOOM_INICIAL = 13;
    const ZOOM_ENFOQUE = 17;
    const MOVIMIENTO_MINIMO = 30;   // metros que debe moverse para actualizar distancias
    const TEXTO_BASE = 'Toca un pin para ver la entrega y cómo llegar.';
    const CLAVE_UBICACION = 'ubicacionRepartidor';   // la lee el panel del administrador

    // ===== MySQL: cada cuánto se manda la ubicación a la base =====
    const ENVIO_CADA = 10000;       // 10 segundos
    let ultimoEnvio = 0;

    let mapa = null;
    let capaPines = null;
    let capaHuertos = null;         // MySQL: huertos de los dueños con pedidos pendientes
    const pines = {};               // id de la entrega -> pin
    let firmaPines = '';

    let posicion = null;            // { lat, lon, precision } del repartidor
    let marcaPosicion = null;
    let circuloPosicion = null;
    let vigilante = null;
    let ultimaNotificada = null;
    let alCambiarPosicion = function () {};

    const $ = function (id) { return document.getElementById(id); };

    // ===== Distancias y enlaces =====
    // Distancia en metros entre dos puntos (línea recta)
    function distanciaEntre(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const rad = Math.PI / 180;
        const dLat = (lat2 - lat1) * rad;
        const dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Distancia desde el repartidor (null si no se conoce su ubicación)
    function distancia(lat, lon) {
        if (!posicion) return null;
        return distanciaEntre(posicion.lat, posicion.lon, lat, lon);
    }

    function urlComoLlegar(lat, lon) {
        return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + lat + ',' + lon;
    }

    // paradas: [{ latitud, longitud }] en el orden de la ruta; la última es el destino
    function urlRuta(paradas, origen) {
        const destino = paradas[paradas.length - 1];
        const intermedias = paradas.slice(0, -1);

        let url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
                  destino.latitud + ',' + destino.longitud;
        if (intermedias.length > 0) {
            url += '&waypoints=' + intermedias.map(function (p) {
                return p.latitud + ',' + p.longitud;
            }).join('%7C');
        }
        if (origen) {
            url += '&origin=' + origen.lat + ',' + origen.lon;
        }
        return url;
    }

    // ===== Textos del mapa =====
    function estado(texto, nivel) {
        const nodo = $('mapa-estado');
        nodo.textContent = texto;
        nodo.className = 'rep-mapa__estado' + (nivel ? ' rep-mapa__estado--' + nivel : '');
    }

    function coordenadasHuerto() {
        try {
            const huerto = JSON.parse(localStorage.getItem('datosHuerto')) || {};
            if (String(huerto.latitud || '').trim() === '' || String(huerto.longitud || '').trim() === '') return null;
            const lat = Number(String(huerto.latitud).replace(',', '.'));
            const lon = Number(String(huerto.longitud).replace(',', '.'));
            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
            return { lat: lat, lon: lon };
        } catch (error) {
            return null;
        }
    }

    // ===== MySQL: huertos de los dueños con pedidos pendientes =====
    // Los datos vienen de la base junto con los pedidos (copia local "pedidos")
    function dibujarHuertos() {
        if (!mapa) return;
        if (!capaHuertos) capaHuertos = L.layerGroup().addTo(mapa);
        capaHuertos.clearLayers();

        let pedidos = [];
        try {
            pedidos = JSON.parse(localStorage.getItem('pedidos')) || [];
        } catch (error) {
            pedidos = [];
        }

        const vistos = {};
        pedidos.forEach(function (p) {
            if (p.entregado || typeof p.huertoLat !== 'number' || typeof p.huertoLon !== 'number') return;
            if (vistos[p.duenoId]) return;   // un punto por huerto
            vistos[p.duenoId] = true;

            L.circleMarker([p.huertoLat, p.huertoLon], {
                radius: 7,
                color: '#fff',
                weight: 2,
                fillColor: '#3a973a',
                fillOpacity: 1
            }).addTo(capaHuertos)
              .bindTooltip('Huerto' + (p.huertoNombre ? ': ' + p.huertoNombre : '') +
                           (p.duenoNombre ? ' (' + p.duenoNombre + ')' : ''));
        });
    }

    // ===== Pines =====
    function crearIcono(estadoPedido) {
        return L.divIcon({
            className: 'rep-pin rep-pin--' + estadoPedido,
            html: '<i class="bi bi-geo-alt-fill"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -28]
        });
    }

    function crearPopup(entrega) {
        const caja = document.createElement('div');
        caja.className = 'rep-popup';

        const titulo = document.createElement('strong');
        titulo.textContent = entrega.titulo;
        caja.appendChild(titulo);

        const cliente = document.createElement('div');
        cliente.className = 'rep-popup__cliente';
        cliente.textContent = entrega.cliente;
        caja.appendChild(cliente);

        if (entrega.direccion) {
            const direccion = document.createElement('div');
            direccion.className = 'rep-popup__direccion';
            direccion.textContent = entrega.direccion;
            caja.appendChild(direccion);
        }

        const enlace = document.createElement('a');
        enlace.className = 'rep-popup__enlace';
        enlace.href = urlComoLlegar(entrega.lat, entrega.lon);
        enlace.target = '_blank';
        enlace.rel = 'noopener';
        enlace.textContent = 'Cómo llegar';
        caja.appendChild(enlace);

        return caja;
    }

    // Ajusta el mapa para que se vean todas las entregas (y al repartidor)
    function ajustarVista() {
        if (!mapa) return;
        const puntos = Object.keys(pines).map(function (id) { return pines[id].getLatLng(); });
        if (posicion) puntos.push(L.latLng(posicion.lat, posicion.lon));

        if (puntos.length === 0) return;
        if (puntos.length === 1) {
            mapa.setView(puntos[0], 16);
        } else {
            mapa.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: ZOOM_ENFOQUE });
        }
    }

    // entregas: [{ id, lat, lon, estado, titulo, cliente, direccion }]
    function actualizar(entregas) {
        $('mapa-cuenta').textContent = entregas.length + (entregas.length === 1 ? ' entrega' : ' entregas');
        if (!mapa) return;

        dibujarHuertos();   // ===== MySQL: puntos verdes de los huertos =====

        // Si nada cambió, no se redibuja (así no se cierra la ventanita abierta)
        const firma = entregas.map(function (e) {
            return [e.id, e.estado, e.lat, e.lon].join(':');
        }).join('|');
        if (firma === firmaPines) return;
        firmaPines = firma;

        capaPines.clearLayers();
        Object.keys(pines).forEach(function (id) { delete pines[id]; });

        entregas.forEach(function (entrega) {
            const pin = L.marker([entrega.lat, entrega.lon], { icon: crearIcono(entrega.estado) });
            pin.bindPopup(crearPopup(entrega));
            pin.addTo(capaPines);
            pines[entrega.id] = pin;
        });

        ajustarVista();

        if (vigilante === null) {
            if (entregas.length === 0) {
                estado('No hay entregas pendientes con ubicación en el mapa.', 'aviso');
            } else {
                estado(TEXTO_BASE, '');
            }
        }
    }

    // Centra el mapa en una entrega y abre su ventanita
    function enfocar(id) {
        const pin = pines[id];
        if (!mapa || !pin) return;
        mapa.setView(pin.getLatLng(), Math.max(mapa.getZoom(), ZOOM_ENFOQUE));
        pin.openPopup();
        $('mapa-reparto').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ===== Ubicación del repartidor (en vivo) =====
    function dibujarPosicion() {
        const centro = [posicion.lat, posicion.lon];

        if (!marcaPosicion) {
            circuloPosicion = L.circle(centro, {
                radius: posicion.precision,
                color: '#1a73e8',
                weight: 1,
                fillOpacity: 0.1
            }).addTo(mapa);
            marcaPosicion = L.circleMarker(centro, {
                radius: 8,
                color: '#fff',
                weight: 3,
                fillColor: '#1a73e8',
                fillOpacity: 1
            }).addTo(mapa).bindTooltip('Tú');
        } else {
            circuloPosicion.setLatLng(centro).setRadius(posicion.precision);
            marcaPosicion.setLatLng(centro);
        }
    }

    function textoPrecision(metros) {
        const m = Math.round(metros);
        if (metros <= 20) return 'Tu ubicación en vivo (±' + m + ' m).';
        if (metros <= 50) return 'Tu ubicación en vivo (±' + m + ' m, precisión aceptable).';
        return 'Tu ubicación en vivo (±' + m + ' m, precisión baja).';
    }

    // ===== Compartir la ubicación con el panel del administrador =====
    // (por ahora en el navegador; con MySQL será una petición al servidor)
    function guardarUbicacion() {
        try {
            localStorage.setItem(CLAVE_UBICACION, JSON.stringify({
                lat: posicion.lat,
                lon: posicion.lon,
                precision: Math.round(posicion.precision),
                nombre: sessionStorage.getItem('nombreUsuario') || 'Repartidor',
                hora: Date.now()
            }));
        } catch (error) {
            // Si no se puede guardar, el mapa del repartidor sigue funcionando
        }

        // ===== MySQL: mandar a la base (máximo cada 10 segundos) =====
        const ahora = Date.now();
        if (typeof guardarUbicacionBD === 'function' && ahora - ultimoEnvio >= ENVIO_CADA) {
            ultimoEnvio = ahora;
            guardarUbicacionBD(posicion.lat, posicion.lon, Math.round(posicion.precision));
        }
    }

    function borrarUbicacion() {
        try {
            localStorage.removeItem(CLAVE_UBICACION);
        } catch (error) {
            // Nada que hacer si el navegador no permite borrar
        }

        // ===== MySQL: marcar la ubicación como inactiva en la base =====
        if (typeof borrarUbicacionBD === 'function') {
            borrarUbicacionBD();
        }
        ultimoEnvio = 0;
    }

    // Al salir de la página (cerrar sesión, cerrar la pestaña, recargar) el seguimiento
    // se detiene, así que también se borra la ubicación compartida
    window.addEventListener('pagehide', borrarUbicacion);

    function iniciarSeguimiento() {
        if (!navigator.geolocation) {
            estado('Tu navegador no permite obtener la ubicación.', 'error');
            return;
        }

        const boton = $('btn-mi-ubicacion');
        boton.classList.add('rep-btn-mapa--activo');
        boton.querySelector('span').textContent = 'Detener';
        estado('Buscando tu ubicación...', 'aviso');

        let primera = true;

        vigilante = navigator.geolocation.watchPosition(
            function (pos) {
                posicion = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy };
                dibujarPosicion();
                guardarUbicacion();
                estado(textoPrecision(posicion.precision), posicion.precision <= 50 ? 'ok' : 'aviso');

                if (primera) {
                    primera = false;
                    ajustarVista();
                }

                // Actualiza las distancias solo si se movió lo suficiente
                if (!ultimaNotificada ||
                    distanciaEntre(ultimaNotificada.lat, ultimaNotificada.lon, posicion.lat, posicion.lon) > MOVIMIENTO_MINIMO) {
                    ultimaNotificada = { lat: posicion.lat, lon: posicion.lon };
                    alCambiarPosicion();
                }
            },
            function (error) {
                if (error.code === 1) {
                    detenerSeguimiento();
                    estado('No diste permiso para usar tu ubicación. Actívalo en el navegador.', 'error');
                } else {
                    estado('No se pudo obtener tu ubicación. Sigo intentando...', 'aviso');
                }
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
    }

    function detenerSeguimiento() {
        if (vigilante !== null) {
            navigator.geolocation.clearWatch(vigilante);
            vigilante = null;
        }
        if (mapa) {
            if (marcaPosicion) { mapa.removeLayer(marcaPosicion); marcaPosicion = null; }
            if (circuloPosicion) { mapa.removeLayer(circuloPosicion); circuloPosicion = null; }
        }
        posicion = null;
        borrarUbicacion();
        ultimaNotificada = null;

        const boton = $('btn-mi-ubicacion');
        boton.classList.remove('rep-btn-mapa--activo');
        boton.querySelector('span').textContent = 'Mi ubicación';
        estado(TEXTO_BASE, '');
        alCambiarPosicion();
    }

    // ===== Crear el mapa =====
    function iniciar(opciones) {
        if (opciones && opciones.alCambiarPosicion) {
            alCambiarPosicion = opciones.alCambiarPosicion;
        }

        if (!hayMapa) {
            estado('No se pudo cargar el mapa. Revisa tu conexión. Los botones Cómo llegar siguen funcionando.', 'error');
            $('btn-mi-ubicacion').disabled = true;
            $('btn-ver-todas').disabled = true;
            return;
        }

        // MySQL: el repartidor no tiene huerto propio; los huertos de los dueños
        // se dibujan con dibujarHuertos(), así que aquí ya no se usa datosHuerto
        const huerto = null;   // antes: coordenadasHuerto()
        const centro = huerto || UBICACION_DEFAULT;

        mapa = L.map('mapa-reparto').setView([centro.lat, centro.lon], ZOOM_INICIAL);

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

        capaPines = L.layerGroup().addTo(mapa);

        // Punto verde de referencia: el huerto
        if (huerto) {
            L.circleMarker([huerto.lat, huerto.lon], {
                radius: 7,
                color: '#fff',
                weight: 2,
                fillColor: '#3a973a',
                fillOpacity: 1
            }).addTo(mapa).bindTooltip('Huerto');
        }

        // ===== Final reconstruido (faltaba en el archivo) =====

        // Botón: Mi ubicación (activa o detiene el seguimiento en vivo)
        $('btn-mi-ubicacion').addEventListener('click', function () {
            if (vigilante === null) {
                iniciarSeguimiento();
            } else {
                detenerSeguimiento();
            }
        });

        // Botón: Ver todas (ajusta el mapa a todas las entregas)
        $('btn-ver-todas').addEventListener('click', function () {
            ajustarVista();
        });

        // El mapa necesita recalcular su tamaño cuando termina de cargar la página
        setTimeout(function () { mapa.invalidateSize(); }, 250);
    }

    // ===== Lo que usa repartidor.js =====
    return {
        iniciar: iniciar,
        actualizar: actualizar,
        enfocar: enfocar,
        distancia: distancia,
        distanciaEntre: distanciaEntre,
        urlComoLlegar: urlComoLlegar,
        urlRuta: urlRuta,
        posicion: function () { return posicion; }
    };
})();