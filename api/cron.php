<?php
// Tâche planifiée : envoie les notifications arrivées à échéance.
// À exécuter CHAQUE MINUTE. Sur Hostinger : hPanel → Avancé → Tâches Cron →
//   Type « PHP », commande : domains/cryptologist.pro/public_html/<dossier>/api/cron.php
// Appel HTTP possible si le cron « commande » n'est pas disponible :
//   https://<site>/api/cron.php?key=<clé de api/data/cron.json → httpKey>
declare(strict_types=1);

require_once __DIR__ . '/lib/store.php';

$cli = PHP_SAPI === 'cli';
if (!$cli) {
    header('Content-Type: text/plain; charset=utf-8');
    $state = read_json(data_path('cron.json')) ?? [];
    if (empty($state['httpKey'])) { $state['httpKey'] = b64u_enc(random_bytes(18)); write_json(data_path('cron.json'), $state); }
    if (!hash_equals($state['httpKey'], (string) ($_GET['key'] ?? ''))) { http_response_code(403); echo "Accès refusé.\n"; exit; }
}

// Un seul passage à la fois
$lock = fopen(data_path('cron.lock'), 'c');
if (!flock($lock, LOCK_EX | LOCK_NB)) { echo "Déjà en cours.\n"; exit; }

$now = time();
$vapid = vapid_keys();
$subject = config()['subject'];
$sent = 0; $removed = 0; $errors = 0;
const NAG_DELAY = 300;        // relance 5 min plus tard si l'app n'a pas été ouverte
const STALE_AFTER = 1800;     // une échéance manquée depuis plus de 30 min n'est plus envoyée

foreach (glob(data_path('subs/*.json')) ?: [] as $file) {
    $sub = read_json($file);
    if (!$sub) continue;
    $changed = false;
    $keep = [];
    foreach ($sub['items'] as $it) {
        $due = $it['next'] ?? null;
        $fire = null;
        if ($due && $due <= $now) {
            $fire = $now - $due <= STALE_AFTER ? 'main' : null;
            if ($it['kind'] === 'alarm') $it['next'] = next_occurrence($it['time'], $it['days'], $it['tz'], max($now, $due));
            else $it['next'] = null;
            unset($it['acked']);
            if ($fire && $it['nag']) $it['nagAt'] = $now + NAG_DELAY;
            $changed = true;
        } elseif (!empty($it['nagAt']) && $it['nagAt'] <= $now) {
            $fire = empty($it['acked']) ? 'nag' : null;
            unset($it['nagAt']);
            $changed = true;
        }
        if ($fire) {
            $msg = ['title' => $it['title'], 'body' => $fire === 'nag' ? 'Rappel : ' . $it['body'] : $it['body'], 'tag' => $it['key'], 'kind' => 'alarm', 'url' => '#/sleep'];
            try {
                $r = webpush_send($sub, $msg, $vapid, $subject);
                if ($r['gone']) { @unlink($file); $removed++; continue 2; }
                if ($r['status'] >= 200 && $r['status'] < 300) $sent++; else { $errors++; error_log('[somnia cron] HTTP ' . $r['status'] . ' ' . $r['error']); }
            } catch (Throwable $e) { $errors++; error_log('[somnia cron] ' . $e->getMessage()); }
        }
        // Les éléments ponctuels terminés disparaissent
        if ($it['kind'] === 'once' && empty($it['next']) && empty($it['nagAt'])) { $changed = true; continue; }
        $keep[] = $it;
    }
    if ($changed) { $sub['items'] = $keep; write_json($file, $sub); }
}

$state = read_json(data_path('cron.json')) ?? [];
$state['lastRun'] = $now;
$state['lastStats'] = compact('sent', 'removed', 'errors');
write_json(data_path('cron.json'), $state);
flock($lock, LOCK_UN);
echo "OK envoyées=$sent supprimées=$removed erreurs=$errors\n";
