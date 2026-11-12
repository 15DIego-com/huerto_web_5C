(function () {
    'use strict';

    // Evitar que el archivo se ejecute dos veces (duplicaría los clics)
    if (window.adminCargado) return;
    window.adminCargado = true;

    // ===== Proteger la página: solo entra el Administrador =====
    if (sessionStorage.getItem('sesionActiva') !== 'true' ||
        sessionStorage.getItem('tipoUsuario') !== 'Administrador') {
        window.location.href = 'login.html';
        return;
    }

    // ===== Datos base =====
    const CLAVE_USUARIOS = 'usuariosHuerto';
    const CLAVE_PEDIDOS = 'pedidos';
    const ACTUALIZAR_CADA = 60000;    // MySQL: cada cuánto se consulta la base (1 minuto)

    const CLASE_TIPO = {
        'Dueño del Huerto': 'dueno',
        'Administrador': 'admin',
        'Repartidor': 'repartidor'
    };

    // ===== MySQL: tipo como viene de la base -> texto que usa la página =====
    const TIPO_DESDE_BD = {
        dueno: 'Dueño del Huerto',
        admin: 'Administrador',
        repartidor: 'Repartidor'
    };

    // Usuarios de ejemplo (luego vendrán de MySQL)
    // MySQL: ya no se usan; los usuarios vienen de la base
    const USUARIOS_EJEMPLO = [];

    const $ = function (id) { return document.getElementById(id); };

    // ===== Utilidades =====
    function el(etiqueta, clase, texto) {
        const nodo = document.createElement(etiqueta);
        if (clase) nodo.className = clase;
        if (texto !== undefined) nodo.textContent = texto;
        return nodo;
    }

    function icono(nombre) {
        const i = document.createElement('i');
        i.className = 'bi ' + nombre;
        return i;
    }

    function normalizar(texto) {
        return String(texto)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function iniciales(nombre) {
        return nombre.split(' ').filter(Boolean).map(function (p) { return p[0]; })
            .slice(0, 2).join('').toUpperCase();
    }

    let temporizadorAviso;
    function mostrarAviso(mensaje) {
        const aviso = $('aviso');
        aviso.textContent = mensaje;
        aviso.classList.add('aviso--visible');
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(function () {
            aviso.classList.remove('aviso--visible');
        }, 2200);
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

    // ===== Guardado en el navegador (luego se cambiará por MySQL) =====
    // MySQL: ahora es una copia local; los datos reales están en la base
    function leerUsuarios() {
        let usuarios = [];
        try {
            usuarios = JSON.parse(localStorage.getItem(CLAVE_USUARIOS));
        } catch (error) {
            usuarios = [];
        }
        if (!Array.isArray(usuarios) || usuarios.length === 0) {
            usuarios = USUARIOS_EJEMPLO.slice();
            guardarUsuarios(usuarios);
        }
        return usuarios;
    }

    function guardarUsuarios(usuarios) {
        localStorage.setItem(CLAVE_USUARIOS, JSON.stringify(usuarios));
    }

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

    // ===== MySQL: convertir un usuario de la base al formato de la página =====
    function usuarioDesdeBD(u, yo) {
        const usuario = {
            id: Number(u.id),
            nombre: u.nombre,
            correo: u.correo,
            tipo: TIPO_DESDE_BD[u.tipo] || u.tipo,
            activo: Number(u.activo) === 1,
            protegido: Number(u.id) === Number(yo),   // el admin con la sesión abierta
            conHuerto: !!u.huerto_id
        };
        if (u.huerto_id) {
            usuario.huerto = {
                nombre: u.huerto_nombre || '',
                ubicacion: u.ubicacion || '',
                cultivo: u.tipo_cultivo || '',
                calle: u.calle || '',
                municipio: u.municipio || '',
                estado: u.estado || '',
                cp: u.codigo_postal || '',
                medidas: u.medidas || '',
                latitud: u.latitud !== null ? Number(u.latitud) : null,
                longitud: u.longitud !== null ? Number(u.longitud) : null,
                precision: u.precision_m !== null && u.precision_m !== undefined ? Number(u.precision_m) : null
            };
        }
        return usuario;
    }

    // ===== MySQL: traer usuarios y pedidos desde la base =====
    async function cargarDatosBD() {
        if (typeof adminListarUsuarios !== 'function') return;   // api.js no está cargado

        const respuestas = await Promise.all([adminListarUsuarios(), listarPedidos()]);
        const respUsuarios = respuestas[0];
        const respPedidos = respuestas[1];

        if (respUsuarios.ok) {
            guardarUsuarios(respUsuarios.usuarios.map(function (u) {
                return usuarioDesdeBD(u, respUsuarios.yo);
            }));
        }
        if (respPedidos.ok) {
            guardarPedidos(respPedidos.pedidos.map(pedidoDesdeBD));
        }

        dibujarTodo();

        // Avisar al mapa del admin que ya llegaron los datos
        document.dispatchEvent(new Event('datos-admin-actualizados'));
    }

    function estadoPedido(pedido) {
        if (pedido.entregado) return 'entregado';
        if (pedido.fecha && pedido.fecha < hoyIso()) return 'atrasado';
        return 'pendiente';
    }

    const TEXTO_ESTADO = {
        pendiente: 'Pendiente',
        atrasado: 'Atrasado',
        entregado: 'Entregado'
    };

    // ===== Resumen =====
    function dibujarResumen() {
        const usuarios = leerUsuarios();
        const pedidos = leerPedidos();

        $('stat-usuarios').textContent = usuarios.length;
        $('stat-huertos').textContent = usuarios.filter(function (u) { return u.conHuerto; }).length;
        $('stat-pendientes').textContent = pedidos.filter(function (p) { return !p.entregado; }).length;
        $('stat-entregados').textContent = pedidos.filter(function (p) { return p.entregado; }).length;

        // Barras: usuarios por tipo
        const contenedor = $('barras-tipos');
        contenedor.innerHTML = '';
        Object.keys(CLASE_TIPO).forEach(function (tipo) {
            const cantidad = usuarios.filter(function (u) { return u.tipo === tipo; }).length;
            const porcentaje = usuarios.length ? Math.round((cantidad / usuarios.length) * 100) : 0;

            const barra = el('div', 'barra');
            const cabecera = el('div', 'barra__cabecera');
            cabecera.appendChild(el('span', '', tipo));
            cabecera.appendChild(el('span', '', String(cantidad)));

            const pista = el('div', 'barra__pista');
            const relleno = el('div', 'barra__relleno barra__relleno--' + CLASE_TIPO[tipo]);
            relleno.style.width = porcentaje + '%';
            pista.appendChild(relleno);

            barra.appendChild(cabecera);
            barra.appendChild(pista);
            contenedor.appendChild(barra);
        });

        // Pedidos recientes
        const lista = $('recientes');
        lista.innerHTML = '';
        const recientes = pedidos.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 4);

        $('recientes-vacio').hidden = recientes.length > 0;
        recientes.forEach(function (pedido) {
            const item = el('li', 'reciente');
            item.appendChild(icono('bi-basket reciente__icono'));

            const info = el('div', 'reciente__info');
            info.appendChild(el('span', 'reciente__producto',
                pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad));
            info.appendChild(el('span', 'reciente__detalle',
                pedido.cliente + ' · ' + etiquetaFecha(pedido.fecha)));

            const estado = estadoPedido(pedido);
            item.appendChild(info);
            item.appendChild(el('span', 'insignia insignia--' + estado, TEXTO_ESTADO[estado]));
            lista.appendChild(item);
        });
    }

    // ===== Usuarios =====
    function dibujarUsuarios() {
        const cuerpo = $('tabla-usuarios');
        const texto = normalizar($('buscar-usuario').value);
        const tipo = $('filtro-tipo').value;
        const todos = leerUsuarios();

        const lista = todos.filter(function (u) {
            const coincideTipo = !tipo || u.tipo === tipo;
            const coincideTexto = !texto || normalizar(u.nombre + ' ' + u.correo).includes(texto);
            return coincideTipo && coincideTexto;
        });

        cuerpo.innerHTML = '';

        if (lista.length === 0) {
            const fila = el('tr');
            const celda = el('td', 'tabla-vacia', 'No se encontraron usuarios.');
            celda.colSpan = 5;
            fila.appendChild(celda);
            cuerpo.appendChild(fila);
        }

        lista.forEach(function (usuario) {
            const fila = el('tr', usuario.activo ? '' : 'fila--inactiva');

            // Nombre con avatar
            const tdNombre = el('td');
            const contenedor = el('div', 'usuario');
            contenedor.appendChild(el('span', 'usuario__avatar', iniciales(usuario.nombre)));
            contenedor.appendChild(el('span', 'usuario__nombre', usuario.nombre));
            tdNombre.appendChild(contenedor);

            const tdCorreo = el('td', '', usuario.correo);

            const tdTipo = el('td');
            tdTipo.appendChild(el('span', 'insignia insignia--' + CLASE_TIPO[usuario.tipo], usuario.tipo));

            const tdEstado = el('td');
            tdEstado.appendChild(el('span',
                'insignia insignia--' + (usuario.activo ? 'activo' : 'inactivo'),
                usuario.activo ? 'Activo' : 'Inactivo'));

            // Acciones
            const tdAcciones = el('td');
            const acciones = el('div', 'acciones');

            if (usuario.protegido) {
                const candado = el('span', 'protegido');
                candado.appendChild(icono('bi-lock-fill'));
                candado.appendChild(document.createTextNode(' Protegido'));
                acciones.appendChild(candado);
            } else {
                const alternar = el('button', 'icono-btn');
                alternar.type = 'button';
                alternar.title = usuario.activo ? 'Desactivar' : 'Activar';
                alternar.setAttribute('aria-label', alternar.title + ' a ' + usuario.nombre);
                alternar.appendChild(icono(usuario.activo ? 'bi-toggle-on' : 'bi-toggle-off'));
                alternar.addEventListener('click', function () {
                    alternarUsuario(usuario.id);
                });

                const borrar = el('button', 'icono-btn icono-btn--peligro');
                borrar.type = 'button';
                borrar.title = 'Eliminar';
                borrar.setAttribute('aria-label', 'Eliminar a ' + usuario.nombre);
                borrar.appendChild(icono('bi-trash3'));
                borrar.addEventListener('click', function () {
                    eliminarUsuario(usuario.id, usuario.nombre);
                });

                acciones.appendChild(alternar);
                acciones.appendChild(borrar);
            }
            tdAcciones.appendChild(acciones);

            fila.appendChild(tdNombre);
            fila.appendChild(tdCorreo);
            fila.appendChild(tdTipo);
            fila.appendChild(tdEstado);
            fila.appendChild(tdAcciones);
            cuerpo.appendChild(fila);
        });

        $('contador-usuarios').textContent =
            'Mostrando ' + lista.length + ' de ' + todos.length + ' usuarios';
    }

    function alternarUsuario(id) {
        const usuarios = leerUsuarios();
        let activo = false;   // MySQL: para mandar el nuevo estado
        usuarios.forEach(function (u) {
            if (u.id === id) {
                u.activo = !u.activo;
                activo = u.activo;
            }
        });
        guardarUsuarios(usuarios);
        dibujarTodo();
        mostrarAviso('Estado del usuario actualizado');

        // ===== MySQL: guardar en la base; si falla, avisar y recargar =====
        adminCambiarEstadoUsuario(id, activo).then(function (respuesta) {
            if (!respuesta.ok) {
                mostrarAviso(respuesta.mensaje || 'No se pudo guardar en la base de datos');
                cargarDatosBD();
            }
        });
    }

    async function eliminarUsuario(id, nombre) {   // MySQL: ahora es async
        if (!window.confirm('¿Eliminar a ' + nombre + '? Esta acción no se puede deshacer.')) return;

        // ===== MySQL: borrar primero en la base =====
        const respuesta = await adminEliminarUsuario(id);
        if (!respuesta.ok) {
            mostrarAviso(respuesta.mensaje || 'No se pudo eliminar el usuario');
            return;
        }

        guardarUsuarios(leerUsuarios().filter(function (u) { return u.id !== id; }));
        dibujarTodo();
        mostrarAviso('Usuario eliminado');

        // MySQL: al borrar un dueño también se borran sus pedidos; se recarga todo
        cargarDatosBD();
    }

    // ===== Formulario "Nuevo usuario" =====
    const formUsuario = $('form-usuario');
    const errorUsuario = $('error-usuario');

    function alternarFormulario(abrir) {
        formUsuario.hidden = !abrir;
        if (abrir) {
            formUsuario.elements.nombre.focus();
        } else {
            formUsuario.reset();
            errorUsuario.hidden = true;
            Array.from(formUsuario.elements).forEach(function (c) {
                c.classList.remove('invalido');
            });
        }
    }

    $('btn-nuevo-usuario').addEventListener('click', function () {
        alternarFormulario(true);   // siempre abre; para cerrar está "Cancelar"
    });

    $('btn-cancelar-usuario').addEventListener('click', function () {
        alternarFormulario(false);
    });

    formUsuario.addEventListener('submit', async function (evento) {   // MySQL: ahora es async
        evento.preventDefault();

        const nombre = formUsuario.elements.nombre;
        const correo = formUsuario.elements.correo;
        const password = formUsuario.elements.password;   // MySQL: campo nuevo
        const tipo = formUsuario.elements.tipo;
        const usuarios = leerUsuarios();

        [nombre, correo, password].forEach(function (c) { c.classList.remove('invalido'); });

        let mensaje = '';
        if (!nombre.value.trim()) {
            nombre.classList.add('invalido');
            mensaje = 'Escribe el nombre completo.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.value.trim())) {
            correo.classList.add('invalido');
            mensaje = 'Escribe un correo válido.';
        } else if (usuarios.some(function (u) {
            return u.correo.toLowerCase() === correo.value.trim().toLowerCase();
        })) {
            correo.classList.add('invalido');
            mensaje = 'Ya existe un usuario con ese correo.';
        } else if (password.value.length < 8) {   // MySQL
            password.classList.add('invalido');
            mensaje = 'La contraseña debe tener al menos 8 caracteres.';
        }

        if (mensaje) {
            errorUsuario.textContent = mensaje;
            errorUsuario.hidden = false;
            return;
        }

        // ===== MySQL: guardar primero en la base =====
        const respuesta = await adminCrearUsuario(
            nombre.value.trim(), correo.value.trim(), password.value, tipo.value
        );
        if (!respuesta.ok) {
            errorUsuario.textContent = respuesta.mensaje;
            errorUsuario.hidden = false;
            return;
        }

        usuarios.push({
            id: Number(respuesta.id),   // MySQL: el id que dio la base
            nombre: nombre.value.trim(),
            correo: correo.value.trim(),
            tipo: tipo.value,
            activo: true
        });
        guardarUsuarios(usuarios);

        alternarFormulario(false);
        dibujarTodo();
        mostrarAviso('Usuario agregado');
    });

    $('buscar-usuario').addEventListener('input', dibujarUsuarios);
    $('filtro-tipo').addEventListener('change', dibujarUsuarios);

    // ===== Huertos =====
    // Huertos con el inventario abierto (para que no se cierren al actualizar los datos)
    const inventariosAbiertos = new Set();

    function formatoKg(numero) {
        return Number(numero).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' kg';
    }

    // Imagen del producto (si no existe, se usa el emoji)
    function crearImagenProducto(producto) {
        const imagen = el('img', 'huerto-inv__imagen');
        imagen.src = '../imagenes/' + normalizar(producto.nombre).replace(/\s+/g, '-') + '.png';
        imagen.alt = producto.nombre;
        imagen.addEventListener('error', function () {
            imagen.replaceWith(el('span', 'huerto-inv__emoji', producto.emoji || '🌱'));
        });
        return imagen;
    }

    // Trae de la base el inventario del huerto y lo dibuja
    async function cargarInventarioHuerto(dueno, contenedor) {
        contenedor.innerHTML = '';
        contenedor.appendChild(el('p', 'huerto-inv__estado', 'Cargando inventario...'));

        const respuesta = await adminInventarioHuerto(dueno.id);
        contenedor.innerHTML = '';

        if (!respuesta.ok) {
            contenedor.appendChild(el('p', 'huerto-inv__estado', respuesta.mensaje || 'No se pudo cargar el inventario.'));
            return;
        }

        if (respuesta.productos.length === 0) {
            contenedor.appendChild(el('p', 'huerto-inv__estado', 'Este huerto aún no registra productos.'));
            return;
        }

        const lista = el('ul', 'huerto-inv__lista');
        let total = 0;

        respuesta.productos.forEach(function (producto) {
            total += Number(producto.kilos);

            const item = el('li', 'huerto-inv__item');
            item.appendChild(crearImagenProducto(producto));
            item.appendChild(el('span', 'huerto-inv__nombre', producto.nombre));
            item.appendChild(el('span', 'huerto-inv__kilos', formatoKg(producto.kilos)));
            lista.appendChild(item);
        });

        contenedor.appendChild(lista);
        contenedor.appendChild(el('p', 'huerto-inv__total', 'Total: ' + formatoKg(total)));
    }

    function dibujarHuertos() {
        const contenedor = $('grid-huertos');
        contenedor.innerHTML = '';

        const duenos = leerUsuarios().filter(function (u) { return u.tipo === 'Dueño del Huerto'; });

        if (duenos.length === 0) {
            const vacio = el('p', 'vacio');
            vacio.appendChild(icono('bi-flower1'));
            vacio.appendChild(document.createTextNode(' Aún no hay dueños de huerto registrados.'));
            contenedor.appendChild(vacio);
            return;
        }

        duenos.forEach(function (dueno) {
            const tarjeta = el('article', 'huerto' + (dueno.conHuerto ? '' : ' huerto--vacio'));

            const cabecera = el('div', 'huerto__cabecera');
            cabecera.appendChild(el('span', 'usuario__avatar', iniciales(dueno.nombre)));
            const quien = el('div');
            quien.appendChild(el('p', 'huerto__propietario', dueno.nombre));
            quien.appendChild(el('p', 'huerto__correo', dueno.correo));
            cabecera.appendChild(quien);
            tarjeta.appendChild(cabecera);

            if (!dueno.conHuerto) {
                tarjeta.appendChild(el('p', 'huerto__sin', 'Sin huerto registrado.'));
                contenedor.appendChild(tarjeta);
                return;
            }

            // El huerto de cada dueño viene de la base
            const huerto = dueno.huerto || { cultivo: '', calle: '', municipio: '', estado: '', cp: '' };

            // Ubicación
            const partesUbicacion = [huerto.calle, huerto.municipio, huerto.estado]
                .filter(Boolean).join(', ') + (huerto.cp ? ' · C.P. ' + huerto.cp : '');
            const ubicacion = el('p', 'huerto__dato');
            ubicacion.appendChild(icono('bi-geo-alt-fill'));
            ubicacion.appendChild(el('span', '', partesUbicacion || 'Sin registrar'));
            tarjeta.appendChild(ubicacion);

            // Cultivos
            const cultivos = el('div', 'huerto__dato');
            cultivos.appendChild(icono('bi-flower1'));
            const bloque = el('div');
            bloque.appendChild(el('span', '', 'Cultivos'));
            const chips = el('div', 'chips');
            const lista = huerto.cultivo.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
            if (lista.length === 0) {
                chips.appendChild(el('span', 'huerto__sin', 'Sin registrar'));
            }
            lista.forEach(function (cultivo) {
                chips.appendChild(el('span', 'chip', cultivo));
            });
            bloque.appendChild(chips);
            cultivos.appendChild(bloque);
            tarjeta.appendChild(cultivos);

            // ===== Inventario: se despliega al seleccionar el huerto =====
            const botonVer = el('button', 'huerto__ver');
            botonVer.type = 'button';
            botonVer.setAttribute('aria-expanded', 'false');
            const textoVer = el('span', '', 'Ver inventario');
            botonVer.appendChild(textoVer);
            botonVer.appendChild(icono('bi-chevron-down'));

            const inventario = el('div', 'huerto-inv');
            inventario.hidden = true;

            function alternarInventario(abrir) {
                inventario.hidden = !abrir;
                botonVer.setAttribute('aria-expanded', abrir ? 'true' : 'false');
                textoVer.textContent = abrir ? 'Ocultar inventario' : 'Ver inventario';

                if (abrir) {
                    inventariosAbiertos.add(dueno.id);
                    cargarInventarioHuerto(dueno, inventario);
                } else {
                    inventariosAbiertos.delete(dueno.id);
                }
            }

            // Clic en cualquier parte de la tarjeta (menos dentro del inventario)
            tarjeta.classList.add('huerto--clic');
            tarjeta.addEventListener('click', function (evento) {
                if (evento.target.closest('.huerto-inv')) return;
                alternarInventario(inventario.hidden);
            });

            tarjeta.appendChild(botonVer);
            tarjeta.appendChild(inventario);

            // Si estaba abierto antes de actualizar, se vuelve a abrir
            if (inventariosAbiertos.has(dueno.id)) {
                alternarInventario(true);
            }

            contenedor.appendChild(tarjeta);
        });
    }

    // ===== Pedidos =====
    function dibujarPedidos() {
        const lista = $('lista-pedidos-admin');
        const filtro = $('filtro-pedidos').value;

        const pedidos = leerPedidos()
            .filter(function (p) { return !filtro || estadoPedido(p) === filtro; })
            .sort(function (a, b) {
                if (a.entregado !== b.entregado) return a.entregado ? 1 : -1;
                return (a.fecha || '9999-99-99').localeCompare(b.fecha || '9999-99-99');
            });

        lista.innerHTML = '';
        $('pedidos-vacio').hidden = pedidos.length > 0;

        pedidos.forEach(function (pedido) {
            const estado = estadoPedido(pedido);
            const item = el('li', 'pedido-admin' + (pedido.entregado ? ' pedido-admin--entregado' : ''));

            const ico = el('span', 'pedido-admin__icono');
            ico.appendChild(icono('bi-basket'));

            const info = el('div', 'pedido-admin__info');
            info.appendChild(el('span', 'pedido-admin__producto',
                pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad));
            info.appendChild(el('span', 'pedido-admin__detalle',
                'Cliente: ' + pedido.cliente + ' · Entrega: ' + etiquetaFecha(pedido.fecha)));

            const insignia = el('span', 'insignia insignia--' + estado, TEXTO_ESTADO[estado]);

            const alternar = el('button', 'icono-btn');
            alternar.type = 'button';
            alternar.title = pedido.entregado ? 'Marcar como pendiente' : 'Marcar como entregado';
            alternar.setAttribute('aria-label', alternar.title);
            alternar.appendChild(icono(pedido.entregado ? 'bi-check-circle-fill' : 'bi-circle'));
            alternar.addEventListener('click', function () {
                alternarPedido(pedido.id);
            });

            item.appendChild(ico);
            item.appendChild(info);
            item.appendChild(insignia);
            item.appendChild(alternar);
            lista.appendChild(item);
        });
    }

    function alternarPedido(id) {
        const pedidos = leerPedidos();
        let entregado = false;   // MySQL: para mandar el nuevo estado
        pedidos.forEach(function (p) {
            if (p.id === id) {
                p.entregado = !p.entregado;
                entregado = p.entregado;
            }
        });
        guardarPedidos(pedidos);
        dibujarTodo();

        // ===== MySQL: guardar en la base; si falla, avisar y recargar =====
        cambiarEstadoPedidoBD(id, entregado).then(function (respuesta) {
            if (!respuesta.ok) {
                mostrarAviso('No se pudo guardar en la base de datos');
                cargarDatosBD();
            }
        });
    }

    $('filtro-pedidos').addEventListener('change', dibujarPedidos);

    // ===== Pestañas =====
    document.querySelectorAll('.admin-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.admin-tab').forEach(function (otra) {
                const activa = otra === tab;
                otra.classList.toggle('admin-tab--activa', activa);
                otra.setAttribute('aria-selected', activa ? 'true' : 'false');
            });
            document.querySelectorAll('.panel').forEach(function (panel) {
                panel.hidden = panel.id !== 'panel-' + tab.dataset.panel;
            });
        });
    });

    // ===== Nombre del administrador y cerrar sesión =====
    const nombreAdmin = sessionStorage.getItem('nombreUsuario') || 'Administrador';
    $('admin-nombre').textContent = nombreAdmin;
    $('admin-saludo').textContent = nombreAdmin;

    $('btn-cerrar-sesion').addEventListener('click', async function () {   // MySQL: ahora es async
        ['sesionActiva', 'tipoUsuario', 'nombreUsuario', 'correoUsuario', 'idUsuario'].forEach(function (clave) {
            sessionStorage.removeItem(clave);
        });
        await cerrarSesionBD(); // ===== MySQL: también cierra la sesión del servidor =====
        window.location.href = '../index.html';
    });

    // ===== Dibujar todo =====
    function dibujarTodo() {
        dibujarResumen();
        dibujarUsuarios();
        dibujarHuertos();
        dibujarPedidos();
    }

    // ===== MySQL: revisar la base cada minuto =====
    setInterval(function () {
        if (!document.hidden) cargarDatosBD();
    }, ACTUALIZAR_CADA);

    dibujarTodo();
    cargarDatosBD(); // ===== MySQL: luego se actualiza con lo que hay en la base =====
})();