<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$usuario = $_SESSION["usuario"];

// MySQL: también se trae el huerto del dueño (para el mapa del repartidor y del admin)
$sql = "SELECT p.*, u.nombre AS dueno_nombre,
               h.nombre AS huerto_nombre, h.latitud AS huerto_latitud, h.longitud AS huerto_longitud
        FROM pedidos p
        JOIN usuarios u ON u.id = p.dueno_id
        LEFT JOIN huertos h ON h.usuario_id = p.dueno_id";
$valores = [];

// El dueño solo ve sus pedidos; admin y repartidor ven todos
if ($usuario["tipo"] === "dueno") {
    $sql .= " WHERE p.dueno_id = ?";
    $valores[] = $usuario["id"];
}

$sql .= " ORDER BY p.fecha_entrega IS NULL, p.fecha_entrega, p.id";

$consulta = $conexion->prepare($sql);
$consulta->execute($valores);

echo json_encode(["ok" => true, "pedidos" => $consulta->fetchAll()]);