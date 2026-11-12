// ===== api.js: funciones para hablar con la base de datos (PHP + MySQL) =====
// Las páginas están en paginas/, por eso la ruta sube un nivel
const RUTA_PHP = "../php/";

// Manda datos a un archivo PHP y regresa su respuesta en JSON
async function llamarPHP(archivo, datos) {
  try {
    const resp = await fetch(RUTA_PHP + archivo, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });
    const respuesta = await resp.json();

    // Si el servidor ya no tiene la sesión (se venció), regresar al login
    if (resp.status === 401 || respuesta.mensaje === "Sesión no iniciada") {
      sessionStorage.clear();
      alert("Tu sesión expiró. Vuelve a iniciar sesión.");
      window.location.href = "login.html";
    }

    return respuesta;
  } catch (error) {
    return { ok: false, mensaje: "No se pudo conectar con el servidor" };
  }
}

// ===== Usuarios =====
function registrarUsuario(nombre, correo, password, tipo) {
  return llamarPHP("registro.php", { nombre, correo, password, tipo });
}

function iniciarSesion(correo, password, tipo) {
  return llamarPHP("login.php", { correo, password, tipo });
}

// ===== Sesión =====
function cerrarSesionBD() {
  return llamarPHP("logout.php", {});
}

// ===== Huerto =====
function obtenerHuerto() {
  return llamarPHP("obtener_huerto.php", {});
}

function guardarHuertoBD(datos) {
  return llamarPHP("guardar_huerto.php", datos);
}

// ===== Pedidos =====
function listarPedidos() {
  return llamarPHP("pedidos_listar.php", {});
}

function crearPedidoBD(pedido) {
  return llamarPHP("pedido_crear.php", pedido);
}

function cambiarEstadoPedidoBD(id, entregado) {
  return llamarPHP("pedido_estado.php", { id, entregado });
}

function eliminarPedidoBD(id) {
  return llamarPHP("pedido_eliminar.php", { id });
}

// Convierte un pedido de la base al formato que usan las páginas
function pedidoDesdeBD(fila) {
  const pedido = {
    id: Number(fila.id),
    cliente: fila.cliente || "",
    producto: fila.producto || fila.descripcion || "",
    cantidad: fila.cantidad !== null ? Number(fila.cantidad) : 0,
    unidad: fila.unidad || "",
    fecha: fila.fecha_entrega || "",
    entregado: fila.estado === "entregado",
    duenoId: Number(fila.dueno_id),
    duenoNombre: fila.dueno_nombre || "",
    repartidorId: fila.repartidor_id !== null ? Number(fila.repartidor_id) : null
  };

  // Ubicación de entrega
  if (fila.latitud !== null && fila.longitud !== null) {
    pedido.latitud = Number(fila.latitud);
    pedido.longitud = Number(fila.longitud);
  }
  if (fila.precision_m !== null) pedido.precision = Number(fila.precision_m);
  if (fila.direccion) pedido.direccion = fila.direccion;

  // Huerto del dueño (de dónde se recoge el pedido)
  if (fila.huerto_latitud !== null && fila.huerto_latitud !== undefined &&
      fila.huerto_longitud !== null && fila.huerto_longitud !== undefined) {
    pedido.huertoLat = Number(fila.huerto_latitud);
    pedido.huertoLon = Number(fila.huerto_longitud);
    pedido.huertoNombre = fila.huerto_nombre || "";
  }

  return pedido;
}

// ===== Actividades del calendario =====
function listarActividades() {
  return llamarPHP("actividades_listar.php", {});
}

function crearActividadBD(fecha, actividad) {
  return llamarPHP("actividad_crear.php", { fecha, actividad });
}

function eliminarActividadBD(id) {
  return llamarPHP("actividad_eliminar.php", { id });
}

// ===== Ubicación del repartidor =====
function guardarUbicacionBD(lat, lon, precision) {
  return llamarPHP("ubicacion_guardar.php", { lat, lon, precision });
}

// Se usa al salir de la página: sendBeacon sí llega aunque la página se esté cerrando
function borrarUbicacionBD() {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(RUTA_PHP + "ubicacion_borrar.php",
      new Blob(["{}"], { type: "application/json" }));
  } else {
    llamarPHP("ubicacion_borrar.php", {});
  }
}

// ===== Administrador =====
function adminListarUsuarios() {
  return llamarPHP("admin_usuarios.php", {});
}

function adminCrearUsuario(nombre, correo, password, tipo) {
  return llamarPHP("admin_usuario_crear.php", { nombre, correo, password, tipo });
}

function adminCambiarEstadoUsuario(id, activo) {
  return llamarPHP("admin_usuario_estado.php", { id, activo });
}

function adminEliminarUsuario(id) {
  return llamarPHP("admin_usuario_eliminar.php", { id });
}

// Ubicación en vivo de los repartidores (para el mapa del admin)
function adminUbicacionRepartidores() {
  return llamarPHP("admin_ubicaciones.php", {});
}

// ===== Inventario de cosecha =====
function catalogoCultivos() {
  return llamarPHP("cultivos_catalogo.php", {});
}

function listarInventario() {
  return llamarPHP("inventario_listar.php", {});
}

function agregarCultivoBD(cultivo_id, cantidad_estimada) {
  return llamarPHP("inventario_agregar.php", { cultivo_id, cantidad_estimada });
}

function eliminarCultivoBD(id) {
  return llamarPHP("inventario_eliminar.php", { id });
}
// Inventario del huerto de un dueño (para el panel del admin)
function adminInventarioHuerto(usuario_id) {
  return llamarPHP("admin_inventario.php", { usuario_id });
}

// ===== Solo para las pruebas unitarias (Jest). En el navegador no hace nada =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { llamarPHP, registrarUsuario, iniciarSesion, agregarCultivoBD, pedidoDesdeBD };
}