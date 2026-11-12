<?php
require "conexion.php";
header("Content-Type: application/json");

$datos  = json_decode(file_get_contents("php://input"), true) ?? [];
$nombre = trim($datos["nombre"] ?? "");
$correo = trim($datos["correo"] ?? "");
$pass   = $datos["password"] ?? "";
$tipo   = convertirTipo($datos["tipo"] ?? "");

if ($nombre === "" || !filter_var($correo, FILTER_VALIDATE_EMAIL) || strlen($pass) < 6 || !$tipo) {
    echo json_encode(["ok" => false, "mensaje" => "Datos incompletos o no válidos"]);
    exit;
}

// Los administradores solo se crean desde el panel de administración
if ($tipo === "admin") {
    echo json_encode(["ok" => false, "mensaje" => "No puedes registrarte como administrador"]);
    exit;
}

$buscar = $conexion->prepare("SELECT id FROM usuarios WHERE correo = ?");
$buscar->execute([$correo]);
if ($buscar->fetch()) {
    echo json_encode(["ok" => false, "mensaje" => "Ese correo ya está registrado"]);
    exit;
}

$insert = $conexion->prepare(
    "INSERT INTO usuarios (nombre, correo, password, tipo) VALUES (?, ?, ?, ?)"
);
$insert->execute([$nombre, $correo, password_hash($pass, PASSWORD_DEFAULT), $tipo]);

echo json_encode(["ok" => true, "mensaje" => "Registro exitoso", "id" => $conexion->lastInsertId()]);

// Acepta el texto del select ("Dueño del Huerto") o el valor corto ("dueno")
function convertirTipo($t) {
    $t = mb_strtolower(trim($t));
    if (str_contains($t, "due"))   return "dueno";
    if (str_contains($t, "admin")) return "admin";
    if (str_contains($t, "repar")) return "repartidor";
    return null;
}