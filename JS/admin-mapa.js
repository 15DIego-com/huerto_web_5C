// Mapa del administrador: huertos, entregas y ubicación del repartidor.
// Se engancha solo a la pestaña "Mapa" de admin.html (no hay que tocar admin.js).
(function () {
    'use strict';

    const panel = document.getElementById('panel-mapa');
    if (!panel) return;

    const hayMapa = typeof L !== 'undefined';

    // Centro del mapa si todavía no hay nada registrado (aproximada del ITSOEH)
    const UBICACION_DEFAULT = { lat: 20.2336, lon: -99.2119 };
    const ZOOM_INICIAL = 13;
    const MINUTOS_VIGENTE = 5;      // después de esto la ubicación del repartidor se marca como vieja
    const REFRESCO = 30000;         // cada cuánto se actualiza "hace N min"

    const $ = function (id) { return document.getElementById(id); };

    let mapa = null;
    const capas = {};               // huertos, pendientes, entregadas, repartidor
    let firmaDatos = '';
    let yaAjustado = false;

    // ===== MySQL: repartidores que vienen de la base (null = aún no llegan) =====
    let repartidoresBD = null;

    // ===== Lectura de datos guardados =====
    function leer(clave, porDefecto) {
        try {
            const datos = JSON.parse(localStorage.getItem(clave));
            return datos === null || datos === undefined ? porDefecto : datos;
        } catch (error) {
            return porDefecto;
        }
    }

    function aNumero(valor) {
        if (valor === undefined || valor === null || String(valor).trim() === '') return null;
        const numero = Number(String(valor).replace(',', '.'));
        return isNaN(numero) ? null : numero;
    }

    function coordenadasValidas(lat, lon) {
        return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    }

    // ===== Fechas y estados de los pedidos =====
    function aIso(fecha) {
        return fecha.getFullYear() + '-' +
            String(fecha.getMonth() + 1).padStart(2, '0') + '-' +
            String(fecha.getDate()).padStart(2, '0');
    }

    function hoyIso() {
        return aIso(new Date());
    }

    function mananaIso() {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() + 1);
        return aIso(fecha);
    }

    function etiquetaFecha(iso) {
        if (!iso) return 'Sin fecha';
        if (iso === hoyIso()) return 'Hoy';
        if (iso === mananaIso()) return 'Mañana';
        const partes = iso.split('-');
        return partes[2] + '/' + partes[1] + '/' + partes[0];
    }

    function estadoPedido(pedido) {
        if (pedido.entregado) return 'entregado';
        if (!pedido.fecha) return 'sinfecha';
        if (pedido.fecha < hoyIso()) return 'atrasado';
        if (pedido.fecha === hoyIso()) return 'hoy';
        if (pedido.fecha === mananaIso()) return 'manana';
        return 'programado';
    }

    const TEXTO_ESTADO = {
        atrasado: 'Atrasada',
        hoy: 'Para hoy',
        manana: 'Mañana',
        programado: 'Programada',
        sinfecha: 'Sin fecha',
        entregado: 'Entregada'
    };

    function hace(marca) {
        const minutos = Math.floor((Date.now() - marca) / 60000);
        if (minutos < 1) return 'hace menos de 1 min';
        if (minutos < 60) return 'hace ' + minutos + ' min';
        return 'hace ' + Math.floor(minutos / 60) + ' h';
    }

    // ===== Datos para el mapa =====
    function leerHuertos() {
        // ===== MySQL: todos los huertos de los dueños (admin.js los trae de la base) =====
        const usuariosBD = leer('usuariosHuerto', []);
        if (Array.isArray(usuariosBD) && usuariosBD.length > 0) {
            return usuariosBD
                .filter(function (u) { return u.huerto; })
                .map(function (u) {
                    const h = u.huerto;
                    return {
                        lat: aNumero(h.latitud),
                        lon: aNumero(h.longitud),
                        nombre: h.nombre || 'Huerto',
                        dueno: u.nombre,
                        direccion: [h.calle, h.municipio, h.estado].filter(Boolean).join(', ') ||
                                   h.ubicacion || '',
                        cultivos: h.cultivo || '',
                        medidas: h.medidas || '',
                        precision: aNumero(h.precision)
                    };
                })
                .filter(function (h) { return coordenadasValidas(h.lat, h.lon); });
        }

        // Respaldo: lo que hay guardado en este navegador (antes de que llegue la base)
        const huerto = leer('datosHuerto', {});
        const lat = aNumero(huerto.latitud);
        const lon = aNumero(huerto.longitud);
        if (!coordenadasValidas(lat, lon)) return [];

        const usuarios = leer('usuariosHuerto', []);
        const dueno = Array.isArray(usuarios) ? usuarios.find(function (u) { return u.conHuerto; }) : null;
        const cultivos = huerto.cultivo !== undefined ? huerto.cultivo : huerto.cultivos;

        return [{
            lat: lat,
            lon: lon,
            nombre: huerto.nombre || 'Huerto',
            dueno: dueno ? dueno.nombre : '',
            direccion: [huerto.calle, huerto.municipio, huerto.estado].filter(Boolean).join(', ') ||
                       huerto.ubicacion || '',
            cultivos: cultivos || '',
            medidas: huerto.medidas || '',
            precision: aNumero(huerto.precision)
        }];
    }

    function leerPedidos() {
        const pedidos = leer('pedidos', []);
        if (!Array.isArray(pedidos)) return [];
        return pedidos.filter(function (pedido) {
            return typeof pedido.latitud === 'number' && typeof pedido.longitud === 'number';
        });
    }

    function leerRepartidor() {
        const datos = leer('ubicacionRepartidor', null);
        if (!datos || typeof datos.lat !== 'number' || typeof datos.lon !== 'number') return null;
        return datos;
    }

    // ===== MySQL: lista de repartidores (de la base, o el del navegador como respaldo) =====
    function leerRepartidores() {
        if (repartidoresBD !== null) return repartidoresBD;
        const local = leerRepartidor();
        return local ? [local] : [];
    }

    // ===== MySQL: traer la ubicación de los repartidores desde la base =====
    async function cargarRepartidoresBD() {
        if (typeof adminUbicacionRepartidores !== 'function') return;   // api.js no está cargado

        const respuesta = await adminUbicacionRepartidores();
        if (!respuesta.ok) return;   // sin servidor: se queda con lo del navegador

        repartidoresBD = respuesta.repartidores.map(function (r) {
            return {
                lat: Number(r.latitud),
                lon: Number(r.longitud),
                precision: r.precision_m !== null ? Math.round(Number(r.precision_m)) : 0,
                nombre: r.nombre || 'Repartidor',
                hora: Number(r.hora)
            };
        }).filter(function (r) { return coordenadasValidas(r.lat, r.lon); });

        if (mapa) {
            dibujarRepartidor();
            actualizarResumen();
        }
    }

    // ===== Marcadores y ventanitas =====
    function iconoInsignia(clase, icono) {
        return L.divIcon({
            className: 'adm-pin adm-pin--insignia ' + clase,
            html: '<span><i class="bi ' + icono + '"></i></span>',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -18]
        });
    }

    function iconoPedido(estado) {
        return L.divIcon({
            className: 'adm-pin adm-pin--pedido adm-pin--' + estado,
            html: '<i class="bi bi-geo-alt-fill"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -28]
        });
    }

    function crearPopup(titulo, lineas, lat, lon) {
        const caja = document.createElement('div');
        caja.className = 'adm-popup';

        const encabezado = document.createElement('strong');
        encabezado.textContent = titulo;
        caja.appendChild(encabezado);

        lineas.filter(Boolean).forEach(function (texto) {
            const linea = document.createElement('div');
            linea.className = 'adm-popup__linea';
            linea.textContent = texto;
            caja.appendChild(linea);
        });

        const enlace = document.createElement('a');
        enlace.className = 'adm-popup__enlace';
        enlace.href = 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon;
        enlace.target = '_blank';
        enlace.rel = 'noopener';
        enlace.textContent = 'Abrir en Google Maps';
        caja.appendChild(enlace);

        return caja;
    }

    // ===== Dibujar los datos en el mapa =====
    function dibujarHuertosYPedidos() {
        const huertos = leerHuertos();
        const pedidos = leerPedidos();

        // Si nada cambió, no se redibuja (así no se cierra la ventanita abierta)
        const firma = JSON.stringify([huertos, pedidos.map(function (p) {
            return [p.id, p.latitud, p.longitud, p.entregado, p.fecha];
        })]);
        if (firma === firmaDatos) return;
        firmaDatos = firma;

        capas.huertos.clearLayers();
        capas.pendientes.clearLayers();
        capas.entregadas.clearLayers();

        huertos.forEach(function (huerto) {
            const lineas = [
                huerto.dueno ? 'Dueño: ' + huerto.dueno : '',
                huerto.direccion,
                huerto.cultivos ? 'Cultivos: ' + huerto.cultivos : '',
                huerto.medidas ? 'Medidas: ' + huerto.medidas : '',
                'Coordenadas: ' + huerto.lat.toFixed(6) + ', ' + huerto.lon.toFixed(6) +
                    (huerto.precision > 0 ? ' (±' + Math.round(huerto.precision) + ' m)' : '')
            ];
            L.marker([huerto.lat, huerto.lon], { icon: iconoInsignia('adm-pin--huerto', 'bi-flower1') })
                .bindPopup(crearPopup(huerto.nombre, lineas, huerto.lat, huerto.lon))
                .addTo(capas.huertos);
        });

        let pendientes = 0;
        let entregadas = 0;

        pedidos.forEach(function (pedido) {
            const estado = estadoPedido(pedido);
            const destino = pedido.entregado ? capas.entregadas : capas.pendientes;
            if (pedido.entregado) entregadas++; else pendientes++;

            const lineas = [
                pedido.duenoNombre ? 'Dueño: ' + pedido.duenoNombre : '',
                'Cliente: ' + pedido.cliente,
                'Entrega: ' + etiquetaFecha(pedido.fecha) + ' · ' + TEXTO_ESTADO[estado],
                pedido.direccion
            ];
            L.marker([pedido.latitud, pedido.longitud], { icon: iconoPedido(estado) })
                .bindPopup(crearPopup(
                    pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad,
                    lineas, pedido.latitud, pedido.longitud))
                .addTo(destino);
        });

        $('cuenta-huertos').textContent = huertos.length;
        $('cuenta-pendientes').textContent = pendientes;
        $('cuenta-entregadas').textContent = entregadas;
    }

    // MySQL: dibuja a todos los repartidores
    function dibujarRepartidor() {
        capas.repartidor.clearLayers();
        const lista = leerRepartidores();
        $('cuenta-repartidor').textContent = lista.length;

        lista.forEach(function (datos) {
            const vigente = (Date.now() - datos.hora) <= MINUTOS_VIGENTE * 60000;
            const nombre = datos.nombre || 'Repartidor';

            if (vigente && datos.precision > 0) {
                L.circle([datos.lat, datos.lon], {
                    radius: datos.precision,
                    color: '#1a73e8',
                    weight: 1,
                    fillOpacity: 0.1
                }).addTo(capas.repartidor);
            }

            const lineas = [
                vigente ? 'Actualizado ' + hace(datos.hora)
                        : 'Última ubicación conocida (' + hace(datos.hora) + ')',
                datos.precision > 0 ? 'Precisión: ±' + datos.precision + ' m' : ''
            ];

            L.marker([datos.lat, datos.lon], {
                icon: iconoInsignia(vigente ? 'adm-pin--repartidor' : 'adm-pin--repartidor-viejo', 'bi-truck')
            })
                .bindPopup(crearPopup(nombre, lineas, datos.lat, datos.lon))
                .addTo(capas.repartidor);
        });
    }

    // Texto de resumen debajo del mapa
    function actualizarResumen() {
        const huertos = Number($('cuenta-huertos').textContent);
        const pendientes = Number($('cuenta-pendientes').textContent);
        const repartidores = leerRepartidores();

        if (huertos === 0 && pendientes === 0 && repartidores.length === 0 &&
            Number($('cuenta-entregadas').textContent) === 0) {
            $('mapa-admin-estado').textContent =
                'Aún no hay ubicaciones. Aparecerán aquí cuando los dueños marquen su huerto y sus pedidos.';
            return;
        }

        const partes = [
            huertos + (huertos === 1 ? ' huerto' : ' huertos'),
            pendientes + (pendientes === 1 ? ' entrega pendiente' : ' entregas pendientes')
        ];
        if (repartidores.length > 0) {
            const enLinea = repartidores.filter(function (r) {
                return (Date.now() - r.hora) <= MINUTOS_VIGENTE * 60000;
            }).length;
            if (enLinea === 0) {
                partes.push('repartidor sin señal reciente');
            } else {
                partes.push(enLinea === 1 ? 'repartidor en línea' : enLinea + ' repartidores en línea');
            }
        }
        $('mapa-admin-estado').textContent = partes.join(' · ');
    }

    function dibujar() {
        if (!mapa) return;
        dibujarHuertosYPedidos();
        dibujarRepartidor();
        actualizarResumen();

        // La primera vez que hay puntos, se ajusta la vista para verlos todos
        if (!yaAjustado && hayPuntos()) {
            yaAjustado = true;
            ajustarVista();
        }
    }

    // ===== Vista =====
    function puntosVisibles() {
        const puntos = [];
        Object.keys(capas).forEach(function (nombre) {
            if (!mapa.hasLayer(capas[nombre])) return;
            capas[nombre].eachLayer(function (capa) {
                if (capa.getLatLng) puntos.push(capa.getLatLng());
            });
        });
        return puntos;
    }

    function hayPuntos() {
        return puntosVisibles().length > 0;
    }

    function ajustarVista() {
        if (!mapa) return;
        const puntos = puntosVisibles();
        if (puntos.length === 0) return;
        if (puntos.length === 1) {
            mapa.setView(puntos[0], 16);
        } else {
            mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 17 });
        }
    }

    // ===== Crear el mapa (la primera vez que se abre la pestaña) =====
    function crearMapa() {
        mapa = L.map('mapa-admin').setView([UBICACION_DEFAULT.lat, UBICACION_DEFAULT.lon], ZOOM_INICIAL);

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

        ['huertos', 'pendientes', 'entregadas', 'repartidor'].forEach(function (nombre) {
            capas[nombre] = L.layerGroup();
        });

        // Los filtros (chips) muestran u ocultan cada tipo de marcador
        panel.querySelectorAll('[data-capa]').forEach(function (casilla) {
            const capa = capas[casilla.dataset.capa];
            if (casilla.checked) mapa.addLayer(capa);

            casilla.addEventListener('change', function () {
                if (casilla.checked) {
                    mapa.addLayer(capa);
                } else {
                    mapa.removeLayer(capa);
                }
            });
        });

        $('btn-ver-todo').addEventListener('click', ajustarVista);

        // Mantener "hace N min" al día mientras la pestaña está abierta
        setInterval(function () {
            if (!panel.hidden) {
                dibujarRepartidor();
                actualizarResumen();
                cargarRepartidoresBD(); // MySQL: traer la ubicación nueva de la base
            }
        }, REFRESCO);
    }

    // ===== Al abrir la pestaña =====
    function mostrar() {
        if (!hayMapa) {
            $('mapa-admin-estado').textContent =
                'No se pudo cargar el mapa. Revisa tu conexión a internet.';
            return;
        }
        if (!mapa) crearMapa();
        mapa.invalidateSize();   // el mapa estaba oculto: recalcula su tamaño
        dibujar();
        cargarRepartidoresBD(); // MySQL: ubicación de los repartidores desde la base
    }

    const pestana = document.querySelector('.admin-tab[data-panel="mapa"]');
    if (pestana) pestana.addEventListener('click', mostrar);

    // Si algo cambia en otra pestaña del navegador, el mapa se actualiza solo
    window.addEventListener('storage', function (evento) {
        const claves = ['pedidos', 'datosHuerto', 'usuariosHuerto', 'ubicacionRepartidor'];
        if (mapa && claves.indexOf(evento.key) !== -1) dibujar();
    });

    // MySQL: cuando admin.js recarga los datos de la base, se redibuja el mapa
    document.addEventListener('datos-admin-actualizados', function () {
        if (mapa) dibujar();
    });
})();