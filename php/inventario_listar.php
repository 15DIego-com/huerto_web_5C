<?php
require "inventario_comun.php";
$usuario = soloDueno();

$huertoId = huertoDelDueno($conexion, $usuario["id"]);
if (!$huertoId) {
    responder(["ok" => true, "sinHuerto" => true, "cultivos" => []]);
}

// Primero se actualizan los estados según la fecha de hoy (procedimiento almacenado)
$llamada = $conexion->prepare("CALL actualizar_estados_cultivos()");
$llamada->execute();
$llamada->closeCursor();

// Productos del huerto con su nombre y emoji
$sql = "SELECT hc.id, hc.cultivo_id, c.nombre, c.emoji,
               hc.cantidad_estimada, hc.unidad, hc.estado
        FROM huerto_cultivo hc
        JOIN cultivos c ON c.id = hc.cultivo_id
        WHERE hc.huerto_id = ?
        ORDER BY c.nombre";

$consulta = $conexion->prepare($sql);
$consulta->execute([$huertoId]);

responder(["ok" => true, "sinHuerto" => false, "cultivos" => $consulta->fetchAll()]);