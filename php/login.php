<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

$datos  = json_decode(file_get_contents("php://input"), true) ?? [];
$correo = trim($datos["correo"] ?? "");
$pass   = $datos["password"] ?? "";
$tipo   = $datos["tipo"] ?? "";

$t = mb_strtolower($tipo);
$tipo = str_contains($t, "due") ? "dueno" : (str_contains($t, "admin") ? "admin" : (str_contains($t, "repar") ? "repartidor" : ""));

$buscar = $conexion->prepare("SELECT id, nombre, correo, password, tipo, activo FROM usuarios WHERE correo = ?");
$buscar->execute([$correo]);
$usuario = $buscar->fetch();

if (!$usuario || !password_verify($pass, $usuario["password"])) {
    echo json_encode(["ok" => false, "mensaje" => "Correo o contraseña incorrectos"]);
    exit;
}
if ($tipo !== "" && $tipo !== $usuario["tipo"]) {
    echo json_encode(["ok" => false, "mensaje" => "Ese usuario no es de tipo " . $datos["tipo"]]);
    exit;
}
// MySQL: el administrador puede desactivar cuentas
if ((int)$usuario["activo"] !== 1) {
    echo json_encode(["ok" => false, "mensaje" => "Tu cuenta está desactivada. Contacta al administrador."]);
    exit;
}

unset($usuario["password"], $usuario["activo"]);
$_SESSION["usuario"] = $usuario;

echo json_encode(["ok" => true, "usuario" => $usuario]);