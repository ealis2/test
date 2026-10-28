// Alarme de secours via le calendrier du système (fichier .ics avec rappel VALARM).
// Les rappels du calendrier se déclenchent même si Somnia est fermée et l'écran
// verrouillé. Le fichier est généré localement ; rien n'est envoyé.

const DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const esc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
const pad = n => String(n).padStart(2, '0');

function stamp(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Plie les lignes à 75 octets environ (RFC 5545 §3.1). */
function fold(line) {
  const out = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
  out.push(line);
  return out.join('\r\n');
}

/**
 * Génère un calendrier d'alarmes.
 * alarms : [{ id, label, time:'HH:MM', days:[0..6], tz }]
 * startKey : date de la première occurrence (AAAA-MM-JJ, heure locale du fuseau).
 */
export function buildICS(alarms, startKey) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Somnia//Reveils//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const a of alarms) {
    const [hh, mm] = a.time.split(':');
    const dt = `${startKey.replace(/-/g, '')}T${hh}${mm}00`;
    lines.push('BEGIN:VEVENT',
      `UID:somnia-${a.id}@somnia`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;TZID=${a.tz}:${dt}`,
      'DURATION:PT5M',
      `SUMMARY:${esc('⏰ ' + (a.label || 'Réveil'))}`,
      `DESCRIPTION:${esc('Alarme de secours créée par Somnia.')}`,
      'TRANSP:TRANSPARENT');
    if (a.days && a.days.length && a.days.length < 7) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${a.days.map(d => DAY[d]).join(',')}`);
    else if (a.days && a.days.length === 7) lines.push('RRULE:FREQ=DAILY');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(a.label || 'Réveil')}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
