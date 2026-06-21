# Deploy — IIIF Map Explorer → mapexplorer.lieuwejongsma.nl

Pure static site on the Contabo VPS (`84.247.137.239`, user `lieuwe`), served by Caddy
`file_server`. No backend, no container — just the built `dist/` (index.html + hashed
assets + `footprints.geojson` + 16,010 `annotations/*.json`). ~77 MB total.

## Build + upload (no root needed)

From this repo on your Mac:

```bash
npm run build --workspace=@ime/explorer

# Caddy runs as user `caddy`; /home/lieuwe is 750 so Caddy can't reach files inside it.
# One-time: grant traverse-only (o+x, NOT readable-listing) on your home dir.
ssh -i ~/.ssh/id_contabo lieuwe@84.247.137.239 'chmod o+x /home/lieuwe'

# Sync the build (16k small annotation files — first run is a few minutes, then incremental).
rsync -az --delete -e "ssh -i ~/.ssh/id_contabo" \
  explorer/dist/ lieuwe@84.247.137.239:~/apps/mapexplorer/dist/

# Ship the Caddy site config alongside it.
scp -i ~/.ssh/id_contabo explorer/deploy/mapexplorer.caddyfile \
  lieuwe@84.247.137.239:~/apps/mapexplorer/
```

## Go live (needs root + your DNS registrar)

1. **DNS** — add an A record, then wait for it to resolve:
   ```
   mapexplorer.lieuwejongsma.nl   A   84.247.137.239
   ```
   ```bash
   dig +short mapexplorer.lieuwejongsma.nl   # → 84.247.137.239
   ```
2. **Caddy** — install the site block and reload (Caddy auto-issues the TLS cert):
   ```bash
   sudo cp ~/apps/mapexplorer/mapexplorer.caddyfile /etc/caddy/sites.d/
   sudo systemctl reload caddy
   ```
3. **Verify**:
   ```bash
   curl -I https://mapexplorer.lieuwejongsma.nl     # 200, valid cert
   ```

## Redeploy after changes

Rerun the **Build + upload** block (the `--delete` rsync syncs new data/annotations).
No Caddy or DNS changes needed.

## Revert

- Remove site: `sudo rm /etc/caddy/sites.d/mapexplorer.caddyfile && sudo systemctl reload caddy`
- Undo the traverse bit: `chmod o-x /home/lieuwe`
