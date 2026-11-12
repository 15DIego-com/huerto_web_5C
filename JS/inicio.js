// ===== Proteger la página: si no hay sesión, regresar al login =====
if (sessionStorage.getItem('sesionActiva') !== 'true') {
    window.location.href = 'login.html';
}

// ===== Datos del usuario =====
// El nombre sale de la sesión; los cultivos, de la base de datos
const NOMBRE_POR_DEFECTO = sessionStorage.getItem('nombreUsuario') || 'Usuario';
const CULTIVOS_POR_DEFECTO = '';

// Emoji de respaldo para cuando no existe la imagen del cultivo
const EMOJIS = {
    maiz: '🌽',
    chile: '🌶️',
    calabacita: '🥒',
    jitomate: '🍅',
    tomate: '🍅',
    cilantro: '🌿',
    lechuga: '🥬',
    zanahoria: '🥕',
    cebolla: '🧅',
    papa: '🥔',
    ajo: '🧄',
    frijol: '🫘'
};

// "Maíz" -> "maiz" (para buscar la imagen y el emoji)
function normalizar(texto) {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// ===== Saludo con el nombre del perfil =====
const primerNombre = NOMBRE_POR_DEFECTO.split(' ')[0];
document.getElementById('nombre-usuario').textContent = primerNombre;

// ===== Iniciales del usuario en el encabezado =====
const avatarUsuario = document.getElementById('avatar-usuario');
if (avatarUsuario) {
    avatarUsuario.textContent = NOMBRE_POR_DEFECTO
        .split(' ')
        .filter(Boolean)
        .map(p => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

// ===== Leer los cultivos guardados en el perfil =====
function leerCultivos() {
    let texto = CULTIVOS_POR_DEFECTO;
    try {
        const huerto = JSON.parse(localStorage.getItem('datosHuerto'));
        if (huerto && typeof huerto.cultivo === 'string') {
            texto = huerto.cultivo;
        }
    } catch (error) {
        // Si los datos están dañados, se usan los de por defecto
    }
    return texto.split(',').map(c => c.trim()).filter(Boolean);
}

// ===== Traer el huerto del usuario desde la base =====
async function cargarHuertoBD() {
    if (typeof obtenerHuerto !== 'function') return;   // api.js no está cargado

    const respuesta = await obtenerHuerto();

    // Si no hay conexión o sesión en el servidor, se queda con lo local
    if (!respuesta.ok) return;

    if (respuesta.huerto) {
        const h = respuesta.huerto;
        let copia = {};
        try {
            copia = JSON.parse(localStorage.getItem('datosHuerto')) || {};
        } catch (error) {
            copia = {};
        }
        // Copia local para que pedidos.js y pedido-mapa.js la sigan leyendo
        copia.cultivo   = h.tipo_cultivo || '';
        copia.nombre    = h.nombre || '';
        copia.latitud   = h.latitud;
        copia.longitud  = h.longitud;
        copia.calle     = h.calle || '';
        copia.municipio = h.municipio || '';
        copia.estado    = h.estado || '';
        copia.cp        = h.codigo_postal || '';
        localStorage.setItem('datosHuerto', JSON.stringify(copia));
    } else {
        // Este usuario aún no tiene huerto: no mostrar datos de otra cuenta
        localStorage.removeItem('datosHuerto');
    }

    mostrarResumen();
}

// ===== Crear la tarjeta de un cultivo =====
function crearCultivo(nombre) {
    const clave = normalizar(nombre);

    const item = document.createElement('div');
    item.className = 'resumen__cultivo';

    const imagen = document.createElement('img');
    imagen.src = '../imagenes/' + clave.replace(/\s+/g, '-') + '.png';
    imagen.alt = nombre;

    // Si la imagen no existe, mostrar un emoji en su lugar
    imagen.addEventListener('error', function () {
        const emoji = document.createElement('span');
        emoji.className = 'resumen__emoji';
        emoji.textContent = EMOJIS[clave] || '🌱';
        imagen.replaceWith(emoji);
    });

    const etiqueta = document.createElement('span');
    etiqueta.className = 'resumen__nombre';
    etiqueta.textContent = nombre;

    item.appendChild(imagen);
    item.appendChild(etiqueta);
    return item;
}

// ===== Mostrar el resumen del huerto =====
function mostrarResumen() {
    const contenedor = document.getElementById('resumen-cultivos');
    contenedor.innerHTML = '';

    const cultivos = leerCultivos();

    if (cultivos.length === 0) {
        const vacio = document.createElement('p');
        vacio.className = 'resumen__vacio';
        vacio.textContent = 'Aún no registras cultivos. Agrégalos en tu perfil.';
        contenedor.appendChild(vacio);
        return;
    }

    cultivos.forEach(function (cultivo) {
        contenedor.appendChild(crearCultivo(cultivo));
    });
}

// ===== Iniciar =====
mostrarResumen();
cargarHuertoBD(); // luego se actualiza con lo que hay en la base