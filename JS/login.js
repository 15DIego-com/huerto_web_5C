// ===== Página de destino según el tipo de usuario =====
const PAGINAS_POR_TIPO = {
    'Dueño del Huerto': 'inicio.html',
    'Administrador': 'admin.html',
    'Repartidor': 'repartidor.html'
};

// Página por defecto si el tipo no está en la lista
const PAGINA_DESTINO = 'inicio.html';

// ===== Elementos =====
const formularioLogin = document.getElementById('form-login');
const mensajeError    = document.getElementById('mensaje-error');
const selectorTipo    = document.getElementById('tipo-usuario');

// ===== Al presionar "Iniciar Sesión" =====
formularioLogin.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    const tipo       = selectorTipo.value;
    const correo     = document.getElementById('correo').value.trim();
    const contrasena = document.getElementById('contrasena').value;

    // Se busca el usuario en la base de datos
    const respuesta = await iniciarSesion(correo, contrasena, tipo);

    if (respuesta.ok) {
        const usuario = respuesta.usuario;
        sessionStorage.setItem('sesionActiva', 'true');
        sessionStorage.setItem('idUsuario', usuario.id);
        sessionStorage.setItem('tipoUsuario', tipo); // mismo texto que antes, para no romper las otras páginas
        sessionStorage.setItem('nombreUsuario', usuario.nombre);
        sessionStorage.setItem('correoUsuario', usuario.correo);
        window.location.href = PAGINAS_POR_TIPO[tipo] || PAGINA_DESTINO;
    } else {
        mensajeError.textContent = respuesta.mensaje;
        mensajeError.classList.remove('d-none');
    }
});

// Ocultar el error en cuanto el usuario vuelve a escribir
formularioLogin.addEventListener('input', function () {
    mensajeError.classList.add('d-none');
});

// ===== Si la imagen de la planta no carga, mostrar un emoji =====
const planta = document.querySelector('.planta');

function mostrarPlantaDeRespaldo() {
    const emoji = document.createElement('span');
    emoji.className = 'planta planta--emoji';
    emoji.textContent = '🌱';
    emoji.setAttribute('role', 'img');
    emoji.setAttribute('aria-label', 'Planta brotando de la tierra');
    planta.replaceWith(emoji);
}

if (planta.complete && planta.naturalWidth === 0) {
    mostrarPlantaDeRespaldo();
} else {
    planta.addEventListener('error', mostrarPlantaDeRespaldo);
}