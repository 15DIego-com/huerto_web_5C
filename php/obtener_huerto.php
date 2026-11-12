<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$buscar = $conexion->prepare("SELECT * FROM huertos WHERE usuario_id = ? LIMIT 1");
$buscar->execute([$_SESSION["usuario"]["id"]]);
$huerto = $buscar->fetch();

echo json_encode(["ok" => true, "huerto" => $huerto ?: null]);