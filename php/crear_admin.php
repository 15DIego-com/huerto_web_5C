<?php
require "conexion.php";

$nombre = "Administrador";
$correo = "admin@huerto.com";
$pass   = "admin123";

$buscar = $conexion->prepare("SELECT id FROM usuarios WHERE correo = ?");
$buscar->execute([$correo]);

if ($buscar->fetch()) {
    echo "El administrador ya existe.";
} else {
    $insert = $conexion->prepare(
        "INSERT INTO usuarios (nombre, correo, password, tipo) VALUES (?, ?, ?, 'admin')"
    );
    $insert->execute([$nombre, $correo, password_hash($pass, PASSWORD_DEFAULT)]);
    echo "Administrador creado: $correo / $pass";
}