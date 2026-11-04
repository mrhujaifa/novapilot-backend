# Marketplace credential encryption

Set `ENCRYPTION_KEY` in the backend service's environment before publishing an
API that uses authentication. It must contain exactly 64 hexadecimal characters
(32 bytes for AES-256). Redis credentials do not replace this key.

If the service has already stored encrypted API credentials, use the existing
encryption key. Changing it makes those credentials unreadable. Keep the same
key across deployments and instances, and store it as a secret.

For this deployment, a valid `ENCRYPTION_KEY` is already present in the local
`.env`. Copy that value into the backend's Render environment and redeploy.
Do not commit `.env`, print the value in logs, or send it in chat.

For a new installation without an existing key, generate one locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Missing or malformed keys cause credential operations to return HTTP 503 with
`SERVICE_UNAVAILABLE`; they do not fall back to plaintext storage. Unexpected
application errors are logged without request bodies to avoid exposing secrets.
