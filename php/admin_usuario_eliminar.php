<?php
require "solo_admin.php";

$d = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($d["id"] ?? 0);

if ($id === (int)$admin["id"]) {
    echo json_encode(["ok" => false, "mensaje" => "No puedes eliminar tu propia cuenta"]);
    exit;
}

// Por las llaves foráneas, también se borran su huerto, pedidos y actividades
$conexion->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$id]);

echo json_encode(["ok" => true]);