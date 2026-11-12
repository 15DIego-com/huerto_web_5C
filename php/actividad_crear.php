<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$d = json_decode(file_get_contents("php://input"), true) ?? [];
$fecha     = trim($d["fecha"] ?? "");
$actividad = trim($d["actividad"] ?? "");

if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) || $actividad === "" || mb_strlen($actividad) > 60) {
    echo json_encode(["ok" => false, "mensaje" => "Datos de la actividad no válidos"]);
    exit;
}

$insert = $conexion->prepare(
    "INSERT INTO actividades (usuario_id, fecha, actividad) VALUES (?, ?, ?)"
);
$insert->execute([$_SESSION["usuario"]["id"], $fecha, $actividad]);

echo json_encode(["ok" => true, "id" => $conexion->lastInsertId()]);