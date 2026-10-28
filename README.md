# atlas

A [Next.js](https://nextjs.org) app using the App Router, TypeScript, Tailwind CSS, and the `src/` directory.

## Getting Started

Install dependencies:

```bash
bun install
```

Run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

Edit `src/app/(site)/page.tsx` to change the home page. The page auto-updates as you edit.

## Scripts

| Command             | Description              |
| ------------------- | ------------------------ |
| `bun run dev`       | Start the dev server     |
| `bun run build`     | Create a production build |
| `bun run start`     | Start the production server |
| `bun run lint`      | Run ESLint               |
| `bun run typecheck` | Run the TypeScript checker |
| `bun run fmt`       | Format the code          |

## Structure

```
src/
  app/                  # Pages, layouts, and API routes
    (site)/             # Header-wrapped site routes
      layout.tsx        # site layout
      page.tsx          # home page and character section
    api/
      voice-preview/    # personalized Cartesia preview (MP3)
    dashboard/          # headerless voice-orb page
    start/              # headerless onboarding wizard
    layout.tsx          # root layout
    not-found.tsx       # global 404
    globals.css         # Tailwind CSS entry
  components/
    dashboard/          # particle orb, mic hook, level meter
    layout/             # header, navigation, shared backdrop
    sections/           # Full-width page scenes
    start/              # onboarding steps and voice preview
    ui/                 # Reusable UI components
  registry/             # Drop-in particle-orb component and hooks
  lib/                  # Utilities and shared logic
  types/                # Shared TypeScript types
public/                 # Images, icons, static assets, voice samples
scripts/                # Asset generation (Cartesia voice samples)
```

## Import Alias

The `@/*` alias maps to `src/*`:

```ts
import { something } from "@/lib/something";
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
