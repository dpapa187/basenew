# Visionary Studio – AI Video Generator

Visionary Studio is a full-stack web application that allows creative teams to generate short-form videos from natural language prompts using the [fal.ai](https://fal.ai) video generation pipelines. The project contains a lightweight Node.js backend that proxies requests to fal.ai and a polished front-end interface for composing prompts, selecting formats, and reviewing renders.

## Features

- ✏️ **Creative prompt designer** – Rich textarea with guidance for crafting cinematic ideas.
- 🖼️ **Aspect ratio control** – Choose between 16:9 landscape, 9:16 portrait, or 1:1 square outputs.
- ⏱️ **Duration presets** – Trigger 5 or 10 second renders depending on your storytelling needs.
- 📹 **Video preview and download** – Watch completed clips in-app and grab the MP4 directly.
- 🕒 **Generation history** – Recent renders are cached locally for quick reference and reuse.
- 🛡️ **Secure server proxy** – API key stays on the server while the client receives only the final asset URL.
- 🍎 **Optional Sign in with Apple** – Allow collaborators to authenticate with their Apple ID before generating content.

## Getting started

### Prerequisites

- Node.js 18 or later
- A fal.ai account with access to a video generation pipeline such as `fal-ai/fast-svd-video`

### Installation

1. **Clone the repository** and switch into the directory.

   ```bash
   git clone <your-fork-url>
   cd basenew
   ```

2. **Install the dependencies.**

   ```bash
   npm install
   ```

3. **Create a fal.ai API key.**

   1. Sign in (or create a free account) at [fal.ai](https://fal.ai/).
   2. Open the [API keys](https://fal.ai/dashboard/keys) page from the dashboard sidebar.
   3. Click **Create new key**, give it a descriptive name, and copy the generated token. Keep it secure—this key authorises requests to the video pipelines.

4. **Configure environment variables.** Duplicate `.env.example` to `.env` and populate the variables with your key and any overrides you need:

   ```env
   FAL_API_KEY=your_fal_api_key
   # Optional overrides
   FAL_PIPELINE=fal-ai/fast-svd-video
   PORT=3000
   ```

   > 💡 `FAL_PIPELINE` defaults to `fal-ai/fast-svd-video`; change it if your account has access to a different model.

5. **(Optional) Configure Sign in with Apple.** If you want to require Apple authentication before generating videos, gather the
   following from the [Apple Developer](https://developer.apple.com/) portal:

   - A Services ID for `Sign in with Apple` (used as `APPLE_CLIENT_ID`).
   - Your 10-character Team ID (`APPLE_TEAM_ID`).
   - The Key ID of a Sign in with Apple private key (`APPLE_KEY_ID`).
   - The private key itself. Download the `.p8` file and copy its contents into `APPLE_PRIVATE_KEY`, replacing newlines with `\n`.
   - A redirect URL configured on the Services ID that points to `http://localhost:3000/auth/apple/callback` (or your deployed
     domain).

   Update `.env` with these values. Restart the server whenever credentials change.

6. **Start the development server.**

   ```bash
   npm start
   ```

7. Open [http://localhost:3000](http://localhost:3000) in your browser to access Visionary Studio.

## How to test the app

The project does not include automated tests yet, so the recommended way to validate your
setup is through quick manual checks:

1. **Verify the server is running.** In a new terminal, make a HEAD request and confirm
   you receive a `200 OK` response:

   ```bash
   curl -I http://localhost:3000
   ```

2. **Trigger a sample video render.** In the browser, fill out the prompt form and click
   **Generate video**. The status indicator should move through _Queued_ → _Processing_
   → _Completed_, after which the video preview loads. If the status stalls or errors,
   check the terminal running `npm start` for the detailed fal.ai error payload.

3. **(Optional) Exercise the API directly.** You can also hit the backend from the command
   line. Replace the `prompt` text with your own creative brief:

   ```bash
   curl -X POST http://localhost:3000/api/generate \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "sunset drone shot over alpine lake",
       "aspectRatio": "16:9",
       "duration": 5
     }'
   ```

   The server returns JSON with a `statusUrl` you can poll (also exposed in the UI) until
   the render finishes.

4. **(Optional) Test Sign in with Apple.** After providing the Apple credentials in
   `.env`, click **Connect with Apple** in the sidebar. Apple should redirect you to its
   consent screen and back to the app showing your profile details. If you encounter
   issues, double-check the Services ID redirect URL and the private key contents.

## Project structure

```
.
├── public/            # Static front-end assets (HTML, CSS, JS)
├── server.js          # HTTP server, static file handler, fal.ai proxy
├── package.json       # Node.js metadata and scripts
├── .env.example       # Environment variable template
└── README.md          # Documentation
```

## fal.ai integration

The backend sends prompt requests to the configurable fal.ai pipeline via the `/invoke` endpoint and polls the provided status URL until the video is ready. The server never exposes your API key to the browser. If fal.ai updates their payload shape, adjust the `requestFalVideo` helper in `server.js` accordingly.

## Customisation

- **Styling** – Update `public/styles.css` to tweak the visual theme.
- **History depth** – Modify the `HISTORY_KEY` logic in `public/app.js` to adjust how many renders are kept.
- **Additional controls** – Extend the form in `public/index.html` to expose more fal.ai parameters such as guidance scale or negative prompts.
- **Authentication providers** – Provide values for the Apple environment variables in `.env` to enable Sign in with Apple on
  the landing page.

## Troubleshooting

- If the app reports missing configuration, ensure that `.env` exists and includes `FAL_API_KEY`.
- Check your fal.ai subscription for sufficient credits or quota to run the selected pipeline.
- Inspect server logs for the raw fal.ai error response when debugging generation failures.
- Verify that the machine running the app can reach `https://fal.run`—corporate firewalls occasionally block outbound requests to external APIs.
- For Apple sign in issues, confirm that your Services ID redirect URLs match `APPLE_REDIRECT_URI` exactly and that the
  configured private key has not expired.

## License

This project is released under the MIT License.
