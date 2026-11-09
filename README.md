# timber-trace

POC for inscribing wooden beam geometry data into QR codes.

A beam (id, species, length × width × height in mm, drilled holes) is encoded
into a compact versioned payload (`TT1|…`) and rendered as a QR code. Pasting a
payload decodes it back into beam data.

```bash
bun install
bun run dev    # local app
bun test       # payload encode/decode tests
bun run build  # type-check + production build
```
