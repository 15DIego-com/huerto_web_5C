<?php
require "solo_admin.php";

// Todos los usuarios, con su huerto si tienen
$sql = "SELECT u.id, u.nombre, u.correo, u.tipo, u.activo,
               h.id AS huerto_id, h.nombre AS huerto_nombre, h.ubicacion, h.calle, h.municipio, h.estado,
               h.codigo_postal, h.tipo_cultivo, h.medidas, h.latitud, h.longitud, h.precision_m
        FROM usuarios u
        LEFT JOIN huertos h ON h.usuario_id = u.id
        ORDER BY u.id";

$usuarios = $conexion->query($sql)->fetchAll();

echo json_encode(["ok" => true, "usuarios" => $usuarios, "yo" => $admin["id"]]);