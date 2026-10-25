// dsh-ping-me — browser half: the settings card on Plugins → dsh-ping-me.
// Connect a phone (QR code for Android, manual steps for iPhone), choose what to
// be notified about, and test it. Fields save through dsh's own config form; the
// optional access token goes to dsh's credential store and is never read back.
window.__ModuleLoader__.load({ id: "dsh-ping-me", factory: (require) => {
  var module = { exports: {} };
  const react = require("react");
  const h = react.createElement;
  const NS = "dsh-ping-me";
  const TOKEN_REF = "DSH_PING_ME_TOKEN";
  const ROUTE = "api/dsh-ping-me";

  // Styled with dsh's own theme tokens, so it follows light/dark mode like the rest of the UI.
  const CSS = `
.pm{display:flex;flex-direction:column;gap:16px;max-width:620px;color:var(--dsw-alias-label-primary);font-size:14px}
.pm-card{background:var(--dsw-alias-settings-card-fill);border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl,12px);padding:16px 18px;display:flex;flex-direction:column;gap:14px}
.pm-h{font-size:15px;font-weight:600;margin:0}
.pm-sub{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:-8px 0 0}
.pm-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.45}
.pm-seg{display:inline-flex;align-self:flex-start;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:3px}
.pm-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:5px 16px;border-radius:999px;cursor:pointer}
.pm-seg button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.pm-connect{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.pm-qr{width:156px;height:156px;background:#fff;border-radius:12px;padding:6px;flex:none}
.pm-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;counter-reset:s;flex:1;min-width:240px}
.pm-steps li{counter-increment:s;display:flex;gap:10px;align-items:baseline;line-height:1.45}
.pm-steps li::before{content:counter(s);flex:none;width:20px;height:20px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;transform:translateY(-1px)}
.pm-topic{display:flex;align-items:center;gap:8px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 6px 6px 10px}
.pm-topic code{flex:1;font-family:var(--ds-font-family-code,monospace);font-size:13px;font-weight:600;word-break:break-all}
.pm-btn{font:inherit;font-size:13px;border-radius:8px;padding:7px 14px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);white-space:nowrap}
.pm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.pm-btn:disabled{opacity:.5;cursor:default}
.pm-btn.sm{padding:4px 10px;font-size:12px}
.pm-btn.primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.pm-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-button-primary-fill))}
.pm-btn.danger{color:var(--dsw-alias-state-error-primary)}
.pm-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pm-list{display:flex;flex-direction:column}
.pm-item{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:11px 0;border-top:1px solid var(--dsw-alias-border-l4)}
.pm-item:first-child{border-top:0;padding-top:0}
.pm-item:last-child{padding-bottom:0}
.pm-item b{font-weight:500;display:block}
.pm-sw{flex:none;width:36px;height:20px;border-radius:999px;border:0;padding:2px;cursor:pointer;background:var(--dsw-alias-border-l2);transition:background .15s}
.pm-sw[aria-checked=true]{background:var(--dsw-alias-state-business-primary)}
.pm-sw span{display:block;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
.pm-sw[aria-checked=true] span{transform:translateX(16px)}
.pm-field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500}
.pm-field input{font:inherit;font-size:14px;font-weight:400;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit}
.pm-field input:focus{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-1px}
.pm details>summary{cursor:pointer;font-size:14px;font-weight:600;list-style:none;display:flex;justify-content:space-between}
.pm details>summary::after{content:"›";transition:transform .15s;color:var(--dsw-alias-label-tertiary)}
.pm details[open]>summary::after{transform:rotate(90deg)}
.pm details[open]>summary{margin-bottom:14px}
.pm-bar{position:sticky;bottom:0;display:flex;gap:12px;align-items:center;justify-content:flex-end;padding:10px 0}
.pm-note{font-size:13px;color:var(--dsw-alias-label-secondary)}
.pm-note.err{color:var(--dsw-alias-state-error-primary)}
.pm-log{margin:0;padding:0;list-style:none;font-size:12px;display:flex;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary)}
.pm-log .bad{color:var(--dsw-alias-state-error-primary)}
`;

  const SWITCHES = [
    ["turnDone", true, "Turn finished", "The reply, when a turn you started is done."],
    ["needsYou", true, "Needs you", "An approval or a question is waiting. Loud."],
    ["failures", true, "Failures", "Errors, output limit, policy blocks. Your own Stop stays silent."],
    ["automationDone", false, "Automation runs finished", "Off: automation tasks only reach you through ping_me, failures and questions."],
    ["heartbeat", false, "Live status while a turn runs", "One silent notification, updated in place. Costs one message per update; free ntfy.sh allows about 250 a day."],
  ];

  function Switch(p) {
    return h("button", { type: "button", role: "switch", "aria-checked": !!p.on, "aria-label": p.label, className: "pm-sw",
      onClick: () => p.set(!p.on) }, h("span"));
  }
  function Field(p) {
    return h("label", { className: "pm-field" }, p.label,
      h("input", { type: p.type || "text", value: p.value, placeholder: p.placeholder,
        autoComplete: p.type === "password" ? "new-password" : "off", onChange: (e) => p.set(e.target.value) }),
      p.hint ? h("span", { className: "pm-hint" }, p.hint) : null);
  }

  function Card(props) {
    const form = props.form, ctx = props.ctx;
    const snap = react.useSyncExternalStore((fn) => form.subscribe(fn), () => form.getSnapshot());
    const v = (snap && snap.value) || {};
    const [draft, setDraft] = react.useState({});
    const [token, setToken] = react.useState("");
    const [hasToken, setHasToken] = react.useState(false);
    const [info, setInfo] = react.useState(null);
    const [qr, setQr] = react.useState(0);
    const [notice, setNotice] = react.useState({ text: "" });
    const [busy, setBusy] = react.useState(false);
    const [phone, setPhone] = react.useState("android"); // the card is viewed on a computer, so the phone can't be guessed

    const val = (k, d) => (k in draft ? draft[k] : v[k] !== undefined ? v[k] : d);
    const set = (k) => (x) => setDraft(Object.assign({}, draft, { [k]: x }));
    const say = (text, err) => setNotice({ text, err: !!err });
    const refresh = () => {
      ctx.remote.credentials.describe([TOKEN_REF]).then((r) => setHasToken(!!(r.ok && r.value[TOKEN_REF] && r.value[TOKEN_REF].configured)), () => {});
      fetch(ROUTE, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setInfo, () => {});
      setQr(Date.now());
    };
    react.useEffect(refresh, []);

    const save = async () => {
      setBusy(true); say("");
      try {
        const ops = Object.keys(draft).map((k) => ({ op: "set", path: [k], value: k === "heartbeatSec" ? Number(draft[k]) : draft[k] }));
        if (ops.length && !(await form.mutate(ops, form.getSnapshot().revision))) throw new Error("dsh refused the settings");
        if (token) {
          const r = await ctx.remote.credentials.set(TOKEN_REF, token);
          if (!r.ok) throw new Error((r.error && r.error.message) || "could not save the token");
          setToken("");
        }
        setDraft({}); say("Saved.");
      } catch (e) { say("Not saved: " + ((e && e.message) || e), true); }
      setBusy(false); refresh();
    };
    const post = async (what, confirmText) => {
      if (confirmText && !window.confirm(confirmText)) return;
      setBusy(true); say(what === "test" ? "Sending…" : "");
      try {
        const r = await (await fetch(ROUTE + "?do=" + what, { method: "POST" })).json();
        if (what === "test") say(r.ok ? "Sent. Check your phone." : "Not sent: " + r.error, !r.ok);
        else say("New topic created. Subscribe to it again on your phone.");
      } catch (e) { say("Failed: " + ((e && e.message) || e), true); }
      setBusy(false); refresh();
    };
    const copy = () => navigator.clipboard.writeText(info.topic).then(() => say("Topic name copied."), () => say("Copy failed: select the name and copy it.", true));
    const dirty = Object.keys(draft).length > 0 || !!token;
    const custom = info && info.server !== "https://ntfy.sh";

    const topicBox = h("div", { className: "pm-topic" },
      h("code", null, info ? info.topic : "…"),
      h("button", { type: "button", className: "pm-btn sm", disabled: !info, onClick: copy }, "Copy"));
    const serverStep = custom
      ? h("li", null, h("span", null, "Turn on ", h("b", null, "Use another server"), " and enter ", h("code", null, info.server), "."))
      : h("li", null, h("span", null, "Leave ", h("b", null, "Use another server"), " off."));

    return h("div", { className: "pm" }, h("style", null, CSS),

      // 1. Connect a phone
      h("section", { className: "pm-card" },
        h("div", { className: "pm-row", style: { justifyContent: "space-between" } },
          h("h3", { className: "pm-h" }, "Connect your phone"),
          h("div", { className: "pm-seg", role: "group", "aria-label": "Phone" }, [["android", "Android"], ["iphone", "iPhone"]].map(([k, l]) =>
            h("button", { key: k, type: "button", "aria-pressed": phone === k, onClick: () => setPhone(k) }, l)))),
        h("p", { className: "pm-sub" }, "Install the free ntfy app first: ", phone === "android" ? "Play Store or F-Droid." : "App Store."),
        phone === "android"
          ? h("div", { className: "pm-connect" },
              h("img", { className: "pm-qr", src: ROUTE + "?do=qr&t=" + qr, alt: "QR code that opens the topic in the ntfy app" }),
              h("ol", { className: "pm-steps" },
                h("li", null, h("span", null, "Scan the code with your phone camera. The topic opens in the ntfy app.")),
                h("li", null, h("span", null, "Tap ", h("b", null, "Subscribe"), " if it asks.")),
                h("li", null, h("span", null, "No luck? In the app tap ", h("b", null, "+"), " (bottom right) and paste this name:")),
                topicBox))
          : h("ol", { className: "pm-steps" },
              h("li", null, h("span", null, "Open the ntfy app and tap ", h("b", null, "+"), " (top right).")),
              h("li", null, h("div", { style: { display: "flex", flexDirection: "column", gap: 8, flex: 1 } },
                h("span", null, "Enter this name as the topic:"), topicBox)),
              serverStep,
              h("li", null, h("span", null, "Tap ", h("b", null, "Subscribe"), ".")),
              h("p", { className: "pm-hint", style: { margin: 0 } }, "The iPhone app can't be opened by a QR code, so the name has to be entered by hand.")),
        h("div", { className: "pm-row", style: { justifyContent: "space-between" } },
          h("button", { type: "button", className: "pm-btn primary", disabled: busy, onClick: () => post("test") }, "Send test notification"),
          h("button", { type: "button", className: "pm-btn sm danger", disabled: busy,
            onClick: () => post("rotate", "Create a new topic? Phones subscribed to the current one stop getting notifications.") }, "New topic")),
        h("span", { className: "pm-hint" }, "Push only: nothing sent to this topic can reach dsh. Keep the name private: anyone who has it can read your notifications.")),

      // 2. What to send
      h("section", { className: "pm-card" },
        h("h3", { className: "pm-h" }, "Notify me about"),
        h("div", { className: "pm-list" }, SWITCHES.map(([k, d, label, why]) =>
          h("div", { key: k, className: "pm-item" },
            h("div", null, h("b", null, label), h("span", { className: "pm-hint" }, why)),
            h(Switch, { on: val(k, d), set: set(k), label })))),
        val("heartbeat", false) ? h(Field, { label: "Update every (seconds)", type: "number", value: String(val("heartbeatSec", 60)), set: set("heartbeatSec") }) : null),

      // 3. Advanced
      h("section", { className: "pm-card" },
        h("details", null, h("summary", null, "Advanced"),
          h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
            h(Field, { label: "\"Open dsh\" button goes to", value: val("dshUrl", ""), set: set("dshUrl"),
              placeholder: info && info.detectedDshUrl ? "auto: " + info.detectedDshUrl : "auto: open dsh once in your browser",
              hint: "Empty = the address you open dsh with, detected automatically. Fill in to override." }),
            h(Field, { label: "ntfy server", value: val("server", "https://ntfy.sh"), set: set("server"), hint: "ntfy.sh or your own server." }),
            h(Field, { label: "Access token (optional)", type: "password", value: token, set: setToken,
              placeholder: hasToken ? "saved, type to replace" : "not set", hint: "For a server with access control, or a reserved topic on ntfy.sh." })))),

      // 4. Activity
      info && info.recent.length ? h("section", { className: "pm-card" },
        h("details", null, h("summary", null, "Recent notifications"),
          h("ul", { className: "pm-log" }, info.recent.map((e, i) =>
            h("li", { key: i, className: e.result === "sent" ? "" : "bad" },
              e.at.slice(11, 16) + "  " + (e.title || e.what) + (e.result === "sent" ? "" : " · " + e.result + (e.reason ? ": " + e.reason : ""))))))) : null,

      // Save bar: only when there's something to save, or something to say
      dirty || notice.text ? h("div", { className: "pm-bar" },
        notice.text ? h("span", { className: "pm-note" + (notice.err ? " err" : "") }, notice.text) : null,
        dirty ? h("button", { type: "button", className: "pm-btn", disabled: busy, onClick: () => { setDraft({}); setToken(""); } }, "Discard") : null,
        dirty ? h("button", { type: "button", className: "pm-btn primary", disabled: busy, onClick: save }, "Save") : null) : null);
  }

  module.exports.inject = ["slots", "configForms", "remote", "remote.credentials"];
  module.exports.apply = function (ctx) {
    // Tell the host which address this browser uses for dsh, for the "Open dsh" button.
    fetch(ROUTE + "?do=seen", { method: "POST", body: window.location.origin }).catch(() => {});
    ctx.effect(() => {
      const form = ctx.configForms.get(NS);
      const View = (p) => (p.view === "summary" ? null : h(Card, { form, ctx }));
      return ctx.configForms.whileServed([NS], () => ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register({ name: "plugins.bundle.config", key: NS }, View)));
    }, "dsh-ping-me: settings card");
  };
  return module.exports;
} });
