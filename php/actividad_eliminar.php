<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$d = json_decode(file_get_contents("php://input"), true) ?? [];
$id = (int)($d["id"] ?? 0);

// Cada usuario solo puede borrar sus propias actividades
$borrar = $conexion->prepare("DELETE FROM actividades WHERE id = ? AND usuario_id = ?");
$borrar->execute([$id, $_SESSION["usuario"]["id"]]);

echo json_encode(["ok" => true]);