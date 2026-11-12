<?php
require "solo_admin.php";

// Repartidores que están compartiendo su ubicación (de las últimas 12 horas)
$sql = "SELECT r.repartidor_id, u.nombre, r.latitud, r.longitud, r.precision_m,
               UNIX_TIMESTAMP(r.actualizado) * 1000 AS hora
        FROM ubicacion_repartidor r
        JOIN usuarios u ON u.id = r.repartidor_id
        WHERE r.activo = 1 AND r.actualizado > NOW() - INTERVAL 12 HOUR";

echo json_encode(["ok" => true, "repartidores" => $conexion->query($sql)->fetchAll()]);