<?php
require "inventario_comun.php";
$usuario = soloDueno();
$d = datosRecibidos();

$id       = (int)($d["id"] ?? 0);
$cantidad = (float)($d["cantidad"] ?? 0);
$destino  = $d["destino"] ?? "disponible";

if ($cantidad <= 0 || !in_array($destino, ["disponible", "vendido", "donado", "merma"], true)) {
    responder(["ok" => false, "mensaje" => "Revisa la cantidad y el destino de la cosecha"], 400);
}

// El cultivo debe ser de un huerto de este dueño
$buscar = $conexion->prepare(
    "SELECT hc.id FROM huerto_cultivo hc
     JOIN huertos h ON h.id = hc.huerto_id
     WHERE hc.id = ? AND h.usuario_id = ?"
);
$buscar->execute([$id, $usuario["id"]]);
if (!$buscar->fetch()) {
    responder(["ok" => false, "mensaje" => "No se encontró ese cultivo"], 404);
}

// Procedimiento almacenado: guarda la cosecha y marca el cultivo como cosechado
$llamada = $conexion->prepare("CALL registrar_cosecha(?, ?, ?)");
$llamada->execute([$id, $cantidad, $destino]);
$llamada->closeCursor();

responder(["ok" => true]);