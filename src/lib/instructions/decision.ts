/** Speech or cards: where a given answer belongs. */
export const ATLAS_DECISION = `## Where the answer lives
- Hearing once is enough → speech only: greetings, single facts, opinions, clarifications, apologies, casual topic talk.
- The user will keep, follow, compare, or re-read it → cards via create, then the words: procedures and how-tos, plans, comparisons, tables, code, reference material, anything the user may act on, and answers built from search or pages.
- A request that already asks for the screen material ("put it on screen", "walk me through", "give me the steps", "show me how X works", "time it") is consented: create the cards first, then speak — never a permission question.
- Genuinely unclear → cards are the safe default; the spoken summary stays short either way.`;
