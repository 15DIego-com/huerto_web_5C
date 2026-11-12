// ===== Pruebas unitarias de api.js (Jest) =====
// Se simula el servidor con un "fetch" falso: no se necesita XAMPP ni MySQL.
const api = require('../JS/api.js');

// Respuesta falsa del servidor
function respuestaFalsa(cuerpo, status = 200) {
  return Promise.resolve({ status: status, json: () => Promise.resolve(cuerpo) });
}

// Antes de cada prueba se simulan las cosas del navegador
beforeEach(() => {
  global.fetch = jest.fn();
  global.sessionStorage = { clear: jest.fn() };
  global.alert = jest.fn();
  global.window = { location: { href: '' } };
});

// ===== llamarPHP: la función base que habla con el servidor =====
describe('llamarPHP', () => {
  test('CP-U01 manda una petición POST con JSON al archivo PHP correcto', async () => {
    fetch.mockReturnValue(respuestaFalsa({ ok: true }));

    await api.llamarPHP('login.php', { correo: 'a@a.com' });

    expect(fetch).toHaveBeenCalledWith('../php/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'a@a.com' })
    });
  });

  test('CP-U02 regresa la respuesta que manda el servidor', async () => {
    fetch.mockReturnValue(respuestaFalsa({ ok: true, id: 7 }));

    const respuesta = await api.llamarPHP('pedido_crear.php', {});

    expect(respuesta).toEqual({ ok: true, id: 7 });
  });

  test('CP-U03 si no hay conexión regresa ok:false con un mensaje (no truena)', async () => {
    fetch.mockReturnValue(Promise.reject(new Error('Sin red')));

    const respuesta = await api.llamarPHP('login.php', {});

    expect(respuesta).toEqual({ ok: false, mensaje: 'No se pudo conectar con el servidor' });
  });

  test('CP-U04 si la sesión venció (401) limpia la sesión y manda al login', async () => {
    fetch.mockReturnValue(respuestaFalsa({ ok: false, mensaje: 'Sesión no iniciada' }, 401));

    await api.llamarPHP('inventario_listar.php', {});

    expect(sessionStorage.clear).toHaveBeenCalled();
    expect(window.location.href).toBe('login.html');
  });
});

// ===== Funciones que usan las páginas =====
describe('Funciones de la API', () => {
  test('CP-U05 registrarUsuario manda nombre, correo, contraseña y tipo a registro.php', async () => {
    fetch.mockReturnValue(respuestaFalsa({ ok: true }));

    await api.registrarUsuario('Ana', 'ana@correo.com', '12345678', 'dueno');

    const [url, opciones] = fetch.mock.calls[0];
    expect(url).toBe('../php/registro.php');
    expect(JSON.parse(opciones.body)).toEqual({
      nombre: 'Ana', correo: 'ana@correo.com', password: '12345678', tipo: 'dueno'
    });
  });

  test('CP-U06 agregarCultivoBD manda el producto y los kilos a inventario_agregar.php', async () => {
    fetch.mockReturnValue(respuestaFalsa({ ok: true, sumado: false }));

    await api.agregarCultivoBD(1, 12.5);

    const [url, opciones] = fetch.mock.calls[0];
    expect(url).toBe('../php/inventario_agregar.php');
    expect(JSON.parse(opciones.body)).toEqual({ cultivo_id: 1, cantidad_estimada: 12.5 });
  });
});

// ===== pedidoDesdeBD: convierte un pedido de MySQL al formato de las páginas =====
describe('pedidoDesdeBD', () => {
  // Así llega un pedido desde MySQL (los números vienen como texto)
  const filaBase = {
    id: '5', cliente: 'Juan', producto: 'Jitomate', descripcion: null,
    cantidad: '3.50', unidad: 'kg', fecha_entrega: '2026-11-01', estado: 'pendiente',
    dueno_id: '2', dueno_nombre: 'Diego', repartidor_id: null,
    latitud: '20.1234', longitud: '-99.2345', precision_m: null, direccion: 'Calle 1',
    huerto_latitud: null, huerto_longitud: null, huerto_nombre: null
  };

  test('CP-U07 convierte a número los datos que llegan como texto', () => {
    const pedido = api.pedidoDesdeBD(filaBase);

    expect(pedido.id).toBe(5);
    expect(pedido.cantidad).toBe(3.5);
    expect(pedido.latitud).toBe(20.1234);
    expect(pedido.longitud).toBe(-99.2345);
  });

  test('CP-U08 marca "entregado" solo cuando el estado es entregado', () => {
    expect(api.pedidoDesdeBD(filaBase).entregado).toBe(false);
    expect(api.pedidoDesdeBD({ ...filaBase, estado: 'entregado' }).entregado).toBe(true);
  });

  test('CP-U09 si el pedido no tiene ubicación, no agrega coordenadas', () => {
    const pedido = api.pedidoDesdeBD({ ...filaBase, latitud: null, longitud: null });

    expect(pedido.latitud).toBeUndefined();
    expect(pedido.longitud).toBeUndefined();
  });

  test('CP-U10 si el pedido no tiene fecha, regresa fecha vacía', () => {
    const pedido = api.pedidoDesdeBD({ ...filaBase, fecha_entrega: null });

    expect(pedido.fecha).toBe('');
  });
});