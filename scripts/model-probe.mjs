/**
 * Probe the Meta Model API muse-spark endpoint before relying on optional
 * request fields.
 *
 *   bun scripts/model-probe.mjs
 *
 * Eight tiny requests measure what this deployment accepts:
 *   1. baseline JSON-object prompt
 *   2. stream: true (first three SSE frames)
 *   3. tools + tool_choice (same shape the app sends)
 *   4. response_format: json_schema (structured output)
 *   5. reasoning_effort high vs omitted
 *   6. a generated 16 kHz WAV via input_audio (muse-spark-1.2: the documented
 *      audio turn on Meta Model API)
 *   7. an image_url still (mediaStills transport: a red square the model
 *      should describe)
 *   8. the Responses endpoint text.format json_schema contract (the shape the
 *      video channels send)
 *
 * Exits non-zero only when the baseline request fails, so the probe is safe
 * to run while the rest of the app is being upgraded.
 *
 * Makes real billed API calls: run it only with a configured MODEL_API_KEY.
 */

import { metaClient, META_BASE_URL } from "../src/lib/meta-client";
import {
  META_AUDIO_MODEL,
  META_TEXT_MODEL,
} from "../src/lib/model";

const TIMEOUT_MS = 60_000;

if (!process.env.MODEL_API_KEY?.trim()) {
  console.error("MODEL_API_KEY is not set. Add it to .env and re-run.");
  process.exit(1);
}

function log(title) {
  console.log(`\n=== ${title} ===`);
}

function preview(value, length = 200) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, length);
}

function client() {
  return metaClient();
}

async function post(model, body) {
  return client().chat.completions.create(
    // The probe tests undocumented fields against the live endpoint and reads
    // the raw choices, so the typed SDK response here is intentionally loose.
    { model, ...body },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
}

function contentOf(completion, model) {
  const message = completion.choices[0]?.message;

  return {
    model: completion.model ?? model,
    content: message?.content,
    reasoning: /** Model API extension; redacted to empty for external keys. */ (
      /** @type {any} */ (message)
    )?.reasoning_content,
    toolCalls: message?.tool_calls,
    finishReason: completion.choices[0]?.finish_reason,
    usage: completion.usage
      ? {
          prompt: completion.usage.prompt_tokens,
          cached: completion.usage.prompt_tokens_details?.cached_tokens,
          audio: completion.usage.prompt_tokens_details?.audio_tokens,
          completion: completion.usage.completion_tokens,
          reasoning: completion.usage.completion_tokens_details?.reasoning_tokens,
        }
      : undefined,
  };
}

/** One second of 440 Hz mono PCM16 at 16 kHz, wrapped in a RIFF header. */
function makeWav() {
  const sampleRate = 16_000;
  const samples = sampleRate;
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const write = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);

  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((index / sampleRate) * 2 * Math.PI * 440) * 0.25;
    view.setInt16(44 + index * 2, value * 0x7fff, true);
  }

  return Buffer.from(buffer).toString("base64");
}

const textMessages = [
  {
    role: "system",
    content:
      'Return only a JSON object: {"transcript":"...","speak":"...","conversation":"..."}.',
  },
  { role: "user", content: "Say hello in one short sentence." },
];

let baselineOk = false;

try {
  // 1. Baseline.
  log(`1. baseline JSON-object prompt (${META_TEXT_MODEL}, ${META_BASE_URL})`);
  const baseline = await post(META_TEXT_MODEL, {
    messages: textMessages,
    max_completion_tokens: 200,
    temperature: 0.1,
    reasoning_effort: "high",
    response_format: { type: "json_object" },
  });

  console.log(JSON.stringify(contentOf(baseline, META_TEXT_MODEL)).slice(0, 400));
  baselineOk = true;
} catch (error) {
  console.error(error);
}

if (baselineOk) {
  try {
    // 2. Streaming.
    log("2. stream: true (first three SSE frames)");
    const stream = await client().chat.completions.create(
      {
        model: META_TEXT_MODEL,
        messages: textMessages,
        max_completion_tokens: 200,
        temperature: 0.1,
        reasoning_effort: "high",
        stream: true,
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    let frames = 0;
    for await (const chunk of stream) {
      if (!chunk.choices?.[0]) continue;

      console.log(preview(JSON.stringify(chunk.choices[0]), 300));
      frames += 1;
      if (frames >= 3) break;
    }

    if (frames === 0) console.log("stream produced no content frames");
  } catch (error) {
    console.error(error);
  }

  try {
    // 3. Native tools.
    log("3. tools + tool_choice: auto");
    const tools = await post(META_TEXT_MODEL, {
      messages: [
        {
          role: "system",
          content: "Use the get_current_time tool when asked about time.",
        },
        { role: "user", content: "What time is it right now in Tokyo?" },
      ],
      max_completion_tokens: 200,
      temperature: 0.1,
      reasoning_effort: "high",
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_time",
            description: "Return the current time for a timezone.",
            parameters: {
              type: "object",
              properties: {
                timezone: {
                  type: ["string", "null"],
                  description:
                    "An IANA timezone such as Asia/Tokyo. Null means UTC.",
                },
              },
              required: ["timezone"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: "auto",
    });

    console.log(JSON.stringify(contentOf(tools, META_TEXT_MODEL)).slice(0, 500));
  } catch (error) {
    console.error(error);
  }

  try {
    // 4. response_format: json_schema.
    log("4. response_format: json_schema");
    const schema = await post(META_TEXT_MODEL, {
      messages: [
        { role: "system", content: "Answer as JSON." },
        { role: "user", content: "Name one fruit." },
      ],
      max_completion_tokens: 120,
      reasoning_effort: "high",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "probe_turn",
          strict: true,
          schema: {
            type: "object",
            properties: {
              transcript: { type: "string" },
              speak: { type: "string" },
              conversation: { type: "string" },
            },
            required: ["transcript", "speak", "conversation"],
            additionalProperties: false,
          },
        },
      },
    });

    console.log(JSON.stringify(contentOf(schema, META_TEXT_MODEL)).slice(0, 500));
  } catch (error) {
    console.error(error);
  }

  try {
    // 5. Reasoning effort.
    log("5. reasoning_effort high vs omitted");
    for (const [label, effort] of [
      ["high", "high"],
      ["omitted", undefined],
    ]) {
      const probe = await post(META_TEXT_MODEL, {
        messages: textMessages,
        max_completion_tokens: 120,
        temperature: 0.1,
        ...(effort ? { reasoning_effort: effort } : {}),
      });
      const content = contentOf(probe, META_TEXT_MODEL);

      console.log(
        `${label}: model=${content.model} content=${preview(content.content, 100)} reasoning=${preview(content.reasoning, 100)} reasoning_tokens=${content.usage?.reasoning}`,
      );
    }
  } catch (error) {
    console.error(`reasoning_effort:`, error);
  }
}

try {
  // 6. Audio shape on muse-spark-1.2 (the documented audio turn on 1.3 is degraded).
  log(`6. generated 16 kHz WAV via input_audio (${META_AUDIO_MODEL})`);
  const wav = makeWav();
  const audio = await post(META_AUDIO_MODEL, {
    messages: [
      {
        role: "system",
        content:
          'Transcribe the clip and answer. Return only {"transcript":"...","speak":"...","conversation":"..."}.',
      },
      {
        role: "user",
        content: [
          { type: "input_audio", input_audio: { data: wav, format: "wav" } },
          {
            type: "text",
            text: "Transcribe and answer this recording. Return only the JSON object.",
          },
        ],
      },
    ],
    max_completion_tokens: 200,
    temperature: 0.1,
    reasoning_effort: "high",
    response_format: { type: "json_object" },
  });

  console.log(JSON.stringify(contentOf(audio, META_AUDIO_MODEL)).slice(0, 500));
} catch (error) {
  console.error(`input_audio:`, error);
}

try {
  // 7. image_url still (mediaStills transport on the text model).
  // A 1x1 red PNG only proves the part is accepted; describing real signing
  // needs a real hand photo, which this probe does not ship.
  log(`7. image_url still (${META_TEXT_MODEL})`);
  const red =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const image = await post(META_TEXT_MODEL, {
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${red}` } },
          { type: "text", text: "What color is the square in one word?" },
        ],
      },
    ],
    max_completion_tokens: 60,
    temperature: 0.1,
    reasoning_effort: "high",
  });

  console.log(JSON.stringify(contentOf(image, META_TEXT_MODEL)).slice(0, 500));
} catch (error) {
  console.error(`image_url:`, error);
}

try {
  // 8. Responses endpoint text.format json_schema (the streaming video channel).
  log(`8. /v1/responses text.format json_schema (${META_TEXT_MODEL})`);
  const responses = await client().responses.create(
    {
      model: META_TEXT_MODEL,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Name one fruit." }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "probe_fruit",
          strict: true,
          schema: {
            type: "object",
            properties: { fruit: { type: "string" } },
            required: ["fruit"],
            additionalProperties: false,
          },
        },
      },
      reasoning: { effort: "minimal" },
      max_output_tokens: 2_048,
      temperature: 0,
      store: false,
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );

  const text = responses.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content)
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("");

  console.log(
    `status=${responses.status} usage=${preview(JSON.stringify(responses.usage), 160)} text=${preview(text, 200)}`,
  );
} catch (error) {
  console.error(`responses:`, error);
}

if (!baselineOk) {
  console.error("\nBaseline request failed; fix credentials or access first.");
  process.exit(1);
}

console.log("\nProbe complete.");
