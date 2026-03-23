<?php
session_start();
$xml_dir = __DIR__ . '/xml/';
$users = include('users.php');

header('Content-Type: application/json');
$action = $_GET['action'] ?? '';

if ($action === 'login') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (isset($users[$data['user']]) && password_verify($data['pass'], $users[$data['user']])) {
        $_SESSION['admin'] = true;
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false]);
    }
    exit;
}

if ($action === 'list') {
    $files = array_values(array_diff(scandir($xml_dir), ['.', '..']));
    echo json_encode($files);
    exit;
}

// Protected Actions
if (!isset($_SESSION['admin'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

if ($action === 'upload' && isset($_FILES['xml_file'])) {
    $target = $xml_dir . basename($_FILES['xml_file']['name']);
    move_uploaded_file($_FILES['xml_file']['tmp_name'], $target);
    echo json_encode(['success' => true]);
}

if ($action === 'delete') {
    $data = json_decode(file_get_contents('php://input'), true);
    $file = $xml_dir . basename($data['filename']);
    if (file_exists($file)) unlink($file);
    echo json_encode(['success' => true]);
}


