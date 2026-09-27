<?php
// Somnia – proxy vers Europe PMC (publications scientifiques sur le sommeil).
// Compatible Hostinger (PHP 7.4+/8.x). Met en cache les réponses 6 h pour
// rester rapide et ne pas surcharger l'API publique.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=1800');
header('X-Content-Type-Options: nosniff');

$QUERIES = [
    'general'   => 'TITLE:"sleep" AND (TITLE:"health" OR TITLE:"quality" OR TITLE:"duration")',
    'insomnia'  => 'TITLE:"insomnia"',
    'circadian' => '(TITLE:"circadian" OR TITLE:"chronotype" OR TITLE:"melatonin")',
    'apnea'     => 'TITLE:"sleep apnea"',
    'rem'       => '(TITLE:"REM sleep" OR TITLE:"dreaming" OR TITLE:"dreams")',
    'screens'   => 'TITLE:"sleep" AND (TITLE:"screen" OR TITLE:"blue light" OR TITLE:"smartphone")',
];

$topic = isset($_GET['topic']) ? (string) $_GET['topic'] : 'general';
if (!isset($QUERIES[$topic])) {
    $topic = 'general';
}

// Dossier de cache (créé à côté du script, sinon dossier temporaire)
$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir) && !@mkdir($cacheDir, 0755, true)) {
    $cacheDir = sys_get_temp_dir();
}
if (is_dir($cacheDir) && !file_exists($cacheDir . '/.htaccess')) {
    @file_put_contents($cacheDir . '/.htaccess', "Require all denied\n");
}
$cacheFile = $cacheDir . '/studies-' . $topic . '.json.cache';

if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < 6 * 3600) {
    readfile($cacheFile);
    exit;
}

$since = date('Y-m-d', time() - 120 * 86400);
$today = date('Y-m-d');
$query = $QUERIES[$topic] . " AND SRC:MED AND HAS_ABSTRACT:y AND FIRST_PDATE:[$since TO $today]";
$url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?' . http_build_query([
    'query'      => $query,
    'format'     => 'json',
    'pageSize'   => 12,
    'sort'       => 'P_PDATE_D desc',
    'resultType' => 'lite',
]);

function fetch_url($url)
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Somnia/1.0 (+https://cryptologist.pro)',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($body !== false && $code === 200) ? $body : null;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => "User-Agent: Somnia/1.0\r\n"]]);
    $body = @file_get_contents($url, false, $ctx);
    return $body === false ? null : $body;
}

$raw = fetch_url($url);
$data = $raw ? json_decode($raw, true) : null;

if (!$data || !isset($data['resultList']['result'])) {
    // En cas d'échec, on renvoie l'ancien cache s'il existe
    if (is_file($cacheFile)) {
        readfile($cacheFile);
        exit;
    }
    http_response_code(502);
    echo json_encode(['error' => 'Source indisponible', 'items' => []]);
    exit;
}

$items = [];
foreach ($data['resultList']['result'] as $r) {
    $items[] = [
        'title'                => isset($r['title']) ? strip_tags($r['title']) : '',
        'journalTitle'         => isset($r['journalTitle']) ? $r['journalTitle'] : '',
        'firstPublicationDate' => isset($r['firstPublicationDate']) ? $r['firstPublicationDate'] : '',
        'authorString'         => isset($r['authorString']) ? $r['authorString'] : '',
        'doi'                  => isset($r['doi']) ? $r['doi'] : null,
        'source'               => isset($r['source']) ? $r['source'] : 'MED',
        'id'                   => isset($r['id']) ? $r['id'] : '',
        'isOpenAccess'         => isset($r['isOpenAccess']) ? $r['isOpenAccess'] : 'N',
    ];
}

$json = json_encode(['topic' => $topic, 'updated' => date('c'), 'items' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
@file_put_contents($cacheFile, $json, LOCK_EX);
echo $json;
