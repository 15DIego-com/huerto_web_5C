(function () {
    'use strict';

    // ===== Proteger la página: solo entra el Repartidor =====
    if (sessionStorage.getItem('sesionActiva') !== 'true' ||
        sessionStorage.getItem('tipoUsuario') !== 'Repartidor') {
        window.location.href = 'login.html';
        return;
    }

    // ===== Datos base =====
    const CLAVE_PEDIDOS = 'pedidos';
    const MAX_PARADAS = 10;           // límite de paradas en una ruta de Google Maps
    const ACTUALIZAR_CADA = 60000;    // MySQL: cada cuánto se consulta la base (1 minuto)
    const $ = function (id) { return document.getElementById(id); };

    // El mapa vive en repartidor-mapa.js
    const mapa = window.MapaReparto || null;

    let filtroActual = 'pendiente';

    // ===== Fechas =====
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

    function formatoFecha(iso) {
        const partes = iso.split('-');
        return partes[2] + '/' + partes[1] + '/' + partes[0];
    }

    // Días entre hoy y la fecha (negativo = ya pasó)
    function diasHasta(iso) {
        const partes = iso.split('-');
        const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
        const ahora = new Date();
        const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        return Math.round((fecha - hoy) / 86400000);
    }

    function textoDias(iso) {
        const dias = diasHasta(iso);
        if (dias === -1) return 'hace 1 día';
        if (dias < 0) return 'hace ' + (-dias) + ' días';
        return 'en ' + dias + ' días';
    }

    // ===== Guardado en el navegador (luego se cambiará por MySQL) =====
    // MySQL: ahora es una copia local; los datos reales están en la base
    function leerPedidos() {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE_PEDIDOS));
            return Array.isArray(datos) ? datos : [];
        } catch (error) {
            return [];
        }
    }

    function guardarPedidos(pedidos) {
        localStorage.setItem(CLAVE_PEDIDOS, JSON.stringify(pedidos));
    }

    // ===== MySQL: traer todos los pedidos desde la base =====
    async function cargarPedidosBD() {
        if (typeof listarPedidos !== 'function') return;   // api.js no está cargado

        const respuesta = await listarPedidos();

        // Si no hay conexión o sesión en el servidor, se queda con lo local
        if (!respuesta.ok) return;

        guardarPedidos(respuesta.pedidos.map(pedidoDesdeBD));
        dibujar();
    }

    // ===== Estado de un pedido según su fecha =====
    // entregado | atrasado | hoy | manana | programado | sinfecha
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

    const CLASE_TARJETA = {
        atrasado: 'entrega--atrasada',
        hoy: 'entrega--hoy',
        manana: 'entrega--manana',
        programado: 'entrega--programada',
        sinfecha: 'entrega--programada',
        entregado: 'entrega--entregada'
    };

    // Secciones de la vista "Pendientes", en este orden
    const ORDEN_GRUPOS = [
        ['atrasado', 'Atrasadas'],
        ['hoy', 'Para hoy'],
        ['manana', 'Mañana'],
        ['programado', 'Próximas'],
        ['sinfecha', 'Sin fecha']
    ];

    // ===== Ubicación de entrega =====
    function tieneUbicacion(pedido) {
        return typeof pedido.latitud === 'number' && typeof pedido.longitud === 'number';
    }

    // Distancia desde el repartidor en metros (null si no se conoce su ubicación)
    function distanciaPedido(pedido) {
        if (!mapa || !tieneUbicacion(pedido)) return null;
        return mapa.distancia(pedido.latitud, pedido.longitud);
    }

    function textoDistancia(metros) {
        if (metros < 1000) {
            return 'A ≈ ' + Math.max(10, Math.round(metros / 10) * 10) + ' m de ti';
        }
        return 'A ≈ ' + (metros / 1000).toFixed(1) + ' km de ti';
    }

    // ===== Utilidades de pantalla =====
    function el(etiqueta, clase, texto) {
        const nodo = document.createElement(etiqueta);
        if (clase) nodo.className = clase;
        if (texto !== undefined) nodo.textContent = texto;
        return nodo;
    }

    function dato(iconoClase, texto, extra) {
        const fila = el('p', 'entrega__dato' + (extra ? ' ' + extra : ''));
        const i = document.createElement('i');
        i.className = 'bi ' + iconoClase;
        fila.appendChild(i);
        fila.appendChild(el('span', '', texto));
        return fila;
    }

    function conIcono(nodo, iconoClase, texto) {
        const i = document.createElement('i');
        i.className = 'bi ' + iconoClase;
        nodo.appendChild(i);
        nodo.appendChild(el('span', '', texto));
        return nodo;
    }

    let temporizadorAviso;
    function mostrarAviso(mensaje) {
        const aviso = $('aviso');
        aviso.textContent = mensaje;
        aviso.classList.add('aviso--visible');
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(function () {
            aviso.classList.remove('aviso--visible');
        }, 2600);
    }

    // Pendientes primero y por fecha; con la misma fecha, las más cercanas primero
    function ordenar(pedidos) {
        return pedidos.slice().sort(function (a, b) {
            if (a.entregado !== b.entregado) return a.entregado ? 1 : -1;
            const porFecha = (a.fecha || '9999-99-99').localeCompare(b.fecha || '9999-99-99');
            if (porFecha !== 0) return porFecha;
            const da = distanciaPedido(a);
            const db = distanciaPedido(b);
            if (da !== null && db !== null) return da - db;
            return 0;
        });
    }

    // Texto de la fila de fecha
    function textoEntrega(pedido, estado) {
        if (!pedido.fecha) return 'Sin fecha de entrega';
        if (estado === 'hoy') return 'Entrega: hoy';
        if (estado === 'manana') return 'Entrega: mañana';
        if (estado === 'entregado') return 'Entrega: ' + formatoFecha(pedido.fecha);
        return 'Entrega: ' + formatoFecha(pedido.fecha) + ' · ' + textoDias(pedido.fecha);
    }

    // ===== Crear la tarjeta de una entrega =====
    function crearEntrega(pedido) {
        const estado = estadoPedido(pedido);
        const item = el('li', 'entrega ' + CLASE_TARJETA[estado]);

        const cabecera = el('div', 'entrega__cabecera');
        cabecera.appendChild(el('h3', 'entrega__producto',
            pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad));
        cabecera.appendChild(el('span', 'insignia insignia--' + estado, TEXTO_ESTADO[estado]));

        const datos = el('div', 'entrega__datos');
        datos.appendChild(dato('bi-person', pedido.cliente));
        datos.appendChild(dato('bi-calendar-event', textoEntrega(pedido, estado),
            estado === 'atrasado' ? 'entrega__dato--atrasada' : ''));

        // Dónde entregar y a qué distancia está
        if (tieneUbicacion(pedido)) {
            datos.appendChild(dato('bi-geo-alt', pedido.direccion || 'Punto marcado en el mapa'));
            const distancia = distanciaPedido(pedido);
            if (distancia !== null && !pedido.entregado) {
                datos.appendChild(dato('bi-compass', textoDistancia(distancia), 'entrega__dato--distancia'));
            }
        } else if (!pedido.entregado) {
            datos.appendChild(dato('bi-geo-alt', 'Sin ubicación de entrega', 'entrega__dato--sin'));
        }

        item.appendChild(cabecera);
        item.appendChild(datos);

        // Botones de navegación
        if (!pedido.entregado && tieneUbicacion(pedido) && mapa) {
            const acciones = el('div', 'entrega__acciones');

            const comoLlegar = el('a', 'entrega__boton entrega__boton--ruta');
            comoLlegar.href = mapa.urlComoLlegar(pedido.latitud, pedido.longitud);
            comoLlegar.target = '_blank';
            comoLlegar.rel = 'noopener';
            conIcono(comoLlegar, 'bi-signpost-split', 'Cómo llegar');

            const verEnMapa = el('button', 'entrega__boton entrega__boton--mapa');
            verEnMapa.type = 'button';
            conIcono(verEnMapa, 'bi-pin-map', 'Ver en mapa');
            verEnMapa.addEventListener('click', function () {
                mapa.enfocar(pedido.id);
            });

            acciones.appendChild(comoLlegar);
            acciones.appendChild(verEnMapa);
            item.appendChild(acciones);
        }

        // Botón de entregar / deshacer
        const boton = el('button', 'entrega__boton');
        boton.type = 'button';

        if (pedido.entregado) {
            boton.classList.add('entrega__boton--deshacer');
            conIcono(boton, 'bi-arrow-counterclockwise', 'Deshacer');
        } else {
            boton.classList.add('entrega__boton--entregar');
            conIcono(boton, 'bi-check2-circle', 'Marcar como entregado');
        }

        boton.addEventListener('click', function () {
            alternarEntrega(pedido.id);
        });

        item.appendChild(boton);
        return item;
    }

    // Encabezado de una sección de fecha
    function crearEncabezadoGrupo(estado, titulo, cantidad) {
        const encabezado = el('li', 'rep-grupo rep-grupo--' + estado);
        encabezado.appendChild(el('span', '', titulo));
        encabezado.appendChild(el('span', 'rep-grupo__cuenta', String(cantidad)));
        return encabezado;
    }

    function alternarEntrega(id) {
        let ahoraEntregado = false;
        const pedidos = leerPedidos();
        pedidos.forEach(function (pedido) {
            if (pedido.id === id) {
                pedido.entregado = !pedido.entregado;
                ahoraEntregado = pedido.entregado;
            }
        });
        guardarPedidos(pedidos);
        dibujar();
        mostrarAviso(ahoraEntregado ? 'Entrega registrada' : 'Entrega marcada como pendiente');

        // ===== MySQL: guardar el cambio; si falla, avisar y recargar lo de la base =====
        cambiarEstadoPedidoBD(id, ahoraEntregado).then(function (respuesta) {
            if (!respuesta.ok) {
                mostrarAviso('No se pudo guardar en la base de datos');
                cargarPedidosBD();
            }
        });
    }

    // ===== Mapa y ruta del día =====
    // Entregas atrasadas y de hoy que tienen ubicación
    function paradasDeHoy(pendientes) {
        return pendientes.filter(function (pedido) {
            const estado = estadoPedido(pedido);
            return tieneUbicacion(pedido) && (estado === 'atrasado' || estado === 'hoy');
        });
    }

    // Ordena las paradas de la más cercana a la siguiente más cercana
    function ordenarRuta(paradas, origen) {
        const restantes = paradas.slice();
        const ruta = [];
        let actual = origen ? { latitud: origen.lat, longitud: origen.lon } : null;

        if (!actual && restantes.length > 0) {
            const primera = restantes.shift();
            ruta.push(primera);
            actual = primera;
        }

        while (restantes.length > 0) {
            let mejor = 0;
            let mejorDistancia = Infinity;
            restantes.forEach(function (pedido, indice) {
                const d = mapa.distanciaEntre(actual.latitud, actual.longitud, pedido.latitud, pedido.longitud);
                if (d < mejorDistancia) {
                    mejorDistancia = d;
                    mejor = indice;
                }
            });
            const siguiente = restantes.splice(mejor, 1)[0];
            ruta.push(siguiente);
            actual = siguiente;
        }
        return ruta;
    }

    function actualizarMapa(pendientes) {
        if (!mapa) return;

        mapa.actualizar(pendientes.filter(tieneUbicacion).map(function (pedido) {
            return {
                id: pedido.id,
                lat: pedido.latitud,
                lon: pedido.longitud,
                estado: estadoPedido(pedido),
                titulo: pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad,
                cliente: pedido.cliente,
                direccion: pedido.direccion || ''
            };
        }));

        const cantidad = paradasDeHoy(pendientes).length;
        $('ruta-texto').textContent = 'Ruta de hoy' + (cantidad > 0 ? ' (' + cantidad + ')' : '');
        $('btn-ruta-hoy').disabled = cantidad === 0;
    }

    $('btn-ruta-hoy').addEventListener('click', function () {
        if (!mapa) return;

        const pendientes = leerPedidos().filter(function (p) { return !p.entregado; });
        const origen = mapa.posicion();
        const paradas = ordenarRuta(ordenar(paradasDeHoy(pendientes)), origen).slice(0, MAX_PARADAS);

        if (paradas.length === 0) {
            mostrarAviso('No hay entregas con ubicación para hoy.');
            return;
        }

        if (paradasDeHoy(pendientes).length > MAX_PARADAS) {
            mostrarAviso('Google Maps admite 10 paradas: se incluyen las más cercanas.');
        }
        window.open(mapa.urlRuta(paradas, origen), '_blank', 'noopener');
    });

    // ===== Dibujar la pantalla =====
    const MENSAJES_VACIO = {
        pendiente: 'No tienes entregas pendientes.',
        hoy: 'No hay entregas programadas para hoy.',
        entregado: 'Aún no has marcado entregas.'
    };

    function dibujar() {
        const pedidos = leerPedidos();
        const hoy = hoyIso();

        const pendientes = pedidos.filter(function (p) { return !p.entregado; });
        const atrasados = pendientes.filter(function (p) { return p.fecha && p.fecha < hoy; });
        const entregados = pedidos.filter(function (p) { return p.entregado; });
        const deHoy = pedidos.filter(function (p) { return p.fecha === hoy; });
        const entregadosHoy = deHoy.filter(function (p) { return p.entregado; });

        // Contadores y filtros
        $('stat-pendientes').textContent = pendientes.length;
        $('stat-atrasados').textContent = atrasados.length;
        $('stat-entregados').textContent = entregados.length;
        $('cuenta-pendiente').textContent = pendientes.length;
        $('cuenta-hoy').textContent = deHoy.length;
        $('cuenta-entregado').textContent = entregados.length;

        // Progreso de hoy
        const barra = $('progreso-barra');
        const texto = $('progreso-texto');
        if (deHoy.length === 0) {
            texto.textContent = 'Sin entregas programadas';
            barra.style.width = '0%';
        } else {
            texto.textContent = entregadosHoy.length === deHoy.length
                ? '¡Listo! ' + deHoy.length + ' de ' + deHoy.length + ' entregadas'
                : entregadosHoy.length + ' de ' + deHoy.length + ' entregadas';
            barra.style.width = Math.round((entregadosHoy.length / deHoy.length) * 100) + '%';
        }

        // Lista según el filtro
        const contenedor = $('lista-entregas');
        contenedor.innerHTML = '';
        let total = 0;

        if (filtroActual === 'pendiente') {
            // Pendientes agrupados por fecha
            const ordenados = ordenar(pendientes);
            total = ordenados.length;

            ORDEN_GRUPOS.forEach(function (grupo) {
                const delGrupo = ordenados.filter(function (p) {
                    return estadoPedido(p) === grupo[0];
                });
                if (delGrupo.length === 0) return;

                contenedor.appendChild(crearEncabezadoGrupo(grupo[0], grupo[1], delGrupo.length));
                delGrupo.forEach(function (pedido) {
                    contenedor.appendChild(crearEntrega(pedido));
                });
            });
        } else {
            const lista = filtroActual === 'hoy'
                ? ordenar(deHoy)
                : entregados.slice().sort(function (a, b) { return b.id - a.id; });
            total = lista.length;
            lista.forEach(function (pedido) {
                contenedor.appendChild(crearEntrega(pedido));
            });
        }

        $('entregas-vacio').hidden = total > 0;
        $('entregas-vacio-texto').textContent = MENSAJES_VACIO[filtroActual];

        actualizarMapa(pendientes);
    }

    // ===== Filtros =====
    document.querySelectorAll('.rep-filtro').forEach(function (boton) {
        boton.addEventListener('click', function () {
            filtroActual = boton.dataset.filtro;
            document.querySelectorAll('.rep-filtro').forEach(function (otro) {
                const activo = otro === boton;
                otro.classList.toggle('rep-filtro--activo', activo);
                otro.setAttribute('aria-selected', activo ? 'true' : 'false');
            });
            dibujar();
        });
    });

    // ===== Mantener la pantalla al día =====
    // Si el dueño registra o cambia un pedido en otra pestaña, se actualiza sola
    window.addEventListener('storage', function (evento) {
        if (evento.key === CLAVE_PEDIDOS) dibujar();
    });

    // Al volver a esta pestaña se recalcula (por si cambió el día)
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            dibujar();
            cargarPedidosBD(); // ===== MySQL: y se traen los pedidos nuevos de la base =====
        }
    });

    // ===== MySQL: revisar la base cada minuto (pedidos nuevos de cualquier dueño) =====
    setInterval(function () {
        if (!document.hidden) cargarPedidosBD();
    }, ACTUALIZAR_CADA);

    // ===== Nombre y cerrar sesión =====
    const nombre = sessionStorage.getItem('nombreUsuario') || 'Repartidor';
    $('rep-nombre').textContent = nombre.split(' ')[0];

    $('btn-cerrar-sesion').addEventListener('click', async function () {   // MySQL: ahora es async
        ['sesionActiva', 'tipoUsuario', 'nombreUsuario', 'correoUsuario', 'idUsuario'].forEach(function (clave) {
            sessionStorage.removeItem(clave);
        });
        await cerrarSesionBD(); // ===== MySQL: también cierra la sesión del servidor =====
        window.location.href = '../index.html';
    });

    // ===== Iniciar =====
    if (mapa) {
        // Cuando cambia la ubicación del repartidor, se recalculan las distancias
        mapa.iniciar({ alCambiarPosicion: dibujar });
    }
    dibujar();
    cargarPedidosBD(); // ===== MySQL: luego se actualiza con lo que hay en la base =====
})();