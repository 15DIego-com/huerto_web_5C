<?php
// Datos por defecto de XAMPP
$host = "localhost";
$bd   = "huerto_web";
$user = "root";
$pass = "";          // en XAMPP root no tiene contraseña

try {
    $conexion = new PDO(
        "mysql:host=$host;dbname=$bd;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    header("Content-Type: application/json");
    echo json_encode(["ok" => false, "mensaje" => "Error de conexión: " . $e->getMessage()]);
    exit;
}