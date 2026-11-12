// ===== Proteger la página: si no hay sesión, regresar al login =====
if (sessionStorage.getItem('sesionActiva') !== 'true') {
    window.location.href = 'login.html';
}

// ===== Datos base =====
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CLAVE_STORAGE = 'actividadesHuerto';
const CLAVE_PEDIDOS = 'pedidos';

const hoy = new Date();
let mesVisible  = hoy.getMonth();
let anioVisible = hoy.getFullYear();
let diaSeleccionado = formatoFecha(hoy);

// ===== MySQL: ids de las actividades en la base, por día (mismo orden que la lista) =====
let idsActividades = {};

// ===== Utilidades =====

// Convierte una fecha a texto "AAAA-MM-DD" (se usa como llave para guardar)
function formatoFecha(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return fecha.getFullYear() + '-' + mes + '-' + dia;
}

// Convierte "AAAA-MM-DD" a texto legible, por ejemplo "1 de octubre"
function textoFecha(clave) {
    const partes = clave.split('-');
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
    return fecha.getDate() + ' de ' + MESES[fecha.getMonth()].toLowerCase();
}

// ===== Guardado en el navegador (luego se cambiará por MySQL) =====
// MySQL: ahora es una copia local; los datos reales están en la base
function leerActividades() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_STORAGE)) || {};
    } catch (error) {
        return {};
    }
}

function guardarActividades(datos) {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(datos));
}

// Los pedidos se registran en Inicio y se guardan con la clave "pedidos"
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

// ===== MySQL: traer actividades y pedidos desde la base =====
async function cargarDatosBD() {
    if (typeof listarActividades !== 'function') return;   // api.js no está cargado

    const respuestas = await Promise.all([listarActividades(), listarPedidos()]);
    const respActividades = respuestas[0];
    const respPedidos = respuestas[1];

    if (respActividades.ok) {
        const actividades = {};
        idsActividades = {};
        respActividades.actividades.forEach(function (a) {
            if (!actividades[a.fecha]) {
                actividades[a.fecha] = [];
                idsActividades[a.fecha] = [];
            }
            actividades[a.fecha].push(a.actividad);
            idsActividades[a.fecha].push(Number(a.id));
        });
        guardarActividades(actividades);
    }

    if (respPedidos.ok) {
        guardarPedidos(respPedidos.pedidos.map(pedidoDesdeBD));
    }

    dibujarCalendario();
    dibujarActividades();
}

// ===== Dibujar el calendario del mes =====
function dibujarCalendario() {
    const cuerpo = document.getElementById('cal-cuerpo');
    const actividades = leerActividades();
    const claveHoy = formatoFecha(hoy);

    // Días con pedidos pendientes (y si alguno está atrasado)
    const pedidosPendientes = {};
    leerPedidos().forEach(function (pedido) {
        if (pedido.fecha && !pedido.entregado) {
            pedidosPendientes[pedido.fecha] = {
                atrasado: pedido.fecha < claveHoy
            };
        }
    });

    cuerpo.innerHTML = '';
    document.getElementById('cal-mes').textContent = MESES[mesVisible] + ' ' + anioVisible;

    const primerDia   = new Date(anioVisible, mesVisible, 1);
    const desfase     = (primerDia.getDay() + 6) % 7;   // la semana empieza en lunes
    const diasEnMes   = new Date(anioVisible, mesVisible + 1, 0).getDate();
    const semanas     = Math.ceil((desfase + diasEnMes) / 7);

    for (let semana = 0; semana < semanas; semana++) {
        const fila = document.createElement('tr');

        for (let dia = 0; dia < 7; dia++) {
            const fecha = new Date(anioVisible, mesVisible, 1 - desfase + semana * 7 + dia);
            const clave = formatoFecha(fecha);

            const celda = document.createElement('td');
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'cal-dia';
            boton.textContent = fecha.getDate();

            if (fecha.getMonth() !== mesVisible) {
                boton.classList.add('cal-dia--otro-mes');
            }
            if (clave === claveHoy) {
                boton.classList.add('cal-dia--hoy');
            }
            if (clave === diaSeleccionado) {
                boton.classList.add('cal-dia--seleccionado');
            }
            if (actividades[clave] && actividades[clave].length > 0) {
                boton.classList.add('cal-dia--con-actividad');
            }
            if (pedidosPendientes[clave]) {
                boton.classList.add('cal-dia--con-pedido');
                if (pedidosPendientes[clave].atrasado) {
                    boton.classList.add('cal-dia--pedido-atrasado');
                }
            }

            boton.addEventListener('click', function () {
                diaSeleccionado = clave;
                // Si se toca un día de otro mes, se cambia a ese mes
                mesVisible  = fecha.getMonth();
                anioVisible = fecha.getFullYear();
                dibujarCalendario();
                dibujarActividades();
            });

            celda.appendChild(boton);
            fila.appendChild(celda);
        }

        cuerpo.appendChild(fila);
    }
}

// ===== Crear la fila de un pedido para la lista del día =====
function crearPedido(pedido) {
    const item = document.createElement('li');
    item.className = 'programada programada--pedido';

    const atrasado = !pedido.entregado && pedido.fecha < formatoFecha(hoy);
    if (pedido.entregado) item.classList.add('programada--entregado');
    if (atrasado) item.classList.add('programada--atrasado');

    const icono = document.createElement('i');
    icono.className = 'bi bi-basket programada__icono';

    const texto = document.createElement('span');
    texto.className = 'programada__texto';
    texto.textContent = pedido.producto + ' · ' + pedido.cantidad + ' ' + pedido.unidad +
        ' · ' + pedido.cliente;

    const estado = document.createElement('button');
    estado.type = 'button';
    estado.className = 'programada__estado';
    estado.setAttribute('aria-label', pedido.entregado ? 'Marcar como pendiente' : 'Marcar como entregado');
    estado.innerHTML = pedido.entregado
        ? '<i class="bi bi-check-circle-fill"></i>'
        : '<i class="bi bi-circle"></i>';
    estado.addEventListener('click', function () {
        cambiarEstadoPedido(pedido.id);
    });

    item.appendChild(icono);
    item.appendChild(texto);
    item.appendChild(estado);
    return item;
}

function cambiarEstadoPedido(id) {
    const pedidos = leerPedidos();
    let entregado = false;   // MySQL: para mandar el nuevo estado
    pedidos.forEach(function (pedido) {
        if (pedido.id === id) {
            pedido.entregado = !pedido.entregado;
            entregado = pedido.entregado;
        }
    });
    guardarPedidos(pedidos);
    dibujarCalendario();
    dibujarActividades();

    // ===== MySQL: guardar el cambio; si falla, se recarga lo de la base =====
    cambiarEstadoPedidoBD(id, entregado).then(function (respuesta) {
        if (!respuesta.ok) cargarDatosBD();
    });
}

// ===== Dibujar las actividades y pedidos del día seleccionado =====
function dibujarActividades() {
    const lista = document.getElementById('lista-programadas');
    const actividades = leerActividades();
    const delDia = actividades[diaSeleccionado] || [];
    const pedidosDia = leerPedidos().filter(function (pedido) {
        return pedido.fecha === diaSeleccionado;
    });

    lista.innerHTML = '';
    document.getElementById('titulo-actividades').textContent =
        'Actividades y pedidos (' + textoFecha(diaSeleccionado) + ')';

    if (delDia.length === 0 && pedidosDia.length === 0) {
        const vacio = document.createElement('li');
        vacio.className = 'programada programada--vacia';
        vacio.textContent = 'Sin actividades ni pedidos este día';
        lista.appendChild(vacio);
        return;
    }

    delDia.forEach(function (texto, indice) {
        const item = document.createElement('li');
        item.className = 'programada';

        const nombre = document.createElement('span');
        nombre.textContent = texto;

        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'programada__borrar';
        borrar.setAttribute('aria-label', 'Eliminar ' + texto);
        borrar.innerHTML = '<i class="bi bi-x-lg"></i>';
        borrar.addEventListener('click', function () {
            eliminarActividad(indice);
        });

        item.appendChild(nombre);
        item.appendChild(borrar);
        lista.appendChild(item);
    });

    pedidosDia.forEach(function (pedido) {
        lista.appendChild(crearPedido(pedido));
    });
}

// ===== Agregar y eliminar actividades =====
function agregarActividad(texto) {
    const actividades = leerActividades();
    const dia = diaSeleccionado;   // MySQL: se guarda por si cambia el día mientras responde la base

    if (!actividades[diaSeleccionado]) {
        actividades[diaSeleccionado] = [];
    }
    actividades[diaSeleccionado].push(texto);

    guardarActividades(actividades);
    dibujarCalendario();
    dibujarActividades();

    // ===== MySQL: guardar en la base y recordar su id =====
    crearActividadBD(dia, texto).then(function (respuesta) {
        if (respuesta.ok) {
            if (!idsActividades[dia]) idsActividades[dia] = [];
            idsActividades[dia].push(Number(respuesta.id));
        } else {
            alert('No se pudo guardar la actividad: ' + respuesta.mensaje);
            cargarDatosBD();
        }
    });
}

function eliminarActividad(indice) {
    const actividades = leerActividades();

    // ===== MySQL: id de la actividad que se va a borrar =====
    const idsDelDia = idsActividades[diaSeleccionado] || [];
    const idBD = idsDelDia[indice];
    idsDelDia.splice(indice, 1);

    actividades[diaSeleccionado].splice(indice, 1);
    if (actividades[diaSeleccionado].length === 0) {
        delete actividades[diaSeleccionado];
    }

    guardarActividades(actividades);
    dibujarCalendario();
    dibujarActividades();

    // ===== MySQL: borrar en la base; si falla, se recarga lo de la base =====
    if (idBD) {
        eliminarActividadBD(idBD).then(function (respuesta) {
            if (!respuesta.ok) cargarDatosBD();
        });
    }
}

// ===== Cambiar de mes =====
document.getElementById('btn-mes-anterior').addEventListener('click', function () {
    mesVisible--;
    if (mesVisible < 0) {
        mesVisible = 11;
        anioVisible--;
    }
    dibujarCalendario();
});

document.getElementById('btn-mes-siguiente').addEventListener('click', function () {
    mesVisible++;
    if (mesVisible > 11) {
        mesVisible = 0;
        anioVisible++;
    }
    dibujarCalendario();
});

// ===== Botón "ir a hoy" =====
document.getElementById('btn-hoy').addEventListener('click', function () {
    mesVisible  = hoy.getMonth();
    anioVisible = hoy.getFullYear();
    diaSeleccionado = formatoFecha(hoy);
    dibujarCalendario();
    dibujarActividades();
});

// ===== Ventana "Nueva actividad" =====
const ventanaActividad = document.getElementById('modal-actividad');

ventanaActividad.addEventListener('show.bs.modal', function () {
    document.getElementById('modal-fecha').textContent = textoFecha(diaSeleccionado);
});

document.getElementById('form-actividad').addEventListener('submit', function (evento) {
    evento.preventDefault();

    agregarActividad(document.getElementById('tipo-actividad').value);
    bootstrap.Modal.getOrCreateInstance(ventanaActividad).hide();
});

// ===== Primer dibujo =====
dibujarCalendario();
dibujarActividades();
cargarDatosBD(); // ===== MySQL: luego se actualiza con lo que hay en la base =====