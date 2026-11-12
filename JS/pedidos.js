(function () {
    const CLAVE = 'pedidos';

    const lista = document.getElementById('lista-pedidos');
    const vacio = document.getElementById('pedidos-vacio');
    const contador = document.getElementById('pedidos-contador');
    const formulario = document.getElementById('form-pedido');
    const botonNuevo = document.getElementById('btn-nuevo-pedido');
    const botonCancelar = document.getElementById('btn-cancelar-pedido');
    const error = document.getElementById('error-pedido');
    const sugerencias = document.getElementById('lista-productos');

    // El mapa de entrega vive en pedido-mapa.js
    const mapa = window.MapaPedido || null;

    // ===== Guardar y leer pedidos =====
    // MySQL: esto ahora es una copia local; los datos reales están en la base
    function leerPedidos() {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE));
            return Array.isArray(datos) ? datos : [];
        } catch (e) {
            return [];
        }
    }

    function guardarPedidos(pedidos) {
        localStorage.setItem(CLAVE, JSON.stringify(pedidos));
    }

    // ===== MySQL: traer los pedidos desde la base =====
    async function cargarPedidosBD() {
        const respuesta = await listarPedidos();

        // Si no hay conexión o sesión en el servidor, se queda con lo local
        if (!respuesta.ok) return;

        guardarPedidos(respuesta.pedidos.map(pedidoDesdeBD));
        mostrar();
    }

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

    function etiquetaFecha(iso) {
        if (!iso) return 'Sin fecha';
        if (iso === hoyIso()) return 'Hoy';
        if (iso === mananaIso()) return 'Mañana';
        const partes = iso.split('-');
        return partes[2] + '/' + partes[1] + '/' + partes[0];
    }

    // ===== Ordenar: pendientes primero, por fecha de entrega =====
    function ordenar(pedidos) {
        return pedidos.slice().sort(function (a, b) {
            if (a.entregado !== b.entregado) return a.entregado ? 1 : -1;
            return (a.fecha || '9999-99-99').localeCompare(b.fecha || '9999-99-99');
        });
    }

    // ===== Dibujar un pedido =====
    function crearPedido(pedido) {
        const item = document.createElement('li');
        item.className = 'pedido' + (pedido.entregado ? ' pedido--entregado' : '');

        const check = document.createElement('button');
        check.type = 'button';
        check.className = 'pedido__check';
        check.setAttribute('aria-label', pedido.entregado ? 'Marcar como pendiente' : 'Marcar como entregado');
        check.innerHTML = pedido.entregado
            ? '<i class="bi bi-check-circle-fill"></i>'
            : '<i class="bi bi-circle"></i>';
        check.addEventListener('click', function () {
            cambiarEstado(pedido.id);
        });

        const info = document.createElement('div');
        info.className = 'pedido__info';

        const producto = document.createElement('span');
        producto.className = 'pedido__producto';
        producto.textContent = pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad;

        const detalle = document.createElement('span');
        detalle.className = 'pedido__detalle';
        const atrasado = !pedido.entregado && pedido.fecha && pedido.fecha < hoyIso();
        if (atrasado) detalle.classList.add('pedido__detalle--atrasado');
        detalle.textContent = pedido.cliente + ' · ' +
            (atrasado ? 'Atrasado (' + etiquetaFecha(pedido.fecha) + ')' : etiquetaFecha(pedido.fecha));

        info.appendChild(producto);
        info.appendChild(detalle);

        item.appendChild(check);
        item.appendChild(info);

        // Pin con la ubicación de entrega (solo si el pedido la tiene)
        if (typeof pedido.latitud === 'number' && typeof pedido.longitud === 'number') {
            const ubicacion = document.createElement('a');
            ubicacion.className = 'pedido__ubicacion';
            ubicacion.href = 'https://www.google.com/maps/search/?api=1&query=' +
                pedido.latitud + ',' + pedido.longitud;
            ubicacion.target = '_blank';
            ubicacion.rel = 'noopener';
            ubicacion.title = pedido.direccion || 'Ver ubicación de entrega';
            ubicacion.setAttribute('aria-label', 'Ver ubicación de entrega en el mapa');
            ubicacion.innerHTML = '<i class="bi bi-geo-alt-fill"></i>';
            item.appendChild(ubicacion);
        }

        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'pedido__borrar';
        borrar.setAttribute('aria-label', 'Eliminar pedido');
        borrar.innerHTML = '<i class="bi bi-trash3"></i>';
        borrar.addEventListener('click', function () {
            eliminar(pedido.id);
        });
        item.appendChild(borrar);

        return item;
    }

    // ===== Mostrar la lista =====
    function mostrar() {
        const pedidos = ordenar(leerPedidos());
        lista.innerHTML = '';

        pedidos.forEach(function (pedido) {
            lista.appendChild(crearPedido(pedido));
        });

        const pendientes = pedidos.filter(function (p) { return !p.entregado; }).length;
        contador.textContent = pendientes;
        contador.hidden = pendientes === 0;

        vacio.hidden = pedidos.length > 0;
        lista.hidden = pedidos.length === 0;
    }

    function cambiarEstado(id) {
        const pedidos = leerPedidos();
        let entregado = false;   // MySQL: para mandar el nuevo estado
        pedidos.forEach(function (p) {
            if (p.id === id) {
                p.entregado = !p.entregado;
                entregado = p.entregado;
            }
        });
        guardarPedidos(pedidos);
        mostrar();

        // ===== MySQL: guardar el cambio; si falla, se recarga lo de la base =====
        cambiarEstadoPedidoBD(id, entregado).then(function (respuesta) {
            if (!respuesta.ok) cargarPedidosBD();
        });
    }

    function eliminar(id) {
        guardarPedidos(leerPedidos().filter(function (p) { return p.id !== id; }));
        mostrar();

        // ===== MySQL: borrar en la base; si falla, se recarga lo de la base =====
        eliminarPedidoBD(id).then(function (respuesta) {
            if (!respuesta.ok) cargarPedidosBD();
        });
    }

    // ===== Sugerir los cultivos del perfil en el campo "Producto" =====
    function llenarSugerencias() {
        sugerencias.innerHTML = '';
        try {
            const huerto = JSON.parse(localStorage.getItem('datosHuerto'));
            if (!huerto) return;
            const texto = typeof huerto.cultivo === 'string' ? huerto.cultivo : huerto.cultivos;
            if (typeof texto !== 'string') return;
            texto.split(',').map(function (c) { return c.trim(); }).filter(Boolean)
                .forEach(function (cultivo) {
                    const opcion = document.createElement('option');
                    opcion.value = cultivo;
                    sugerencias.appendChild(opcion);
                });
        } catch (e) {
            // Si los datos están dañados, simplemente no hay sugerencias
        }
    }

    // ===== Abrir / cerrar el formulario =====
    function alternarFormulario(abrir) {
        formulario.hidden = !abrir;
        botonNuevo.setAttribute('aria-expanded', abrir ? 'true' : 'false');

        if (abrir) {
            llenarSugerencias();
            formulario.elements.fecha.min = hoyIso();
            formulario.elements.cliente.focus();
            if (mapa) mapa.iniciar();
        } else {
            formulario.reset();
            error.hidden = true;
            Array.from(formulario.elements).forEach(function (c) {
                c.classList.remove('invalido');
            });
            if (mapa) mapa.limpiar();
        }
    }

    botonNuevo.addEventListener('click', function () {
        alternarFormulario(formulario.hidden);
    });

    botonCancelar.addEventListener('click', function () {
        alternarFormulario(false);
    });

    // ===== Guardar un pedido nuevo =====
    formulario.addEventListener('submit', async function (evento) {   // MySQL: ahora es async
        evento.preventDefault();

        const cliente = formulario.elements.cliente;
        const producto = formulario.elements.producto;
        const cantidad = formulario.elements.cantidad;
        const unidad = formulario.elements.unidad;
        const fecha = formulario.elements.fecha;
        const exigeUbicacion = mapa && mapa.disponible();
        const ubicacion = exigeUbicacion ? mapa.obtener() : null;

        [cliente, producto, cantidad, fecha].forEach(function (c) {
            c.classList.remove('invalido');
        });

        let mensaje = '';
        if (!cliente.value.trim()) {
            cliente.classList.add('invalido');
            mensaje = 'Escribe el nombre del cliente.';
        } else if (!producto.value.trim()) {
            producto.classList.add('invalido');
            mensaje = 'Escribe el producto.';
        } else if (!(parseFloat(cantidad.value) > 0)) {
            cantidad.classList.add('invalido');
            mensaje = 'La cantidad debe ser mayor a 0.';
        } else if (fecha.value && fecha.value < hoyIso()) {
            fecha.classList.add('invalido');
            mensaje = 'La fecha de entrega no puede ser anterior a hoy.';
        } else if (exigeUbicacion && !ubicacion) {
            mapa.marcarError();
            mensaje = 'Marca el punto de entrega en el mapa.';
        }

        if (mensaje) {
            error.textContent = mensaje;
            error.hidden = false;
            return;
        }

        const pedido = {
            id: Date.now(),
            cliente: cliente.value.trim(),
            producto: producto.value.trim(),
            cantidad: parseFloat(cantidad.value),
            unidad: unidad.value,
            fecha: fecha.value,
            entregado: false
        };

        if (ubicacion) {
            pedido.latitud = ubicacion.latitud;
            pedido.longitud = ubicacion.longitud;
            pedido.precision = ubicacion.precision;
            pedido.direccion = ubicacion.direccion;
        }

        // ===== MySQL: guardar primero en la base =====
        const respuesta = await crearPedidoBD(pedido);

        if (!respuesta.ok) {
            error.textContent = 'No se pudo guardar el pedido: ' + respuesta.mensaje;
            error.hidden = false;
            return;
        }

        pedido.id = Number(respuesta.id);   // MySQL: se usa el id que dio la base

        const pedidos = leerPedidos();
        pedidos.push(pedido);
        guardarPedidos(pedidos);

        alternarFormulario(false);
        mostrar();
    });

    // ===== Iniciar =====
    mostrar();
    cargarPedidosBD(); // ===== MySQL: luego se actualiza con lo que hay en la base =====
})();