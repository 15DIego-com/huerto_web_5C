<?php
// Funciones compartidas por los PHP del inventario
session_start();
require_once "conexion.php";
header("Content-Type: application/json");

// Responde en JSON con el código HTTP correcto y termina
function responder($datos, $codigo = 200) {
    http_response_code($codigo);
    echo json_encode($datos);
    exit;
}

// Usuario con sesión iniciada (401 si no hay sesión)
function usuarioActual() {
    if (!isset($_SESSION["usuario"])) {
        responder(["ok" => false, "mensaje" => "Sesión no iniciada"], 401);
    }
    return $_SESSION["usuario"];
}

// Solo el dueño del huerto (403 si es otro tipo de usuario)
function soloDueno() {
    $usuario = usuarioActual();
    if ($usuario["tipo"] !== "dueno") {
        responder(["ok" => false, "mensaje" => "Solo el dueño del huerto puede hacer esto"], 403);
    }
    return $usuario;
}

// Id del huerto del dueño (null si todavía no registra su huerto)
function huertoDelDueno($conexion, $usuarioId) {
    $consulta = $conexion->prepare("SELECT id FROM huertos WHERE usuario_id = ? LIMIT 1");
    $consulta->execute([$usuarioId]);
    $huerto = $consulta->fetch();
    return $huerto ? (int)$huerto["id"] : null;
}

// "Vitamina C::Beneficio||Hierro::Beneficio" -> [{nombre, beneficio}, ...]
function separarNutrientes($texto) {
    if (!$texto) return [];
    $lista = [];
    foreach (explode("||", $texto) as $parte) {
        $datos = explode("::", $parte);
        $lista[] = ["nombre" => $datos[0], "beneficio" => $datos[1] ?? ""];
    }
    return $lista;
}

// Datos que llegan desde api.js
function datosRecibidos() {
    return json_decode(file_get_contents("php://input"), true) ?? [];
}