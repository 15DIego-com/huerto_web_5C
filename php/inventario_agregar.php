<?php
require "inventario_comun.php";
$usuario = soloDueno();
$d = datosRecibidos();

$huertoId = huertoDelDueno($conexion, $usuario["id"]);
if (!$huertoId) {
    responder(["ok" => false, "mensaje" => "Primero registra tu huerto en tu perfil"], 409);
}

$cultivoId = (int)($d["cultivo_id"] ?? 0);
$cantidad  = (float)($d["cantidad_estimada"] ?? 0);
$fecha     = date("Y-m-d");   // se guarda con la fecha de hoy

if ($cantidad <= 0) {
    responder(["ok" => false, "mensaje" => "Escribe cuántos kilos tienes"], 400);
}

// El producto debe existir en el catálogo
$buscar = $conexion->prepare("SELECT id FROM cultivos WHERE id = ?");
$buscar->execute([$cultivoId]);
if (!$buscar->fetch()) {
    responder(["ok" => false, "mensaje" => "Ese producto no está en el catálogo"], 404);
}

// Si ya lo tiene en su inventario, se suman los kilos
$existe = $conexion->prepare(
    "SELECT id FROM huerto_cultivo
     WHERE huerto_id = ? AND cultivo_id = ? AND estado <> 'cosechado'
     LIMIT 1"
);
$existe->execute([$huertoId, $cultivoId]);
$fila = $existe->fetch();

if ($fila) {
    $sumar = $conexion->prepare(
        "UPDATE huerto_cultivo
         SET cantidad_estimada = cantidad_estimada + ?, unidad = 'kg'
         WHERE id = ?"
    );
    $sumar->execute([$cantidad, $fila["id"]]);
    responder(["ok" => true, "id" => (int)$fila["id"], "sumado" => true]);
}

// Si no lo tiene, se agrega (la fecha de cosecha y el estado los calcula el trigger)
$insert = $conexion->prepare(
    "INSERT INTO huerto_cultivo (huerto_id, cultivo_id, fecha_siembra, cantidad_estimada, unidad)
     VALUES (?, ?, ?, ?, 'kg')"
);
$insert->execute([$huertoId, $cultivoId, $fecha, $cantidad]);

responder(["ok" => true, "id" => (int)$conexion->lastInsertId(), "sumado" => false], 201);