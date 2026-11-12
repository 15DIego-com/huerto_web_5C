<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$consulta = $conexion->prepare(
    "SELECT id, fecha, actividad FROM actividades WHERE usuario_id = ? ORDER BY fecha, id"
);
$consulta->execute([$_SESSION["usuario"]["id"]]);

echo json_encode(["ok" => true, "actividades" => $consulta->fetchAll()]);