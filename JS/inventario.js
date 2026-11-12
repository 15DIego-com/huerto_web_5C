// ===== Mi cosecha: productos del huerto y cuántos kilos hay =====
(function () {
    'use strict';

    // ===== Proteger la página: solo entra el Dueño del Huerto =====
    if (sessionStorage.getItem('sesionActiva') !== 'true' ||
        sessionStorage.getItem('tipoUsuario') !== 'Dueño del Huerto') {
        window.location.href = 'login.html';
        return;
    }

    const $ = function (id) { return document.getElementById(id); };

    let catalogo = [];      // productos que se pueden elegir (de la base)
    let productos = [];     // lo que tiene este dueño

    const formCultivo = $('form-cultivo');
    const selCultivo = $('sel-cultivo');
    const errorCultivo = $('error-cultivo');
    const botonAgregar = $('btn-agregar');

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

    // "Maíz" -> "maiz" (para buscar la imagen, igual que en Inicio)
    function normalizar(texto) {
        return String(texto)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function formatoKg(numero) {
        return Number(numero).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + ' kg';
    }

    let temporizadorAviso;
    function mostrarAviso(mensaje) {
        const aviso = $('cos-toast');
        aviso.textContent = mensaje;
        aviso.classList.add('cos-toast--visible');
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(function () {
            aviso.classList.remove('cos-toast--visible');
        }, 2400);
    }

    // ===== Imagen del producto (si no existe, se usa el emoji) =====
    function crearImagen(producto) {
        const imagen = el('img', 'cos-producto__imagen');
        imagen.src = '../imagenes/' + normalizar(producto.nombre).replace(/\s+/g, '-') + '.png';
        imagen.alt = producto.nombre;

        imagen.addEventListener('error', function () {
            imagen.replaceWith(el('span', 'cos-producto__emoji', producto.emoji || '🌱'));
        });
        return imagen;
    }

    // ===== Tarjeta de un producto =====
    function crearProducto(producto) {
        const tarjeta = el('li', 'cos-producto');

        tarjeta.appendChild(crearImagen(producto));
        tarjeta.appendChild(el('h3', 'cos-producto__nombre', producto.nombre));
        tarjeta.appendChild(el('span', 'cos-producto__cantidad', formatoKg(producto.kilos)));

        const borrar = el('button', 'cos-borrar');
        borrar.type = 'button';
        borrar.title = 'Quitar del inventario';
        borrar.setAttribute('aria-label', 'Quitar ' + producto.nombre);
        borrar.appendChild(icono('bi-trash3'));
        borrar.addEventListener('click', function () {
            eliminarProducto(producto);
        });
        tarjeta.appendChild(borrar);

        return tarjeta;
    }

    async function eliminarProducto(producto) {
        if (!window.confirm('¿Quitar ' + producto.nombre + ' de tu inventario?')) return;

        // Se borran todos los registros de ese producto
        const respuestas = await Promise.all(producto.ids.map(function (id) {
            return eliminarCultivoBD(id);
        }));

        if (respuestas.some(function (r) { return !r.ok; })) {
            mostrarAviso('No se pudo quitar el producto');
        } else {
            mostrarAviso(producto.nombre + ' quitado del inventario');
        }
        cargarInventario();
    }

    // ===== Dibujar la pantalla =====
    function dibujar() {
        const lista = $('lista-productos');
        lista.innerHTML = '';
        productos.forEach(function (producto) {
            lista.appendChild(crearProducto(producto));
        });
        $('cos-vacio').hidden = productos.length > 0;
    }

    // ===== Cargar datos de la base =====
    async function cargarInventario() {
        const respuesta = await listarInventario();
        if (!respuesta.ok) {
            mostrarAviso(respuesta.mensaje || 'No se pudo cargar tu inventario');
            return;
        }

        $('aviso-sin-huerto').hidden = !respuesta.sinHuerto;
        botonAgregar.disabled = !!respuesta.sinHuerto;

        // Se agrupan por producto y se suman los kilos
        const porProducto = {};
        respuesta.cultivos.forEach(function (c) {
            const clave = c.cultivo_id;
            if (!porProducto[clave]) {
                porProducto[clave] = { nombre: c.nombre, emoji: c.emoji, kilos: 0, ids: [] };
            }
            porProducto[clave].kilos += Number(c.cantidad_estimada);
            porProducto[clave].ids.push(Number(c.id));
        });

        productos = Object.values(porProducto).sort(function (a, b) {
            return a.nombre.localeCompare(b.nombre);
        });

        dibujar();
    }

    async function cargarCatalogo() {
        const respuesta = await catalogoCultivos();
        if (!respuesta.ok) return;

        catalogo = respuesta.cultivos;
        catalogo.forEach(function (c) {
            const opcion = el('option', '', (c.emoji ? c.emoji + ' ' : '') + c.nombre);
            opcion.value = c.id;
            selCultivo.appendChild(opcion);
        });
    }

    // ===== Formulario "Agregar producto" =====
    function alternarFormulario(abrir) {
        formCultivo.hidden = !abrir;
        botonAgregar.setAttribute('aria-expanded', abrir ? 'true' : 'false');

        if (abrir) {
            selCultivo.focus();
        } else {
            formCultivo.reset();
            errorCultivo.hidden = true;
            selCultivo.classList.remove('invalido');
            formCultivo.querySelector('.cos-kilos').classList.remove('invalido');
        }
    }

    botonAgregar.addEventListener('click', function () {
        alternarFormulario(formCultivo.hidden);
    });

    $('btn-cancelar').addEventListener('click', function () {
        alternarFormulario(false);
    });

    formCultivo.addEventListener('submit', async function (evento) {
        evento.preventDefault();

        const campoKilos = formCultivo.querySelector('.cos-kilos');
        const kilos = parseFloat(formCultivo.elements.cantidad.value);
        const cultivoId = Number(selCultivo.value);

        selCultivo.classList.remove('invalido');
        campoKilos.classList.remove('invalido');

        let mensaje = '';
        if (!cultivoId) {
            selCultivo.classList.add('invalido');
            mensaje = 'Elige un producto.';
        } else if (!(kilos > 0)) {
            campoKilos.classList.add('invalido');
            mensaje = 'Escribe cuántos kilos tienes.';
        }

        if (mensaje) {
            errorCultivo.textContent = mensaje;
            errorCultivo.hidden = false;
            return;
        }

        const respuesta = await agregarCultivoBD(cultivoId, kilos);

        if (!respuesta.ok) {
            errorCultivo.textContent = respuesta.mensaje || 'No se pudo guardar el producto.';
            errorCultivo.hidden = false;
            return;
        }

        const elegido = catalogo.find(function (c) { return Number(c.id) === cultivoId; });
        const nombre = elegido ? elegido.nombre : 'El producto';

        alternarFormulario(false);
        mostrarAviso(respuesta.sumado
            ? 'Se sumaron ' + formatoKg(kilos) + ' a ' + nombre
            : nombre + ' agregado 🌱');
        cargarInventario();
    });

    // ===== Iniciar =====
    cargarCatalogo();
    cargarInventario();
})();