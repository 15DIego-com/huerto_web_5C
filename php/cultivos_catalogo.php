<?php
require "inventario_comun.php";
usuarioActual();

// Catálogo de cultivos con sus nutrientes
$sql = "SELECT c.id, c.nombre, c.unidad_base, c.dias_cosecha, c.emoji,
               GROUP_CONCAT(CONCAT(n.nombre, '::', n.beneficio) ORDER BY n.nombre SEPARATOR '||') AS nutrientes
        FROM cultivos c
        LEFT JOIN cultivo_nutriente cn ON cn.cultivo_id = c.id
        LEFT JOIN nutrientes n ON n.id = cn.nutriente_id
        GROUP BY c.id
        ORDER BY c.nombre";

$cultivos = $conexion->query($sql)->fetchAll();
foreach ($cultivos as &$cultivo) {
    $cultivo["nutrientes"] = separarNutrientes($cultivo["nutrientes"]);
}

responder(["ok" => true, "cultivos" => $cultivos]);