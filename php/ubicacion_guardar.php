<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"]) || $_SESSION["usuario"]["tipo"] !== "repartidor") {
    echo json_encode(["ok" => false, "mensaje" => "Solo el repartidor comparte su ubicación"]);
    exit;
}

$d = json_decode(file_get_contents("php://input"), true) ?? [];

if (!isset($d["lat"], $d["lon"]) || !is_numeric($d["lat"]) || !is_numeric($d["lon"])) {
    echo json_encode(["ok" => false, "mensaje" => "Ubicación no válida"]);
    exit;
}
$precision = isset($d["precision"]) && is_numeric($d["precision"]) ? $d["precision"] : null;

// Una sola fila por repartidor: si ya existe, se actualiza
$sql = "INSERT INTO ubicacion_repartidor (repartidor_id, latitud, longitud, precision_m, activo)
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
            latitud = VALUES(latitud),
            longitud = VALUES(longitud),
            precision_m = VALUES(precision_m),
            activo = 1,
            actualizado = CURRENT_TIMESTAMP";

$conexion->prepare($sql)->execute([$_SESSION["usuario"]["id"], $d["lat"], $d["lon"], $precision]);

echo json_encode(["ok" => true]);