<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}
if ($_SESSION["usuario"]["tipo"] !== "dueno") {
    echo json_encode(["ok" => false, "mensaje" => "Solo el dueño del huerto puede registrar pedidos"]);
    exit;
}

$d = json_decode(file_get_contents("php://input"), true) ?? [];

$cliente   = trim($d["cliente"] ?? "");
$producto  = trim($d["producto"] ?? "");
$cantidad  = (float)($d["cantidad"] ?? 0);
$unidad    = trim($d["unidad"] ?? "");
$fecha     = trim($d["fecha"] ?? "");
$direccion = trim($d["direccion"] ?? "");

$latitud   = isset($d["latitud"])   && is_numeric($d["latitud"])   ? $d["latitud"]   : null;
$longitud  = isset($d["longitud"])  && is_numeric($d["longitud"])  ? $d["longitud"]  : null;
$precision = isset($d["precision"]) && is_numeric($d["precision"]) ? $d["precision"] : null;

if ($cliente === "" || $producto === "" || $cantidad <= 0) {
    echo json_encode(["ok" => false, "mensaje" => "Faltan datos del pedido"]);
    exit;
}
if ($fecha !== "" && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    echo json_encode(["ok" => false, "mensaje" => "Fecha no válida"]);
    exit;
}

$insert = $conexion->prepare(
    "INSERT INTO pedidos
        (dueno_id, cliente, producto, cantidad, unidad, descripcion, fecha_entrega,
         estado, direccion, latitud, longitud, precision_m)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)"
);
$insert->execute([
    $_SESSION["usuario"]["id"],
    $cliente,
    $producto,
    $cantidad,
    $unidad,
    "$producto · $cantidad $unidad",
    $fecha === "" ? null : $fecha,
    $direccion === "" ? null : $direccion,
    $latitud,
    $longitud,
    $precision
]);

echo json_encode(["ok" => true, "id" => $conexion->lastInsertId()]);