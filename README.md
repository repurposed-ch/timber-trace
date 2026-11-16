# timber-trace

**A passport for reused timber, printed on the piece.**

timber-trace puts what's known about a timber component into a QR code you stick on the component: species, dimensions, grade, where it came from, what it was used for before, and what has happened to it since. Anyone with a phone camera can scan the label and read the record in their browser. They don't need an app or an account.

→ [timber-trace.repurposed.ch](https://timber-trace.repurposed.ch/)

## What you can do

- **Scan a label.** Point your camera at the code and the record opens: a summary, a 3D preview of the beam, and its history. The facts are stored in the code itself, so a label stays readable even without our database.
- **Create a record.** Fill in what you know and leave the rest empty. Empty means *unknown*, and the record says so instead of guessing. You get a QR label to print.
- **Keep it current.** Sign in with your email to save new revisions when a component is inspected, repaired, cut or combined. If someone scans an older label, they're told a newer version exists. After a split, they choose which part they're holding.
- **Hand it on.** Download the label as PNG, a one-page PDF fact sheet, or an IFC file that brings the component into BIM software with every fact attached.
- **Follow your components.** *My entries* lists everything you've saved and shows where others continued, split or joined your work.

Available in English, German, French, Italian, Danish, Dutch and Swedish.

## What a label holds, and what it doesn't

- **Facts, not guesses.** Every field is either recorded or explicitly unknown. A grade always comes with its source and standard.
- **No names.** Suppliers and verifiers appear as a role, an ID and a date.
- **A short history.** The label carries the events that matter most (the first and latest structural changes, the latest inspection and treatment). The full history is stored online and linked by the component's ID.

## Development

```bash
bun install
bun run db:start  # local Supabase (needs Docker)
bun run dev       # http://localhost:5173/hello-world/
bun test
bun run build
```

- [docs/development.md](docs/development.md): file layout, local backend, test accounts
- [docs/schema.md](docs/schema.md): payload encoding, the `hello-world` schema and its versions
- [docs/database.md](docs/database.md): entries, revisions, splits and joins, access rules, admins
