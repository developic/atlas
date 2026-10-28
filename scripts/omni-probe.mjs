/**
 * Probe the free NVIDIA Nemotron omni endpoint before relying on optional
 * request fields.
 *
 *   bun scripts/omni-probe.mjs
 *
 * Seven tiny requests measure what this specific deployment accepts:
 *   1. baseline JSON-object prompt
 *   2. stream: true (first three SSE frames)
 *   3. tools + tool_choice (strict schema, same shape the app sends)
 *   4. response_format: json_object
 *   5. enable_thinking false vs omitted
 *   6. a generated 16 kHz WAV via audio_url and input_audio
 *   7. response_format: json_schema (evidence for schema mode)
 *
 * Exits non-zero only when the baseline request fails, so the probe is safe to
 * run while the rest of the app is being upgraded.
 */

const URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const TIMEOUT_MS = 60_000;

const key = process.env.NVIDIA_API_KEY?.trim();

if (!key) {
  console.error("NVIDIA_API_KEY is not set. Add it to .env and re-run.");
  process.exit(1);
}

function log(title) {
  console.log(`\n=== ${title} ===`);
}

function preview(value, length = 200) {
  return String(value ?? "").replace(/\s+/g, " ").slice(0, length);
}

async function post(body) {
  const response = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  return response;
}

async function readJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function contentOf(payload) {
  const message = payload?.choices?.[0]?.message;

  return {
    content: message?.content,
    reasoning: message?.reasoning_content,
    toolCalls: message?.tool_calls,
    finishReason: payload?.choices?.[0]?.finish_reason,
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

async function main() {
  let baselineOk = false;

  // 1. Baseline.
  log("1. baseline JSON-object prompt");
  try {
    const response = await post({
      messages: textMessages,
      max_tokens: 200,
      temperature: 0.2,
      top_k: 1,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_object" },
    });
    const payload = await readJson(response);

    console.log(`status ${response.status}`);
    console.log(JSON.stringify(contentOf(payload)).slice(0, 400));
    console.log(preview(payload?.raw));
    baselineOk = response.ok;
  } catch (error) {
    console.error(error);
  }

  // 2. Streaming.
  log("2. stream: true (first three SSE frames)");
  try {
    const response = await post({
      messages: textMessages,
      max_tokens: 200,
      temperature: 0.2,
      top_k: 1,
      chat_template_kwargs: { enable_thinking: false },
      stream: true,
    });

    console.log(`status ${response.status}`);
    console.log(`content-type ${response.headers.get("content-type")}`);

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let frames = 0;

      while (frames < 3) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });

        const parts = text.split("\n\n");
        text = parts.pop() ?? "";

        for (const frame of parts) {
          if (!frame.trim()) continue;
          console.log(preview(frame, 300));
          frames += 1;
          if (frames >= 3) break;
        }
      }

      await reader.cancel().catch(() => {});
    }
  } catch (error) {
    console.error(error);
  }

  // 3. Native tools.
  log("3. tools + tool_choice: auto");
  try {
    const response = await post({
      messages: [
        {
          role: "system",
          content: "Use the get_current_time tool when asked about time.",
        },
        { role: "user", content: "What time is it right now in Tokyo?" },
      ],
      max_tokens: 200,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: false },
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_time",
            description: "Return the current time for a timezone.",
            strict: true,
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
    const payload = await readJson(response);

    console.log(`status ${response.status}`);
    console.log(JSON.stringify(contentOf(payload)).slice(0, 500));
    console.log(preview(payload?.raw));
  } catch (error) {
    console.error(error);
  }

  // 4. response_format.
  log("4. response_format: json_object");
  try {
    const response = await post({
      messages: textMessages,
      max_tokens: 120,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_object" },
    });
    const payload = await readJson(response);

    console.log(`status ${response.status}`);
    console.log(JSON.stringify(contentOf(payload)).slice(0, 300));
    console.log(preview(payload?.raw));
  } catch (error) {
    console.error(error);
  }

  // 5. Thinking flag.
  log("5. enable_thinking false vs omitted");
  for (const [label, kwargs] of [
    ["off", { enable_thinking: false }],
    ["omitted", undefined],
  ]) {
    try {
      const response = await post({
        messages: textMessages,
        max_tokens: 120,
        temperature: 0.2,
        ...(kwargs ? { chat_template_kwargs: kwargs } : {}),
      });
      const payload = await readJson(response);
      const content = contentOf(payload);

      console.log(
        `${label}: status ${response.status} content=${preview(content.content, 100)} reasoning=${preview(content.reasoning, 100)}`,
      );
    } catch (error) {
      console.error(`${label}:`, error);
    }
  }

  // 6. Audio shapes.
  log("6. generated 16 kHz WAV via audio_url and input_audio");
  const wav = makeWav();

  for (const [label, part] of [
    [
      "audio_url",
      { type: "audio_url", audio_url: { url: `data:audio/wav;base64,${wav}` } },
    ],
    ["input_audio", { type: "input_audio", input_audio: { data: wav, format: "wav" } }],
  ]) {
    try {
      const response = await post({
        messages: [
          {
            role: "system",
            content:
              'Transcribe the clip and answer. Return only {"transcript":"...","speak":"...","conversation":"..."}.',
          },
          {
            role: "user",
            content: [
              part,
              {
                type: "text",
                text: "Transcribe and answer this recording. Return only the JSON object.",
              },
            ],
          },
        ],
        max_tokens: 200,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: "json_object" },
      });
      const payload = await readJson(response);

      console.log(`\n${label}: status ${response.status}`);
      console.log(JSON.stringify(contentOf(payload)).slice(0, 500));
      console.log(preview(payload?.raw));
    } catch (error) {
      console.error(`${label}:`, error);
    }
  }

  // 7. response_format: json_schema (Structured Outputs subset).
  // Evidence only: the app keeps json_object until this probe returns the three
  // keys in order; schema mode is not yet wired in.
  log("7. response_format: json_schema");
  try {
    const response = await post({
      messages: [
        { role: "system", content: "Answer as JSON." },
        { role: "user", content: "Name one fruit." },
      ],
      max_tokens: 120,
      chat_template_kwargs: { enable_thinking: false },
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
    const payload = await readJson(response);

    console.log(`status ${response.status}`);
    console.log(JSON.stringify(contentOf(payload)).slice(0, 500));
    console.log(preview(payload?.raw));
  } catch (error) {
    console.error(error);
  }

  if (!baselineOk) {
    console.error("\nBaseline request failed; fix credentials or access first.");
    process.exit(1);
  }

  console.log("\nProbe complete.");
}

await main();
