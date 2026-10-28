<?php
// Web Push sans dépendance (PHP 8 + extensions openssl et curl, présentes sur Hostinger).
//   - Clés VAPID (RFC 8292) : JWT ES256 signé avec la clé privée du serveur.
//   - Chiffrement du message (RFC 8291 / RFC 8188, « aes128gcm »).
declare(strict_types=1);

function b64u_enc(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function b64u_dec(string $s): string {
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    if ($out === false) throw new RuntimeException('base64url invalide');
    return $out;
}

/** Clé publique EC P-256 brute (65 octets, 0x04||X||Y) → PEM SubjectPublicKeyInfo. */
function p256_raw_to_pem(string $raw): string {
    if (strlen($raw) !== 65 || $raw[0] !== "\x04") throw new RuntimeException('Clé publique P-256 invalide');
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

function p256_new_keypair(): array {
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    if (!$key) throw new RuntimeException('Génération de clé EC impossible : ' . openssl_error_string());
    $d = openssl_pkey_get_details($key);
    $raw = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
    openssl_pkey_export($key, $pem);
    return ['key' => $key, 'pem' => $pem, 'public' => $raw];
}

/** Signature DER (ASN.1) ECDSA → format brut R||S (64 octets) exigé par JWS. */
function ecdsa_der_to_raw(string $der): string {
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $read = function () use ($der, &$pos): string {
        if ($der[$pos] !== "\x02") throw new RuntimeException('Signature DER invalide');
        $len = ord($der[$pos + 1]);
        $v = substr($der, $pos + 2, $len);
        $pos += 2 + $len;
        return str_pad(ltrim($v, "\0"), 32, "\0", STR_PAD_LEFT);
    };
    return $read() . $read();
}

/** En-tête Authorization VAPID pour un point de terminaison push donné. */
function vapid_header(string $endpoint, array $vapid, string $subject, int $ttl = 43200): string {
    $u = parse_url($endpoint);
    $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
    $header = b64u_enc(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $claims = b64u_enc(json_encode(['aud' => $aud, 'exp' => time() + $ttl, 'sub' => $subject], JSON_UNESCAPED_SLASHES));
    $input = "$header.$claims";
    if (!openssl_sign($input, $der, $vapid['private_pem'], OPENSSL_ALGO_SHA256)) throw new RuntimeException('Signature VAPID impossible');
    $jwt = $input . '.' . b64u_enc(ecdsa_der_to_raw($der));
    return 'vapid t=' . $jwt . ', k=' . $vapid['public'];
}

/**
 * Chiffre un message pour un abonnement (RFC 8291, aes128gcm, un seul enregistrement).
 * $p256dh et $auth : valeurs base64url fournies par l'abonnement du navigateur.
 */
function webpush_encrypt(string $payload, string $p256dh, string $auth): string {
    $uaPublic = b64u_dec($p256dh);
    $authSecret = b64u_dec($auth);
    if (strlen($authSecret) !== 16) throw new RuntimeException('Secret d\'authentification invalide');
    $as = p256_new_keypair();
    $shared = openssl_pkey_derive(openssl_pkey_get_public(p256_raw_to_pem($uaPublic)), $as['key']);
    if ($shared === false) throw new RuntimeException('Échange ECDH impossible');
    $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $as['public'], $authSecret);
    $salt = random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    $plain = $payload . "\x02"; // délimiteur du dernier enregistrement
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($cipher === false) throw new RuntimeException('Chiffrement AES-GCM impossible');
    $rs = 4096;
    return $salt . pack('N', $rs) . chr(65) . $as['public'] . $cipher . $tag;
}

/**
 * Envoie une notification. Retourne ['status' => code HTTP, 'gone' => bool, 'error' => ?string].
 * 404 / 410 : abonnement expiré, à supprimer.
 */
function webpush_send(array $sub, array $message, array $vapid, string $subject, int $ttl = 900): array {
    $body = webpush_encrypt(json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $sub['keys']['p256dh'], $sub['keys']['auth']);
    $ch = curl_init($sub['endpoint']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . vapid_header($sub['endpoint'], $vapid, $subject),
            'Content-Encoding: aes128gcm',
            'Content-Type: application/octet-stream',
            'TTL: ' . $ttl,
            'Urgency: high',
        ],
    ]);
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = $resp === false ? curl_error($ch) : null;
    curl_close($ch);
    return ['status' => $status, 'gone' => in_array($status, [404, 410], true), 'error' => $err ?? ($status >= 400 ? substr((string) $resp, 0, 300) : null)];
}
