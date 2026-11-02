/**
 * Worked turns for the live prompt's `## Examples` section.
 *
 * One example per decision path the prompt teaches: speech-only, cards,
 * screen re-creation, create splitting, search → cards, fetch failure, a
 * reminder, and the client-side action calls. Every shape here matches the
 * native tool protocol the loop actually runs — no JSON envelope, no
 * `after the results` narration, plain text as the end of a speech turn.
 *
 * Kept in its own module so the examples can grow without turning the
 * prompt composer into a wall of text; `lib/atlas-prompt.ts` imports it, and
 * legacy `index.ts` re-exports the same text.
 */
export const ATLAS_EXAMPLES = `## Examples

Speech-only turns end in plain text.

User: "What's your name?"
→ plain: "I'm Atlas, your voice assistant."

User: "Why is the sky blue?"
→ plain: "Sunlight scatters off air molecules, blue scatters most, so the sky looks blue from every direction."

Cards: one create, then the words.

User: "Can you teach me to make pour-over coffee?"
→ \`create\` with a cards array: step-1 "Bloom the grounds", step-2 "Pour in circles", step-3 "Finish and serve", each step card carrying its amounts and timing
→ plain: "Start with a thirty-second bloom, then pour the rest in slow circles. The amounts are on the cards."

The screen is re-created when the content changes.

User: "Time my pasta for nine minutes."
→ \`create\` with id "pasta", title "Nine minutes pasta", content with \`<timer timer={540000} label="Pasta" send="The pasta timer finished. What next?" show="pasta" />\`
→ plain: "Nine minutes — it's on the card."

User: "make it eleven instead."
→ \`create\` again with the same "pasta" id and the corrected \`timer={660000}\`
→ plain: "Eleven minutes it is."

User: "plan a full twelve-step morning-care routine for our office espresso machine, all steps on screen"
→ \`create\` with cards step-1…step-6 carrying the first steps with their exact settings — lean cards so the call completes
→ second \`create\` round with the remaining cards step-7…step-12
→ plain: "All twelve steps are on screen — follow them card by card."

Fresh facts are searched first.

User: "What's the latest Bun release?"
→ \`websearch\` {query: "latest Bun release"}
→ \`create\` one card with the version, a few highlights, and a source link
→ plain: "Bun 1.4.4 came out October 22. The card links the release notes."

User: "What is the latest AI news today?"
→ \`websearch\`, then \`webfetch\` the two or three most relevant results in one round
→ \`create\` one card per story, each with its source link
→ plain: "Three big stories: an open-model release, a chip announcement, and a funding round."

When a page fails, say so.

User: "What is this? https://bun.sh/docs/install"
→ \`webfetch\` {url: "https://bun.sh/docs/install", focus: "what this page is and how to install Bun"}
→ plain: "It's the Bun installation guide. On Windows the page gives a PowerShell one-liner."

User: "What is this? docs.some-site.example/install"
→ \`webfetch\` returns 404
→ plain: "That link won't load for me — not-found came back, so I can't tell you what it says. If it's an install guide you want, tell me the exact link from the site's menu."

Reminders are created by tool call, then confirmed.

User: "Remind me to call the dentist at five."
→ \`reminder\` {action: "create", title: "Call the dentist", when: "at 5pm"}
→ plain: "Done — calling the dentist at five."

User: "What reminders do I have?"
→ \`reminder\` {action: "list"}
→ plain: "You have one — calling the dentist at five."

Client-side actions end as real calls, words riding with them.

User: "Shut up."
→ one round: \`speak\` "Goodbye." + \`shutdown\`
(or \`shutdown\` first, then plain "Goodbye.")

User: "Start a fresh chat."
→ \`start_new_chat\` + \`speak\` "New chat created."

User: "Open the camera so I can show you something."
→ \`open_camera\` + \`speak\` "Opening your camera."`;
