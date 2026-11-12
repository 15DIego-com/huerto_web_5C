<?php
require "solo_admin.php";

$d = json_decode(file_get_contents("php://input"), true) ?? [];
$usuarioId = (int)($d["usuario_id"] ?? 0);

// Inventario del huerto de ese dueño, sumando los kilos por producto
$sql = "SELECT c.id, c.nombre, c.emoji, SUM(hc.cantidad_estimada) AS kilos
        FROM huerto_cultivo hc
        JOIN huertos h  ON h.id = hc.huerto_id
        JOIN cultivos c ON c.id = hc.cultivo_id
        WHERE h.usuario_id = ?
        GROUP BY c.id, c.nombre, c.emoji
        ORDER BY c.nombre";

$consulta = $conexion->prepare($sql);
$consulta->execute([$usuarioId]);

echo json_encode(["ok" => true, "productos" => $consulta->fetchAll()]);