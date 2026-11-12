// ===== Proteger la página: si no hay sesión, regresar al login =====
if (sessionStorage.getItem('sesionActiva') !== 'true') {
    window.location.href = 'login.html';
}

// ===== Datos del perfil (se llenan con la sesión y la base de datos) =====
const PERFIL = {
    nombre: '',
    correo: '',
    cultivo: '',
    calle: '',
    municipio: '',
    estado: '',
    cp: ''
};

// ===== Nombre y correo del usuario que inició sesión =====
PERFIL.nombre = sessionStorage.getItem('nombreUsuario') || PERFIL.nombre;
PERFIL.correo = sessionStorage.getItem('correoUsuario') || PERFIL.correo;

// ===== Si ya hay datos del huerto guardados, usarlos =====
function cargarHuerto() {
    try {
        const huerto = JSON.parse(localStorage.getItem('datosHuerto'));
        if (!huerto) return;

        // Compatibilidad con el registro anterior: "Municipio, Estado"
        if (huerto.ubicacion && !huerto.municipio) {
            const partes = huerto.ubicacion.split(',').map(p => p.trim());
            PERFIL.municipio = partes[0] || PERFIL.municipio;
            PERFIL.estado = partes[1] || PERFIL.estado;
        }
        ['cultivo', 'calle', 'municipio', 'estado', 'cp'].forEach(campo => {
            if (huerto[campo] !== undefined) PERFIL[campo] = huerto[campo];
        });
    } catch (error) {
        // Si los datos guardados están dañados, se usan los de por defecto
    }
}

function guardarHuerto() {
    let huerto = {};
    try {
        huerto = JSON.parse(localStorage.getItem('datosHuerto')) || {};
    } catch (error) {
        huerto = {};
    }
    ['cultivo', 'calle', 'municipio', 'estado', 'cp'].forEach(campo => {
        huerto[campo] = PERFIL[campo];
    });
    // Se mantiene el campo "ubicacion" para que otras páginas lo sigan leyendo
    huerto.ubicacion = PERFIL.municipio + ', ' + PERFIL.estado;
    localStorage.setItem('datosHuerto', JSON.stringify(huerto));
}

// ===== Traer el huerto del usuario desde la base =====
async function cargarHuertoBD() {
    const respuesta = await obtenerHuerto();

    // Si no hay conexión o sesión en el servidor, se queda con lo local
    if (!respuesta.ok) return;

    if (respuesta.huerto) {
        const h = respuesta.huerto;
        PERFIL.cultivo   = h.tipo_cultivo  || '';
        PERFIL.calle     = h.calle         || '';
        PERFIL.municipio = h.municipio     || '';
        PERFIL.estado    = h.estado        || '';
        PERFIL.cp        = h.codigo_postal || '';
        guardarHuerto(); // actualiza la copia local para las demás páginas

        // También nombre, coordenadas y precisión (los usa perfil-mapa.js)
        let copia = {};
        try {
            copia = JSON.parse(localStorage.getItem('datosHuerto')) || {};
        } catch (error) {
            copia = {};
        }
        copia.nombre    = h.nombre || '';
        copia.latitud   = h.latitud;
        copia.longitud  = h.longitud;
        copia.precision = h.precision_m;
        if (h.ubicacion) copia.ubicacion = h.ubicacion;
        localStorage.setItem('datosHuerto', JSON.stringify(copia));
    } else {
        // Este usuario aún no tiene huerto: no mostrar datos de otra cuenta
        localStorage.removeItem('datosHuerto');
        PERFIL.cultivo = PERFIL.calle = PERFIL.municipio = PERFIL.estado = PERFIL.cp = '';
    }

    mostrarCultivos();
    mostrarUbicacion();

    // Avisar al mapa del perfil que ya llegaron los datos de la base
    document.dispatchEvent(new Event('huerto-actualizado'));
}

// ===== Guardar cultivo y ubicación en la base =====
async function guardarHuertoEnBD() {
    const respuesta = await guardarHuertoBD({
        cultivo:   PERFIL.cultivo,
        calle:     PERFIL.calle,
        municipio: PERFIL.municipio,
        estado:    PERFIL.estado,
        cp:        PERFIL.cp
    });

    if (!respuesta.ok) {
        mostrarAviso('No se pudo guardar en la base de datos');
    }
}

// ===== Mostrar datos en pantalla =====
function mostrarUsuario() {
    document.getElementById('perfil-nombre').textContent = PERFIL.nombre;
    document.getElementById('perfil-correo').textContent = PERFIL.correo;

    // Iniciales del usuario
    const iniciales = document.getElementById('perfil-iniciales');
    iniciales.textContent = PERFIL.nombre
        .split(' ')
        .filter(Boolean)
        .map(p => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    // Si algún día se vuelve a poner foto: si no carga, se muestran las iniciales
    const avatar = document.getElementById('perfil-avatar');
    if (avatar) {
        avatar.addEventListener('error', function () {
            avatar.hidden = true;
            iniciales.hidden = false;
        });
    }
}

function mostrarCultivos() {
    const contenedor = document.getElementById('perfil-cultivos');
    contenedor.innerHTML = '';

    const lista = PERFIL.cultivo.split(',').map(c => c.trim()).filter(Boolean);

    if (lista.length === 0) {
        const vacio = document.createElement('span');
        vacio.className = 'chip chip--vacio';
        vacio.textContent = 'Sin registrar';
        contenedor.appendChild(vacio);
        return;
    }

    lista.forEach(cultivo => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = cultivo;
        contenedor.appendChild(chip);
    });
}

function mostrarUbicacion() {
    document.getElementById('perfil-calle').textContent = PERFIL.calle;
    document.getElementById('perfil-municipio').textContent = PERFIL.municipio;
    document.getElementById('perfil-estado').textContent = PERFIL.estado;
    document.getElementById('perfil-cp').textContent = PERFIL.cp;
}

// ===== Aviso al guardar =====
let temporizadorAviso;
function mostrarAviso(mensaje) {
    const aviso = document.getElementById('aviso');
    aviso.textContent = mensaje;
    aviso.classList.add('aviso--visible');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () {
        aviso.classList.remove('aviso--visible');
    }, 2000);
}

// ===== Alternar entre vista y edición =====
// seccion: 'cultivo' o 'ubicacion'
function alternarEdicion(seccion, editando) {
    const tarjeta = document.getElementById('tarjeta-' + seccion);
    const vista = document.getElementById('vista-' + seccion);
    const formulario = document.getElementById('form-' + seccion);
    const boton = tarjeta.querySelector('[data-editar]');

    vista.hidden = editando;
    formulario.hidden = !editando;
    boton.hidden = editando;
    tarjeta.classList.toggle('tarjeta-perfil--editando', editando);

    if (editando) {
        // Rellenar el formulario con los datos actuales
        Array.from(formulario.elements).forEach(campo => {
            if (campo.name && PERFIL[campo.name] !== undefined) {
                campo.value = PERFIL[campo.name];
                campo.classList.remove('invalido');
            }
        });
        const error = document.getElementById('error-' + seccion);
        if (error) error.hidden = true;
        formulario.elements[0].focus();
    }
}

document.querySelectorAll('[data-editar]').forEach(function (boton) {
    boton.addEventListener('click', function () {
        alternarEdicion(boton.dataset.editar, true);
    });
});

document.querySelectorAll('[data-cancelar]').forEach(function (boton) {
    boton.addEventListener('click', function () {
        alternarEdicion(boton.dataset.cancelar, false);
    });
});

// ===== Guardar cultivo =====
document.getElementById('form-cultivo').addEventListener('submit', function (evento) {
    evento.preventDefault();
    PERFIL.cultivo = this.elements.cultivo.value.trim();
    guardarHuerto();
    guardarHuertoEnBD();
    mostrarCultivos();
    alternarEdicion('cultivo', false);
    mostrarAviso('Cultivos actualizados');
});

// ===== Guardar ubicación (con validación) =====
document.getElementById('form-ubicacion').addEventListener('submit', function (evento) {
    evento.preventDefault();
    const formulario = this;
    const error = document.getElementById('error-ubicacion');
    const municipio = formulario.elements.municipio;
    const estado = formulario.elements.estado;
    const cp = formulario.elements.cp;

    [municipio, estado, cp].forEach(c => c.classList.remove('invalido'));

    let mensaje = '';
    if (!municipio.value.trim()) {
        municipio.classList.add('invalido');
        mensaje = 'El municipio es obligatorio.';
    } else if (!estado.value.trim()) {
        estado.classList.add('invalido');
        mensaje = 'El estado es obligatorio.';
    } else if (cp.value.trim() && !/^\d{5}$/.test(cp.value.trim())) {
        cp.classList.add('invalido');
        mensaje = 'El código postal debe tener 5 dígitos.';
    }

    if (mensaje) {
        error.textContent = mensaje;
        error.hidden = false;
        return;
    }

    PERFIL.calle = formulario.elements.calle.value.trim();
    PERFIL.municipio = municipio.value.trim();
    PERFIL.estado = estado.value.trim();
    PERFIL.cp = cp.value.trim();

    guardarHuerto();
    guardarHuertoEnBD();
    mostrarUbicacion();
    alternarEdicion('ubicacion', false);
    mostrarAviso('Ubicación actualizada');
});

// ===== Cerrar sesión =====
document.getElementById('btn-cerrar-sesion').addEventListener('click', async function () {
    sessionStorage.removeItem('sesionActiva');
    await cerrarSesionBD(); // también cierra la sesión del servidor
    window.location.href = '../index.html';
});

// ===== Iniciar =====
cargarHuerto();
mostrarUsuario();
mostrarCultivos();
mostrarUbicacion();
cargarHuertoBD(); // luego se actualiza con lo que hay en la base