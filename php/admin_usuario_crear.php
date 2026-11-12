<?php
require "solo_admin.php";

$d = json_decode(file_get_contents("php://input"), true) ?? [];
$nombre = trim($d["nombre"] ?? "");
$correo = trim($d["correo"] ?? "");
$pass   = $d["password"] ?? "";

$t = mb_strtolower(trim($d["tipo"] ?? ""));
$tipo = str_contains($t, "due") ? "dueno" : (str_contains($t, "admin") ? "admin" : (str_contains($t, "repar") ? "repartidor" : ""));

if ($nombre === "" || !filter_var($correo, FILTER_VALIDATE_EMAIL) || strlen($pass) < 8 || $tipo === "") {
    echo json_encode(["ok" => false, "mensaje" => "Datos incompletos o no válidos"]);
    exit;
}

$buscar = $conexion->prepare("SELECT id FROM usuarios WHERE correo = ?");
$buscar->execute([$correo]);
if ($buscar->fetch()) {
    echo json_encode(["ok" => false, "mensaje" => "Ya existe un usuario con ese correo."]);
    exit;
}

$insert = $conexion->prepare(
    "INSERT INTO usuarios (nombre, correo, password, tipo) VALUES (?, ?, ?, ?)"
);
$insert->execute([$nombre, $correo, password_hash($pass, PASSWORD_DEFAULT), $tipo]);

echo json_encode(["ok" => true, "id" => $conexion->lastInsertId()]);