<?php
require "inventario_comun.php";
$usuario = soloDueno();
$d = datosRecibidos();
$id = (int)($d["id"] ?? 0);

// Solo borra si el producto es de un huerto de este dueño
$borrar = $conexion->prepare(
    "DELETE hc FROM huerto_cultivo hc
     JOIN huertos h ON h.id = hc.huerto_id
     WHERE hc.id = ? AND h.usuario_id = ?"
);
$borrar->execute([$id, $usuario["id"]]);

if ($borrar->rowCount() === 0) {
    responder(["ok" => false, "mensaje" => "No se encontró ese producto"], 404);
}

responder(["ok" => true]);