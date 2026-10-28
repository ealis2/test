<?php
// Génère un calendrier .ics de réveils à partir des paramètres de l'URL
// (aucune donnée n'est stockée). Format de chaque paramètre a :
//   a=HH:MM|jours séparés par des virgules (0 = dimanche)|libellé|fuseau IANA
declare(strict_types=1);

$zones = array_flip(DateTimeZone::listIdentifiers());
$DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
$esc = fn(string $s) => str_replace(["\\", ';', ',', "\n"], ["\\\\", '\\;', '\\,', '\\n'], $s);

$params = [];
foreach (explode('&', (string) ($_SERVER['QUERY_STRING'] ?? '')) as $pair) {
    [$k, $v] = array_pad(explode('=', $pair, 2), 2, '');
    if ($k === 'a') $params[] = urldecode($v);
}
$lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Somnia//Reveils//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Somnia — réveils'];
foreach (array_slice($params, 0, 20) as $i => $p) {
    [$time, $days, $label, $tz] = array_pad(explode('|', $p, 4), 4, '');
    if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $time, $m) || !isset($zones[$tz])) continue;
    $d = array_values(array_unique(array_filter(array_map('intval', $days === '' ? [] : explode(',', $days)), fn($x) => $x >= 0 && $x <= 6)));
    $label = mb_substr(trim(strip_tags($label)) ?: 'Réveil', 0, 40);
    $start = new DateTimeImmutable('now', new DateTimeZone($tz));
    $start = $start->setTime((int) $m[1], (int) $m[2]);
    if ($start->getTimestamp() <= time()) $start = $start->modify('+1 day');
    if ($d) while (!in_array((int) $start->format('w'), $d, true)) $start = $start->modify('+1 day');
    $lines[] = 'BEGIN:VEVENT';
    $lines[] = 'UID:somnia-' . substr(hash('sha256', $p), 0, 16) . "-$i@somnia";
    $lines[] = 'DTSTAMP:' . gmdate('Ymd\THis\Z');
    $lines[] = "DTSTART;TZID=$tz:" . $start->format('Ymd\THis');
    $lines[] = 'DURATION:PT5M';
    $lines[] = 'SUMMARY:' . $esc('⏰ ' . $label);
    $lines[] = 'DESCRIPTION:' . $esc('Alarme de secours créée par Somnia.');
    $lines[] = 'TRANSP:TRANSPARENT';
    if (count($d) === 7) $lines[] = 'RRULE:FREQ=DAILY';
    elseif ($d) $lines[] = 'RRULE:FREQ=WEEKLY;BYDAY=' . implode(',', array_map(fn($x) => $DAY[$x], $d));
    array_push($lines, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' . $esc($label), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
}
$lines[] = 'END:VCALENDAR';

header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: inline; filename="somnia-reveils.ics"');
header('Cache-Control: no-store');
echo implode("\r\n", $lines) . "\r\n";
