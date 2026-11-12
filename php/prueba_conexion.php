<?php
require "conexion.php";
header("Content-Type: application/json");

$tablas = $conexion->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
echo json_encode(["ok" => true, "mensaje" => "Conectado a huerto_web", "tablas" => $tablas]);