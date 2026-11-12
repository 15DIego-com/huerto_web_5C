<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$usuario = $_SESSION["usuario"];
$d = json_decode(file_get_contents("php://input"), true) ?? [];

$id     = (int)($d["id"] ?? 0);
$estado = !empty($d["entregado"]) ? "entregado" : "pendiente";

if ($usuario["tipo"] === "dueno") {
    // El dueño solo cambia sus propios pedidos
    $sql = "UPDATE pedidos SET estado = ? WHERE id = ? AND dueno_id = ?";
    $valores = [$estado, $id, $usuario["id"]];
} elseif ($usuario["tipo"] === "repartidor") {
    // Se guarda qué repartidor lo marcó
    $sql = "UPDATE pedidos SET estado = ?, repartidor_id = ? WHERE id = ?";
    $valores = [$estado, $usuario["id"], $id];
} else {
    $sql = "UPDATE pedidos SET estado = ? WHERE id = ?";
    $valores = [$estado, $id];
}

$conexion->prepare($sql)->execute($valores);

echo json_encode(["ok" => true]);