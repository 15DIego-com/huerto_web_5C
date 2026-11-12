<?php
require "solo_admin.php";

$d = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($d["id"] ?? 0);
$activo = !empty($d["activo"]) ? 1 : 0;

if ($id === (int)$admin["id"]) {
    echo json_encode(["ok" => false, "mensaje" => "No puedes desactivar tu propia cuenta"]);
    exit;
}

$conexion->prepare("UPDATE usuarios SET activo = ? WHERE id = ?")->execute([$activo, $id]);

echo json_encode(["ok" => true]);