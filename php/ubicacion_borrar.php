<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"]) || $_SESSION["usuario"]["tipo"] !== "repartidor") {
    echo json_encode(["ok" => false]);
    exit;
}

// No se borra la fila, solo se marca como inactiva
$conexion->prepare("UPDATE ubicacion_repartidor SET activo = 0 WHERE repartidor_id = ?")
         ->execute([$_SESSION["usuario"]["id"]]);

echo json_encode(["ok" => true]);