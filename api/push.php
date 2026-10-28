<?php
// API des notifications de secours de Somnia.
//   GET  ?action=status     → disponibilité, clé publique VAPID, santé du cron
//   POST ?action=subscribe  { subscription, tz }           → { id, token }
//   POST ?action=schedule   { id, token, items:[…] }       → planning remplacé
//   POST ?action=ack        { id, token, tag }              → annule la relance
//   POST ?action=test       { id, token }                   → notification immédiate
//   POST ?action=delete     { id, token }                   → abonnement supprimé
// Aucune donnée de sommeil n'est reçue ni stockée.
declare(strict_types=1);

require_once __DIR__ . '/lib/store.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400): never { reply(['ok' => false, 'error' => $msg], $code); }

try {
    if (!extension_loaded('openssl') || !extension_loaded('curl')) fail('Extensions PHP openssl et curl requises.', 500);
    $action = $_GET['action'] ?? '';

    if ($action === 'status') {
        $cron = read_json(data_path('cron.json')) ?? [];
        $last = $cron['lastRun'] ?? null;
        reply(['ok' => true, 'publicKey' => vapid_keys()['public'], 'cron' => ['lastRun' => $last ? gmdate('c', $last) : null, 'healthy' => $last && time() - $last < 180]]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Méthode non autorisée.', 405);
    $raw = file_get_contents('php://input', false, null, 0, 32768);
    $in = json_decode((string) $raw, true);
    if (!is_array($in)) fail('JSON invalide.');

    if ($action === 'subscribe') {
        if (!rate_limit('subscribe', 20, 3600)) fail('Trop de demandes, réessayez plus tard.', 429);
        $s = $in['subscription'] ?? null;
        $endpoint = (string) ($s['endpoint'] ?? '');
        $p256 = (string) ($s['keys']['p256dh'] ?? '');
        $auth = (string) ($s['keys']['auth'] ?? '');
        if (!valid_endpoint($endpoint)) fail('Service push non reconnu.');
        if (strlen(b64u_dec($p256)) !== 65 || strlen(b64u_dec($auth)) !== 16) fail('Clés d\'abonnement invalides.');
        if (count(glob(data_path('subs/*.json')) ?: []) >= config()['max_subscriptions']) fail('Capacité du service atteinte.', 503);
        $tz = in_array($in['tz'] ?? '', DateTimeZone::listIdentifiers(), true) ? $in['tz'] : 'UTC';
        $id = bin2hex(random_bytes(16));
        $token = b64u_enc(random_bytes(24));
        write_json(sub_path($id), [
            'id' => $id, 'tokenHash' => hash('sha256', $token), 'endpoint' => $endpoint,
            'keys' => ['p256dh' => $p256, 'auth' => $auth], 'tz' => $tz, 'items' => [], 'sent' => [],
            'created' => time(), 'updated' => time(),
        ]);
        reply(['ok' => true, 'id' => $id, 'token' => $token]);
    }

    // Actions authentifiées
    $id = (string) ($in['id'] ?? '');
    $token = (string) ($in['token'] ?? '');
    $path = sub_path($id);
    $sub = read_json($path);
    if (!$sub || !hash_equals($sub['tokenHash'], hash('sha256', $token))) fail('Abonnement inconnu.', 404);

    switch ($action) {
        case 'schedule':
            $sub['items'] = normalize_items((array) ($in['items'] ?? []), $sub['tz']);
            $sub['updated'] = time();
            write_json($path, $sub);
            reply(['ok' => true, 'items' => array_map(fn($i) => ['key' => $i['key'], 'next' => $i['next'] ? gmdate('c', $i['next']) : null], $sub['items'])]);
        case 'ack':
            $tag = (string) ($in['tag'] ?? '');
            foreach ($sub['items'] as &$it) if ($it['key'] === $tag) { $it['acked'] = time(); unset($it['nagAt']); }
            unset($it);
            write_json($path, $sub);
            reply(['ok' => true]);
        case 'test':
            if (!rate_limit('test', 6, 600)) fail('Trop de tests, patientez quelques minutes.', 429);
            $r = webpush_send($sub, ['title' => '🔔 Test Somnia', 'body' => 'Les notifications de secours fonctionnent.', 'tag' => 'somnia-test', 'kind' => 'test', 'url' => '#/alarms'], vapid_keys(), config()['subject'], 300);
            if ($r['gone']) { @unlink($path); fail('Abonnement expiré : réactivez les notifications.', 410); }
            if ($r['status'] < 200 || $r['status'] >= 300) fail('Le service push a refusé l\'envoi (HTTP ' . $r['status'] . ').', 502);
            reply(['ok' => true]);
        case 'delete':
            @unlink($path);
            reply(['ok' => true]);
        default:
            fail('Action inconnue.', 404);
    }
} catch (Throwable $e) {
    error_log('[somnia push] ' . $e->getMessage());
    fail('Erreur interne du service de notification.', 500);
}
