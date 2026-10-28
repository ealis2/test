<?php
// Stockage fichiers (pas de base de données nécessaire) pour les abonnements push.
// Les fichiers vivent dans api/data/, interdit d'accès web par api/data/.htaccess.
// Emplacement configurable (recommandé : hors de public_html) via SOMNIA_DATA_DIR.
declare(strict_types=1);

require_once __DIR__ . '/webpush.php';

function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $cfg = [
        // Sujet VAPID : URL ou adresse « mailto: » de l'exploitant du service.
        'subject' => getenv('SOMNIA_VAPID_SUBJECT') ?: 'https://cryptologist.pro',
        'data_dir' => getenv('SOMNIA_DATA_DIR') ?: dirname(__DIR__) . '/data',
        // Services push autorisés (protection contre les requêtes vers des hôtes arbitraires).
        'push_hosts' => ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'],
        'max_subscriptions' => 2000,
        'max_items' => 40,
        // Tests automatisés uniquement : autorise un faux service push local (jamais en production).
        'test_push_host' => getenv('SOMNIA_TEST_PUSH_HOST') ?: null,
    ];
    $local = dirname(__DIR__) . '/config.local.php';
    if (is_file($local)) $cfg = array_merge($cfg, (array) require $local);
    return $cfg;
}

function data_path(string $rel): string {
    $dir = config()['data_dir'];
    if (!is_dir($dir . '/subs')) @mkdir($dir . '/subs', 0700, true);
    if (!is_dir($dir . '/rl')) @mkdir($dir . '/rl', 0700, true);
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    return $dir . '/' . $rel;
}

function read_json(string $path): ?array {
    if (!is_file($path)) return null;
    $fh = fopen($path, 'r');
    if (!$fh) return null;
    flock($fh, LOCK_SH);
    $raw = stream_get_contents($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $j = json_decode((string) $raw, true);
    return is_array($j) ? $j : null;
}

function write_json(string $path, array $data): void {
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
    @chmod($tmp, 0600);
    rename($tmp, $path);
}

/** Clés VAPID du serveur, créées au premier appel. */
function vapid_keys(): array {
    $path = data_path('vapid.json');
    $k = read_json($path);
    if ($k && !empty($k['private_pem']) && !empty($k['public'])) return $k;
    $fh = fopen(data_path('vapid.lock'), 'c');
    flock($fh, LOCK_EX);
    $k = read_json($path);
    if (!$k) {
        $kp = p256_new_keypair();
        $k = ['private_pem' => $kp['pem'], 'public' => b64u_enc($kp['public']), 'created' => gmdate('c')];
        write_json($path, $k);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $k;
}

function sub_path(string $id): string {
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) throw new InvalidArgumentException('Identifiant invalide');
    return data_path("subs/$id.json");
}

function valid_endpoint(string $url): bool {
    $u = parse_url($url);
    if (!$u || empty($u['host'])) return false;
    $test = config()['test_push_host'];
    if ($test && ($u['host'] . (isset($u['port']) ? ':' . $u['port'] : '')) === $test) return true;
    if (($u['scheme'] ?? '') !== 'https') return false;
    foreach (config()['push_hosts'] as $h) {
        if ($u['host'] === $h || str_ends_with($u['host'], '.' . $h)) return true;
    }
    return false;
}

/** Limite simple par adresse IP (hachée, jamais stockée en clair). */
function rate_limit(string $bucket, int $max, int $windowSec): bool {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
    $key = hash('sha256', $bucket . '|' . $ip . '|' . intdiv(time(), $windowSec));
    $path = data_path('rl/' . substr($key, 0, 32));
    $n = (int) @file_get_contents($path);
    if ($n >= $max) return false;
    file_put_contents($path, (string) ($n + 1), LOCK_EX);
    // Nettoyage opportuniste des anciens compteurs
    if (random_int(0, 50) === 0) foreach (glob(data_path('rl/*')) ?: [] as $f) if (filemtime($f) < time() - 7200) @unlink($f);
    return true;
}

// ---------------------------------------------------------------- Planification

/** Prochaine occurrence (timestamp) de HH:MM dans un fuseau, sur les jours donnés (0 = dimanche), strictement après $from. */
function next_occurrence(string $hhmm, array $days, string $tz, int $from): ?int {
    if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $hhmm, $m)) return null;
    $zone = new DateTimeZone($tz);
    $d = (new DateTimeImmutable('@' . $from))->setTimezone($zone)->setTime(0, 0);
    for ($i = 0; $i < 9; $i++) {
        $cand = $d->modify("+$i day")->setTime((int) $m[1], (int) $m[2]);
        $wd = (int) $cand->format('w');
        if ((!$days || in_array($wd, $days, true)) && $cand->getTimestamp() > $from) return $cand->getTimestamp();
    }
    return null;
}

/** Valide et normalise les éléments envoyés par l'app. */
function normalize_items(array $items, string $defaultTz): array {
    $zones = array_flip(DateTimeZone::listIdentifiers());
    $out = [];
    foreach (array_slice($items, 0, config()['max_items']) as $it) {
        if (!is_array($it)) continue;
        $key = preg_replace('/[^\w\-:]/', '', (string) ($it['key'] ?? ''));
        $kind = $it['kind'] ?? '';
        if (!$key || !in_array($kind, ['alarm', 'once'], true)) continue;
        $tz = isset($zones[$it['tz'] ?? '']) ? $it['tz'] : $defaultTz;
        $n = [
            'key' => substr($key, 0, 80), 'kind' => $kind, 'tz' => $tz,
            'title' => mb_substr(strip_tags((string) ($it['title'] ?? 'Somnia')), 0, 60),
            'body' => mb_substr(strip_tags((string) ($it['body'] ?? '')), 0, 160),
            'nag' => !empty($it['nag']),
        ];
        if ($kind === 'alarm') {
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) ($it['time'] ?? ''))) continue;
            $n['time'] = $it['time'];
            $n['days'] = array_values(array_unique(array_filter(array_map('intval', (array) ($it['days'] ?? [])), fn($d) => $d >= 0 && $d <= 6)));
            $n['next'] = next_occurrence($n['time'], $n['days'], $tz, time());
        } else {
            $ts = strtotime((string) ($it['at'] ?? ''));
            if (!$ts || $ts < time() - 3600 || $ts > time() + 7 * 86400) continue;
            $n['at'] = $ts;
            $n['next'] = $ts;
        }
        $out[] = $n;
    }
    return $out;
}
