# dsh-ping-me: setup guide for agents

You are helping a user set up **dsh-ping-me**. It pushes dsh notifications to their phone through ntfy, one way only. Follow these steps in order. After each step, **ask the user to confirm** before going on. Keep messages short: one step at a time.

## Rules

- **The topic is a secret.** Anyone who has it can read the user's notifications. Show it only to the user in this chat. Never put it in files, commits, issues or web searches.
- **Don't edit config files** (`cordis.patch.yml`, `state.json`). The user changes settings in the settings card. Hand-edits can be lost or skip validation.
- **Don't restart dsh** unless the user agrees. A restart interrupts every running session.
- **Only the user can** scan the QR code, click in the browser, or see their phone. Ask them what they see, and don't assume.

## Facts you can check yourself

- **dsh home:** `$DSH_HOME`, or `~/.dsh` if it's unset. Below, `<home>` means that folder.
- **Topic:** `<home>/ping-me/state.json` → `"topic"`. The plugin creates it on first start.
- **Server:** the `server` value of the `dsh-ping-me` entry in `<home>/profiles/<profile>/cordis.patch.yml`. If there's no entry, it's `https://ntfy.sh`.
- **Plugin installed?** The profile's `package.json` lists `dsh-ping-me` under `dependencies` and under `dsh.profile.bundles`.
- **Log of automation pings and failed sends:** `<home>/ping-me/log.jsonl`.

## Steps

1. **Plugin loaded?**
   - Check that `<home>/ping-me/state.json` exists.
   - If it doesn't, the plugin hasn't started since install. dsh needs a restart; ask first.
2. **Phone app.** Ask the user to install **ntfy**:
   - Android: Play Store or F-Droid. iPhone: App Store.
   - Then open it once and allow notifications.
3. **Settings card.** Ask the user to open dsh in the browser: **Plugins → Installed plugins → dsh-ping-me**. They should see a QR code.
4. **Subscribe.** Explain first: the topic is a private channel that dsh posts to and the phone listens to. No account is needed.
   - **Android:** the user picks **Android** above the QR code in the card and scans it with the phone camera. The ntfy app opens the topic directly; they tap **Subscribe** if it asks.
   - **iPhone, or if scanning fails:** in the app tap **+** (iPhone: top right, Android: bottom right). **Topic** = the topic *name* only, from **Copy topic name** in the card or from `state.json`, not the full URL. Leave **Use another server** off for ntfy.sh, or turn it on and enter the server URL for any other server. Tap **Subscribe**.
   - **iPhone has no QR shortcut:** the iPhone app handles no links, so the topic must be entered by hand. The card's **iPhone** tab shows the steps.
   - Check: the topic is now listed in the app.
5. **Test push.**
   - Ask the user to click **Send test notification** in the card. They should get "👋 dsh-ping-me works" within seconds.
   - If the card isn't reachable, send one yourself and ask whether it arrived:
     `curl -s -H "Title: dsh-ping-me test" -d "Hello from your agent" <server>/<topic>`
6. **"Open dsh" button.** It's detected automatically: every dsh page reports its address, and an https address beats `localhost`. Ask the user to check the placeholder of the **"Open dsh" button goes to** field (`auto: …`). If it shows `localhost` / `127.0.0.1`, they should open dsh once through the address they use from their phone. They should fill in the field only to override it, then **Save**.
7. **Optional: automation test.** Offer to create this test task with `schedule_create`:
   - `after_seconds: 60`, `title: "ping-me test"`
   - prompt: `Pretend you found an anomaly: call ping_me with title 'test alert' and message 'this is a test'. Then reply done.`
   - About a minute later the user should get **⚠️ test alert**, and no ✅ for that run.
8. **Done.**
   - Tell the user what they'll get: ✅ finished turns, ✋/❓ approvals and questions, ❌ failures, ⚠️ automation alerts.
   - Point them to the switches in the card.
   - **Live heartbeat:** recommend leaving it off on ntfy.sh, which allows about 250 messages a day.

## If nothing arrives

Work through these in order. Ask about one at a time.

1. **Card → Recent notifications** (bottom of the card). A failed send shows its reason there.
   - **`429`:** ntfy.sh's daily limit is reached. Wait, or use your own server.
   - **`401` / `403`:** the server needs an access token. The user enters it under *Own ntfy server / access token*.
2. **Topic mismatch.** The phone subscription must be exactly `<server>/<topic>`. **New topic** in the card changes it, and then the phone must subscribe again.
3. **Phone settings.**
   - Notifications must be allowed for ntfy.
   - Android: set ntfy's battery usage to *Unrestricted*.
   - iPhone: notifications may be delayed while the app is closed.
4. **Network.** Check that the dsh host reaches the server: `curl -sI <server>` should answer `HTTP/2 200`.
5. **Wrong event.** Turns that a *subagent* runs never notify. And the reply of an automation run notifies only if *Automation runs finished* is on.

## Background: why it's built this way

- **Push only.** The plugin never subscribes, so nothing posted to the topic reaches an agent. Approvals and questions are answered in dsh, not from the phone.
- **`ping_me` works only in turns an automation task started.** In a normal chat it refuses, so you tell the user in chat instead.
