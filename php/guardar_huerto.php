<?php
session_start();
require "conexion.php";
header("Content-Type: application/json");

if (!isset($_SESSION["usuario"])) {
    echo json_encode(["ok" => false, "mensaje" => "Sesión no iniciada"]);
    exit;
}

$usuarioId = $_SESSION["usuario"]["id"];
$datos = json_decode(file_get_contents("php://input"), true) ?? [];

// nombre en JS => columna en la tabla huertos
$columnas = [
    "nombre"    => "nombre",
    "calle"     => "calle",
    "municipio" => "municipio",
    "estado"    => "estado",
    "cp"        => "codigo_postal",
    "cultivo"   => "tipo_cultivo",
    "medidas"   => "medidas",
    "latitud"   => "latitud",
    "longitud"  => "longitud",
    "ubicacion" => "ubicacion",    // MySQL: dirección escrita
    "precision" => "precision_m"   // MySQL: precisión del GPS en metros
];
$campos = [];
foreach ($columnas as $clave => $columna) {
    if (array_key_exists($clave, $datos)) {
        $valor = is_string($datos[$clave]) ? trim($datos[$clave]) : $datos[$clave];
        $campos[$columna] = ($valor === "") ? null : $valor;
    }
}

// El nombre del huerto no puede quedar vacío
if (array_key_exists("nombre", $campos) && $campos["nombre"] === null) {
    unset($campos["nombre"]);
}

if (!$campos) {
    echo json_encode(["ok" => false, "mensaje" => "No hay datos para guardar"]);
    exit;
}

$buscar = $conexion->prepare("SELECT id FROM huertos WHERE usuario_id = ?");
$buscar->execute([$usuarioId]);
$huerto = $buscar->fetch();

if ($huerto) {
    // Ya tiene huerto: se actualizan solo los campos recibidos
    $set = implode(", ", array_map(fn($c) => "$c = ?", array_keys($campos)));
    $sql = "UPDATE huertos SET $set WHERE id = ?";
    $valores = array_values($campos);
    $valores[] = $huerto["id"];
} else {
    // No tiene huerto: se crea
    if (empty($campos["nombre"])) {
        $campos["nombre"] = "Mi huerto";
    }
    $campos["usuario_id"] = $usuarioId;
    $cols = implode(", ", array_keys($campos));
    $signos = implode(", ", array_fill(0, count($campos), "?"));
    $sql = "INSERT INTO huertos ($cols) VALUES ($signos)";
    $valores = array_values($campos);
}

$conexion->prepare($sql)->execute($valores);

echo json_encode(["ok" => true, "mensaje" => "Huerto guardado"]);