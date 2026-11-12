// ===== Proteger la página: si no hay sesión, regresar al login =====
if (sessionStorage.getItem('sesionActiva') !== 'true') {
    window.location.href = 'login.html';
}

// ===== Datos base =====
const CLAVE_HUERTO = 'datosHuerto';

// Centro del mapa cuando todavía no hay ubicación (aproximada del ITSOEH)
const UBICACION_DEFAULT = { lat: 20.2336, lon: -99.2119 };
const ZOOM_INICIAL = 13;
const ZOOM_PIN = 18;

// Precisión del GPS (en metros)
const PRECISION_BUENA = 20;
const PRECISION_ACEPTABLE = 50;
const TIEMPO_GPS = 15000;   // tiempo máximo para mejorar la precisión

const hayMapa = typeof L !== 'undefined';

const formularioHuerto = document.getElementById('form-huerto');
const mensajeFormulario = document.getElementById('mensaje-formulario');
const estadoMapa = document.getElementById('mapa-estado');
const botonBuscar = document.getElementById('btn-buscar');
const botonMiUbicacion = document.getElementById('btn-mi-ubicacion');

// Estado del mapa
let mapa = null;
let pin = null;
let circulo = null;
let precisionMetros = null;      // precisión del último GPS (null si se puso a mano)
let detalleDireccion = { calle: '', municipio: '', estado: '' };
let tokenDireccion = 0;          // para ignorar respuestas viejas del servicio de direcciones
let vigilanteGps = null;

// ===== Utilidades =====
function valor(id) {
    return document.getElementById(id).value.trim();
}

function texto(dato) {
    return dato === undefined || dato === null ? '' : String(dato);
}

function mostrarMensaje(mensaje, tipo) {
    mensajeFormulario.textContent = mensaje;
    mensajeFormulario.className = 'mensaje-formulario mensaje-formulario--' + tipo;
}

function mostrarEstadoMapa(mensaje, nivel) {
    estadoMapa.textContent = mensaje;
    estadoMapa.className = 'mapa-estado' + (nivel ? ' mapa-estado--' + nivel : '');
}

function leerGuardado() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_HUERTO)) || {};
    } catch (error) {
        return {};
    }
}

// ===== Si ya hay un huerto guardado, llenar el formulario =====
const guardado = leerGuardado();
document.getElementById('nombre-huerto').value = texto(guardado.nombre);
document.getElementById('ubicacion').value     = texto(guardado.ubicacion);
document.getElementById('codigo-postal').value = texto(guardado.cp || guardado.codigoPostal);
document.getElementById('medidas').value       = texto(guardado.medidas);
document.getElementById('cultivos').value      = texto(guardado.cultivo !== undefined ? guardado.cultivo : guardado.cultivos);
document.getElementById('latitud').value       = texto(guardado.latitud);
document.getElementById('longitud').value      = texto(guardado.longitud);

detalleDireccion = {
    calle: texto(guardado.calle),
    municipio: texto(guardado.municipio),
    estado: texto(guardado.estado)
};

// ===== El código postal solo acepta números =====
document.getElementById('codigo-postal').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '');
});

// ===== Coordenadas =====
function leerCoordenadas() {
    const lat = Number(valor('latitud').replace(',', '.'));
    const lon = Number(valor('longitud').replace(',', '.'));
    const validas = valor('latitud') !== '' && valor('longitud') !== '' &&
                    !isNaN(lat) && !isNaN(lon) &&
                    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    return validas ? { lat: lat, lon: lon } : null;
}

// ===== Validación: devuelve un texto de error o '' si todo está bien =====
function validar(datos) {
    if (datos.nombre === '') {
        return 'Escribe el nombre del huerto.';
    }
    if (!leerCoordenadas()) {
        return 'Marca la ubicación de tu huerto en el mapa (toca el mapa, arrastra el pin o usa tu ubicación).';
    }
    if (datos.ubicacion === '') {
        return 'Escribe la ubicación del huerto.';
    }
    if (!/^\d{5}$/.test(datos.codigoPostal)) {
        return 'El código postal debe tener 5 dígitos.';
    }
    return '';
}

// ===== Texto según la precisión del GPS =====
function describirPrecision(metros) {
    const m = Math.round(metros);
    if (metros <= PRECISION_BUENA) {
        mostrarEstadoMapa('Ubicación con buena precisión (±' + m + ' m). Puedes ajustar el pin si hace falta.', 'ok');
    } else if (metros <= PRECISION_ACEPTABLE) {
        mostrarEstadoMapa('Precisión aceptable (±' + m + ' m). Si puedes, arrastra el pin al punto exacto.', 'aviso');
    } else {
        mostrarEstadoMapa('Precisión baja (±' + m + ' m). Arrastra el pin al punto exacto de tu huerto.', 'aviso');
    }
}

// ===== Colocar el pin en el mapa =====
// opciones: { centrar: true/false, precision: metros o null, direccion: 'sobrescribir' | 'completar' | 'no' }
function colocarPin(lat, lon, opciones) {
    document.getElementById('latitud').value  = Number(lat).toFixed(6);
    document.getElementById('longitud').value = Number(lon).toFixed(6);
    precisionMetros = opciones.precision;

    if (hayMapa) {
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
        }
    }

    if (opciones.precision !== null) {
        describirPrecision(opciones.precision);
    } else if (opciones.direccion !== 'no' || opciones.centrar) {
        mostrarEstadoMapa('Ubicación fijada en el mapa. Arrastra el pin si necesitas ajustarla.', 'ok');
    }

    if (opciones.direccion !== 'no') {
        consultarDireccion(lat, lon, opciones.direccion);
    }
}

// ===== Llenar la dirección a partir de lo que devuelve el mapa =====
function aplicarDireccion(direccion, modo) {
    const calle = [direccion.road, direccion.house_number].filter(Boolean).join(' ');
    const colonia = direccion.suburb || direccion.neighbourhood || direccion.quarter ||
                    direccion.hamlet || direccion.village || '';
    const municipio = direccion.municipality || direccion.city || direccion.town ||
                      direccion.county || direccion.village || '';
    const estado = direccion.state || '';
    const cp = String(direccion.postcode || '').replace(/\D/g, '').slice(0, 5);

    detalleDireccion = { calle: calle, municipio: municipio, estado: estado };

    const textoDireccion = [calle, colonia, municipio, estado]
        .filter(function (parte, indice, lista) {
            return parte && lista.indexOf(parte) === indice;
        })
        .join(', ');

    const campoUbicacion = document.getElementById('ubicacion');
    const campoCp = document.getElementById('codigo-postal');

    if (textoDireccion && (modo === 'sobrescribir' || campoUbicacion.value.trim() === '')) {
        campoUbicacion.value = textoDireccion;
    }
    if (cp && (modo === 'sobrescribir' || campoCp.value.trim() === '')) {
        campoCp.value = cp;
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

        if (token !== tokenDireccion) return;   // llegó tarde: ya se movió el pin otra vez
        if (datos && datos.address) {
            aplicarDireccion(datos.address, modo);
            mostrarMensaje('Dirección completada con el mapa. Revísala y corrígela si hace falta.', 'exito');
        }
    } catch (error) {
        if (token !== tokenDireccion) return;
        mostrarMensaje('No se pudo completar la dirección automáticamente. Escríbela a mano.', 'error');
    }
}

// ===== Crear el mapa =====
function iniciarMapa() {
    const coords = leerCoordenadas();
    const centro = coords || UBICACION_DEFAULT;

    mapa = L.map('mapa').setView([centro.lat, centro.lon], coords ? ZOOM_PIN : ZOOM_INICIAL);

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

    // Tocar el mapa mueve el pin
    mapa.on('click', function (evento) {
        colocarPin(evento.latlng.lat, evento.latlng.lng,
                   { centrar: false, precision: null, direccion: 'sobrescribir' });
    });

    if (coords) {
        colocarPin(coords.lat, coords.lon, { centrar: true, precision: null, direccion: 'no' });
        mostrarEstadoMapa('Ubicación guardada. Arrastra el pin si necesitas ajustarla.', 'ok');
    }

    // El mapa necesita recalcular su tamaño cuando termina de cargar la página
    setTimeout(function () { mapa.invalidateSize(); }, 250);
}

if (hayMapa) {
    iniciarMapa();
} else {
    mostrarEstadoMapa('No se pudo cargar el mapa. Revisa tu conexión o escribe las coordenadas a mano.', 'error');
    botonBuscar.disabled = true;
    botonMiUbicacion.disabled = true;
}

// Si escribe las coordenadas a mano
function coordenadasEscritas() {
    const coords = leerCoordenadas();
    if (coords) {
        colocarPin(coords.lat, coords.lon, { centrar: true, precision: null, direccion: 'no' });
    }
}
document.getElementById('latitud').addEventListener('change', coordenadasEscritas);
document.getElementById('longitud').addEventListener('change', coordenadasEscritas);

// ===== Buscar la dirección escrita (Nominatim) =====
botonBuscar.addEventListener('click', async function () {
    const consulta = [valor('ubicacion'), valor('codigo-postal')].filter(Boolean).join(', ');

    if (consulta === '') {
        mostrarMensaje('Escribe una ubicación o código postal para buscar.', 'error');
        return;
    }

    botonBuscar.disabled = true;
    mostrarMensaje('Buscando...', 'exito');

    try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1' +
                    '&countrycodes=mx&accept-language=es&q=' + encodeURIComponent(consulta);
        const respuesta = await fetch(url);
        const resultados = await respuesta.json();

        if (resultados.length === 0) {
            mostrarMensaje('No se encontró esa dirección. Prueba con otra o toca el mapa para marcarla.', 'error');
        } else {
            const resultado = resultados[0];
            colocarPin(Number(resultado.lat), Number(resultado.lon),
                       { centrar: true, precision: null, direccion: 'no' });
            // Respeta lo que ya escribió: solo completa lo que falta
            aplicarDireccion(resultado.address || {}, 'completar');
            mostrarEstadoMapa('Dirección encontrada. Ajusta el pin al punto exacto de tu huerto.', 'aviso');
            mostrarMensaje('', 'exito');
        }
    } catch (error) {
        mostrarMensaje('No se pudo buscar la dirección. Revisa tu conexión.', 'error');
    } finally {
        botonBuscar.disabled = false;
    }
});

// ===== Usar el GPS del dispositivo (mejora la precisión unos segundos) =====
function detenerGps() {
    if (vigilanteGps !== null) {
        navigator.geolocation.clearWatch(vigilanteGps);
        vigilanteGps = null;
    }
    botonMiUbicacion.disabled = false;
}

botonMiUbicacion.addEventListener('click', function () {
    if (!navigator.geolocation) {
        mostrarMensaje('Tu navegador no permite obtener la ubicación.', 'error');
        return;
    }
    if (vigilanteGps !== null) return;

    let mejor = null;
    let limite = null;

    botonMiUbicacion.disabled = true;
    mostrarMensaje('', 'exito');
    mostrarEstadoMapa('Buscando tu ubicación...', 'aviso');

    function terminar() {
        clearTimeout(limite);
        detenerGps();
        if (!mejor) {
            mostrarEstadoMapa('No se pudo obtener tu ubicación. Toca el mapa para marcar tu huerto.', 'error');
            return;
        }
        colocarPin(mejor.lat, mejor.lon,
                   { centrar: true, precision: mejor.precision, direccion: 'sobrescribir' });
    }

    limite = setTimeout(terminar, TIEMPO_GPS);

    vigilanteGps = navigator.geolocation.watchPosition(
        function (posicion) {
            const precision = posicion.coords.accuracy;

            if (!mejor || precision < mejor.precision) {
                mejor = { lat: posicion.coords.latitude, lon: posicion.coords.longitude, precision: precision };
                // Vista previa mientras mejora
                colocarPin(mejor.lat, mejor.lon, { centrar: true, precision: precision, direccion: 'no' });
                mostrarEstadoMapa('Mejorando precisión... ±' + Math.round(precision) + ' m', 'aviso');
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
            clearTimeout(limite);
            detenerGps();
            if (error.code === 1) {
                mostrarMensaje('No diste permiso para usar tu ubicación. Actívalo en el navegador o toca el mapa.', 'error');
            } else {
                mostrarMensaje('No se pudo obtener tu ubicación. Toca el mapa para marcar tu huerto.', 'error');
            }
            mostrarEstadoMapa('Toca el mapa o arrastra el pin para marcar tu huerto.', '');
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: TIEMPO_GPS }
    );
});

// ===== MySQL: traer el huerto guardado en la base =====
async function cargarHuertoBD() {
    const respuesta = await obtenerHuerto();

    // Si no hay conexión o sesión en el servidor, se queda con lo local
    if (!respuesta.ok) return;

    const h = respuesta.huerto;

    if (!h) {
        // Este usuario aún no tiene huerto: formulario vacío
        localStorage.removeItem(CLAVE_HUERTO);
        ['nombre-huerto', 'ubicacion', 'codigo-postal', 'medidas', 'cultivos', 'latitud', 'longitud']
            .forEach(function (id) { document.getElementById(id).value = ''; });
        detalleDireccion = { calle: '', municipio: '', estado: '' };
        precisionMetros = null;

        if (hayMapa) {
            if (pin)     { mapa.removeLayer(pin);     pin = null; }
            if (circulo) { mapa.removeLayer(circulo); circulo = null; }
            mapa.setView([UBICACION_DEFAULT.lat, UBICACION_DEFAULT.lon], ZOOM_INICIAL);
        }
        mostrarEstadoMapa('Toca el mapa o arrastra el pin para marcar tu huerto.', '');
        return;
    }

    // Llenar el formulario con lo que hay en la base
    const ubicacionTexto = texto(h.ubicacion) ||
        [h.calle, h.municipio, h.estado].filter(Boolean).join(', ');

    document.getElementById('nombre-huerto').value = texto(h.nombre);
    document.getElementById('ubicacion').value     = ubicacionTexto;
    document.getElementById('codigo-postal').value = texto(h.codigo_postal);
    document.getElementById('medidas').value       = texto(h.medidas);
    document.getElementById('cultivos').value      = texto(h.tipo_cultivo);
    document.getElementById('latitud').value       = texto(h.latitud);
    document.getElementById('longitud').value      = texto(h.longitud);

    detalleDireccion = {
        calle: texto(h.calle),
        municipio: texto(h.municipio),
        estado: texto(h.estado)
    };

    const coords = leerCoordenadas();
    if (coords) {
        colocarPin(coords.lat, coords.lon, { centrar: true, precision: null, direccion: 'no' });
        mostrarEstadoMapa('Ubicación guardada. Arrastra el pin si necesitas ajustarla.', 'ok');
    }
    precisionMetros = h.precision_m !== null ? Number(h.precision_m) : null;

    // Copia local para que perfil, inicio y admin la sigan leyendo
    localStorage.setItem(CLAVE_HUERTO, JSON.stringify(Object.assign(leerGuardado(), {
        nombre:       texto(h.nombre),
        ubicacion:    ubicacionTexto,
        codigoPostal: texto(h.codigo_postal),
        cp:           texto(h.codigo_postal),
        medidas:      texto(h.medidas),
        cultivos:     texto(h.tipo_cultivo),
        cultivo:      texto(h.tipo_cultivo),
        latitud:      texto(h.latitud),
        longitud:     texto(h.longitud),
        calle:        detalleDireccion.calle,
        municipio:    detalleDireccion.municipio,
        estado:       detalleDireccion.estado,
        precision:    precisionMetros
    })));
}

// ===== Al presionar "Guardar" =====
formularioHuerto.addEventListener('submit', async function (evento) {   // MySQL: ahora es async
    evento.preventDefault();

    const datos = {
        nombre:       valor('nombre-huerto'),
        ubicacion:    valor('ubicacion'),
        codigoPostal: valor('codigo-postal'),
        medidas:      valor('medidas'),
        cultivos:     valor('cultivos'),
        latitud:      valor('latitud'),
        longitud:     valor('longitud')
    };

    const error = validar(datos);

    if (error !== '') {
        mostrarMensaje(error, 'error');
        return;
    }

    // Se mezcla con lo que ya había guardado (el perfil guarda ahí sus propios datos)
    const huerto = Object.assign({}, leerGuardado(), datos, {
        // Nombres que leen el perfil, Inicio y el panel del administrador
        cultivo:   datos.cultivos,
        cp:        datos.codigoPostal,
        calle:     detalleDireccion.calle,
        municipio: detalleDireccion.municipio,
        estado:    detalleDireccion.estado,
        precision: precisionMetros
    });

    localStorage.setItem(CLAVE_HUERTO, JSON.stringify(huerto));

    // ===== MySQL: guardar también en la base =====
    mostrarMensaje('Guardando...', 'exito');
    const coords = leerCoordenadas();

    const respuesta = await guardarHuertoBD({
        nombre:    datos.nombre,
        ubicacion: datos.ubicacion,
        cp:        datos.codigoPostal,
        medidas:   datos.medidas,
        cultivo:   datos.cultivos,
        latitud:   coords.lat,
        longitud:  coords.lon,
        calle:     detalleDireccion.calle,
        municipio: detalleDireccion.municipio,
        estado:    detalleDireccion.estado,
        precision: precisionMetros
    });

    if (!respuesta.ok) {
        mostrarMensaje('No se pudo guardar en la base de datos: ' + respuesta.mensaje, 'error');
        return;
    }

    mostrarMensaje('Huerto guardado correctamente.', 'exito');

    // Regresar al perfil para ver los datos guardados
    setTimeout(function () {
        window.location.href = 'perfil.html';
    }, 900);
});

// ===== MySQL: al abrir la página, cargar el huerto desde la base =====
cargarHuertoBD();