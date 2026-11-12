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
$id = (int)($d["id"] ?? 0);

if ($usuario["tipo"] === "dueno") {
    $sql = "DELETE FROM pedidos WHERE id = ? AND dueno_id = ?";
    $valores = [$id, $usuario["id"]];
} elseif ($usuario["tipo"] === "admin") {
    $sql = "DELETE FROM pedidos WHERE id = ?";
    $valores = [$id];
} else {
    echo json_encode(["ok" => false, "mensaje" => "No tienes permiso para eliminar pedidos"]);
    exit;
}

$conexion->prepare($sql)->execute($valores);

echo json_encode(["ok" => true]);