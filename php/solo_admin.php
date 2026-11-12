<?php
// Se incluye al inicio de los PHP del administrador:
// abre la sesión, conecta a la base y revisa que sea admin
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"]) || $_SESSION["usuario"]["tipo"] !== "admin") {
    echo json_encode(["ok" => false, "mensaje" => "Solo el administrador puede hacer esto"]);
    exit;
}

$admin = $_SESSION["usuario"];