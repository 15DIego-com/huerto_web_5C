// ===== Elementos =====
const formulario      = document.getElementById('form-registro');
const vistaFormulario = document.getElementById('vista-formulario');
const vistaValido     = document.getElementById('vista-valido');
const vistaError      = document.getElementById('vista-error');
const detalleError    = document.getElementById('detalle-error'); // opcional

// ===== Reglas de validación (se pueden cambiar aquí) =====
// El Administrador no se puede registrar aquí: se crea desde el panel de administración
const ROLES_PERMITIDOS   = ['dueno', 'repartidor'];
const REGEX_CORREO       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MINIMA    = 8;

// ===== Mostrar solo una vista a la vez =====
function mostrarVista(vista) {
    [vistaFormulario, vistaValido, vistaError].forEach(function (v) {
        v.classList.add('d-none');
    });
    vista.classList.remove('d-none');
}

// ===== Mostrar la vista de error con el motivo =====
function mostrarError(mensaje) {
    if (detalleError) {
        detalleError.textContent = mensaje;
    }
    mostrarVista(vistaError);
}

// ===== Validar los datos del formulario =====
function datosValidos(datos) {
    const rolValido        = ROLES_PERMITIDOS.includes(datos.rol);
    const nombreValido     = datos.nombre.trim() !== '';
    const correoValido     = REGEX_CORREO.test(datos.correo.trim());
    const contrasenaValida = datos.contrasena.length >= LONGITUD_MINIMA;
    const coinciden        = datos.contrasena === datos.confirmar;

    return rolValido && nombreValido && correoValido && contrasenaValida && coinciden;
}

// ===== Al presionar "Registrarme" =====
formulario.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    const datos = {
        rol:        document.getElementById('rol').value,
        nombre:     document.getElementById('nombre').value,
        correo:     document.getElementById('correo').value,
        contrasena: document.getElementById('contrasena').value,
        confirmar:  document.getElementById('confirmar').value
    };

    // 1. Primero se revisa aquí en el navegador
    if (!datosValidos(datos)) {
        mostrarError('Revisa que todos los campos estén completos y las contraseñas coincidan.');
        return;
    }

    // 2. Si está bien, se manda a la base de datos
    const respuesta = await registrarUsuario(
        datos.nombre.trim(),
        datos.correo.trim(),
        datos.contrasena,
        datos.rol
    );

    if (respuesta.ok) {
        document.getElementById('resumen-usuario').value    = datos.nombre.trim();
        document.getElementById('resumen-correo').value     = datos.correo.trim();
        document.getElementById('resumen-contrasena').value = datos.contrasena;
        mostrarVista(vistaValido);
    } else {
        // Por ejemplo: "Ese correo ya está registrado"
        mostrarError(respuesta.mensaje);
    }
});

// ===== Al presionar "Volver a intentar" =====
document.getElementById('btn-volver').addEventListener('click', function () {
    formulario.reset();
    if (detalleError) {
        detalleError.textContent = ''; // limpia el motivo anterior
    }
    mostrarVista(vistaFormulario);
});

// ===== Textos y páginas según el rol =====
// (los textos son los mismos que usa login.js, así las demás páginas lo reconocen)
const TEXTO_POR_ROL = {
    dueno: 'Dueño del Huerto',
    repartidor: 'Repartidor'
};

const PAGINA_POR_ROL = {
    dueno: 'inicio.html',
    repartidor: 'repartidor.html'
};

// ===== Al presionar "Registrarte" entra directo con la cuenta nueva =====
document.getElementById('btn-confirmar').addEventListener('click', async function () {
    const rol        = document.getElementById('rol').value;
    const correo     = document.getElementById('correo').value.trim();
    const contrasena = document.getElementById('contrasena').value;

    const respuesta = await iniciarSesion(correo, contrasena, rol);

    if (respuesta.ok) {
        const usuario = respuesta.usuario;
        sessionStorage.setItem('sesionActiva', 'true');
        sessionStorage.setItem('idUsuario', usuario.id);
        sessionStorage.setItem('tipoUsuario', TEXTO_POR_ROL[rol]);
        sessionStorage.setItem('nombreUsuario', usuario.nombre);
        sessionStorage.setItem('correoUsuario', usuario.correo);
        window.location.href = PAGINA_POR_ROL[rol] || 'inicio.html';
    } else {
        // Si algo falla, lo manda al login normal
        window.location.href = 'login.html';
    }
});

// ===== Recordatorio del largo de la contraseña (cambia de color al escribir) =====
const campoContrasena = document.getElementById('contrasena');
const ayudaContrasena = document.getElementById('ayuda-contrasena');

function revisarLargoContrasena() {
    const largo = campoContrasena.value.length;
    ayudaContrasena.classList.toggle('ayuda-contrasena--ok', largo >= LONGITUD_MINIMA);
    ayudaContrasena.classList.toggle('ayuda-contrasena--error', largo > 0 && largo < LONGITUD_MINIMA);
}

campoContrasena.addEventListener('input', revisarLargoContrasena);

// Al limpiar el formulario ("Volver a intentar") regresa a su color normal
formulario.addEventListener('reset', function () {
    setTimeout(revisarLargoContrasena, 0);
});