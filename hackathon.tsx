import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Volume2, VolumeX, Loader2, Send, Bot, TrendingUp, CreditCard, PieChart, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  PieChart as RChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

/**
 * Brex Voice Finance Assistant — Single-file React component
 * ----------------------------------------------------------
 * What this does
 * - Push-to-talk voice capture (Web Speech API)
 * - Simple intent parser for finance ops (balance, spend by category, cards, reimbursements)
 * - Text-to-speech responses
 * - Mock Brex API layer you can swap for real endpoints
 * - Clean UI with shadcn/ui + Tailwind + Recharts
 *
 * How to use
 * 1) Drop this file into your React app (e.g., src/components/BrexVoiceAssistant.tsx) and import it.
 * 2) Ensure Tailwind + shadcn/ui + lucide-react + framer-motion + recharts are installed.
 *    npm i lucide-react framer-motion recharts
 *    (shadcn/ui requires your project setup; if you don't use it, swap Card/Button/etc. for your own components.)
 * 3) By default MOCK_MODE = true. You can connect real endpoints by setting MOCK_MODE = false and filling brexApi.* calls.
 * 4) Use in a page: <div className="p-6"><BrexVoiceAssistant /></div>
 */

// ===================== Config =====================
const MOCK_MODE = true;
const VOICE_DEFAULT = ""; // system default. Set to a specific voice name if desired.

// ===================== Types =====================
interface SpendSlice { name: string; value: number }

interface AssistantEvent {
  id: string;
  role: "user" | "assistant" | "system";
  text?: string;
  rich?: React.ReactNode;
  ts: number;
}

// ===================== Mock Brex API =====================
const brexApi = {
  async getCashBalance() {
    if (MOCK_MODE) {
      await sleep(600);
      return {
        currency: "USD",
        available: 48234567.12,
        yesterdayChangePct: 0.8,
      };
    }
    // TODO: Replace with your real Brex API call
    // const res = await fetch("/api/brex/cash-balance");
    // return await res.json();
    throw new Error("Not implemented");
  },

  async getSpendByCategory({ fromDays = 30 }: { fromDays?: number }) {
    if (MOCK_MODE) {
      await sleep(700);
      const data: SpendSlice[] = [
        { name: "SaaS", value: 182300 },
        { name: "Travel", value: 124500 },
        { name: "Meals", value: 54320 },
        { name: "Marketing", value: 225100 },
        { name: "Vendors", value: 334000 },
      ];
      return { windowDays: fromDays, data };
    }
    // const res = await fetch(`/api/brex/spend-by-category?days=${fromDays}`);
    // return await res.json();
    throw new Error("Not implemented");
  },

  async createVirtualCard({ team, limit, currency = "USD" }: { team: string; limit: number; currency?: string }) {
    if (MOCK_MODE) {
      await sleep(800);
      return {
        id: `card_${Math.random().toString(36).slice(2, 10)}`,
        team,
        limit,
        currency,
        last4: String(1000 + Math.floor(Math.random() * 9000)),
        status: "active",
      };
    }
    // const res = await fetch("/api/brex/virtual-cards", { method: "POST", body: JSON.stringify({ team, limit, currency }) });
    // return await res.json();
    throw new Error("Not implemented");
  },

  async freezeCard({ last4 }: { last4: string }) {
    if (MOCK_MODE) {
      await sleep(500);
      return { last4, status: "frozen" };
    }
    // const res = await fetch("/api/brex/cards/freeze", { method: "POST", body: JSON.stringify({ last4 }) });
    // return await res.json();
    throw new Error("Not implemented");
  },

  async approveExpense({ reportId }: { reportId: string }) {
    if (MOCK_MODE) {
      await sleep(600);
      return { reportId, status: "approved" };
    }
    // const res = await fetch("/api/brex/expenses/approve", { method: "POST", body: JSON.stringify({ reportId }) });
    // return await res.json();
    throw new Error("Not implemented");
  },
};

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// ===================== Intent Parsing =====================

type IntentKind =
  | "cash.balance"
  | "spend.category"
  | "card.create.virtual"
  | "card.freeze"
  | "expense.approve"
  | "smalltalk.help"
  | "unknown";

interface ParsedIntent {
  kind: IntentKind;
  params: Record<string, string | number>;
}

function parseIntent(utterance: string): ParsedIntent {
  const q = utterance.toLowerCase().trim();

  // Cash balance
  if (/cash|balance|how much (money|cash)|available/.test(q)) {
    return { kind: "cash.balance", params: {} };
  }

  // Spend by category with optional window
  if (/(spend|spending).*(category|by category)|category.*spend/.test(q)) {
    const m = q.match(/last\s+(\d{1,3})\s*(day|days|d)/);
    const days = m ? Number(m[1]) : 30;
    return { kind: "spend.category", params: { days } };
  }

  // Create virtual card
  if (/(create|make|issue).*(virtual\s*card|card).*for/.test(q)) {
    const teamMatch = q.match(/for\s+([a-zA-Z\s]+?)(?:\s+with|\s+limit|$)/);
    const team = teamMatch ? titleCase(teamMatch[1].trim()) : "General";
    const limitMatch = q.match(/limit\s*(of\s*)?\$?([\d,]+)(?:\s*([a-z]{3}))?/);
    const limit = limitMatch ? Number(limitMatch[2].replace(/,/g, "")) : 5000;
    const currency = (limitMatch?.[3] || "USD").toUpperCase();
    return { kind: "card.create.virtual", params: { team, limit, currency } };
  }

  // Freeze card
  if (/(freeze|lock|block).*(card)/.test(q)) {
    const last4 = (q.match(/ending\s*(?:in\s*)?(\d{4})/) || q.match(/last\s*4\s*(\d{4})/) || ["", "0000"])[1];
    return { kind: "card.freeze", params: { last4 } };
  }

  // Approve expense
  if (/(approve|accept).*(expense|report)/.test(q)) {
    const reportId = (q.match(/(?:report|id)\s*(\w+)/) || ["", "RPT-1234"])[1];
    return { kind: "expense.approve", params: { reportId } };
  }

  if (/help|what can you do|capability|features?/.test(q)) {
    return { kind: "smalltalk.help", params: {} };
  }

  return { kind: "unknown", params: {} };
}

function titleCase(s: string) { return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()); }

// ===================== Speech Helpers =====================

type SR = any; // vendor types vary; keep it flexible

function useSpeech() {
  const recognitionRef = useRef<SR | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const recog = new SR();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";

    recog.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        t += e.results[i][0].transcript;
      }
      setTranscript(t);
    };
    recog.onend = () => setListening(false);
    recognitionRef.current = recog;
  }, []);

  const start = () => {
    if (!recognitionRef.current) return;
    setTranscript("");
    setListening(true);
    try { recognitionRef.current.start(); } catch {}
  };
  const stop = () => {
    if (!recognitionRef.current) return;
    setListening(false);
    try { recognitionRef.current.stop(); } catch {}
  };

  return { supported, listening, transcript, start, stop, setTranscript };
}

function speak(text: string, voiceName = VOICE_DEFAULT) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  if (voiceName) {
    const v = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
    if (v) u.voice = v;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

// ===================== UI =====================

export default function BrexVoiceAssistant() {
  const { supported, listening, transcript, start, stop, setTranscript } = useSpeech();
  const [events, setEvents] = useState<AssistantEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [tts, setTts] = useState(true);
  const [textInput, setTextInput] = useState("");

  useEffect(() => {
    addSystem("Hi! I can check balances, summarize spend, create/freeze cards, and approve expenses. Hold the mic and talk, or type below.");
    // Warm voices
    if (typeof window !== "undefined" && (window as any).speechSynthesis) {
      (window as any).speechSynthesis.getVoices();
    }
  }, []);

  function addEvent(e: Omit<AssistantEvent, "id" | "ts">) {
    setEvents(prev => [...prev, { id: Math.random().toString(36).slice(2), ts: Date.now(), ...e }]);
  }
  function addUser(text: string) { addEvent({ role: "user", text }); }
  function addAssistant(text: string, rich?: React.ReactNode) { addEvent({ role: "assistant", text, rich }); }
  function addSystem(text: string) { addEvent({ role: "system", text }); }

  async function handleUtterance(q: string) {
    setBusy(true);
    addUser(q);
    const intent = parseIntent(q);

    try {
      switch (intent.kind) {
        case "cash.balance": {
          const r = await brexApi.getCashBalance();
          const msg = `Available cash balance is ${fmtMoney(r.available, r.currency)} (\u2191 ${r.yesterdayChangePct}% since yesterday).`;
          addAssistant(msg, (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <InfoStat icon={<TrendingUp className="w-5 h-5" />} label="Available" value={fmtMoney(r.available, r.currency)} />
              <InfoStat icon={<Shield className="w-5 h-5" />} label="Status" value="All accounts healthy" />
              <InfoStat icon={<Bot className="w-5 h-5" />} label="Change (1d)" value={`${r.yesterdayChangePct}%`} />
            </div>
          ));
          if (tts) speak(msg);
          break;
        }
        case "spend.category": {
          const days = Number(intent.params.days || 30);
          const r = await brexApi.getSpendByCategory({ fromDays: days });
          const total = r.data.reduce((a, b) => a + b.value, 0);
          const msg = `Total spend by category for the last ${r.windowDays} days is ${fmtMoney(total)}. I\'ve charted the breakdown.`;
          addAssistant(msg, (
            <div className="mt-3">
              <div className="h-64">
                <ResponsiveContainer>
                  <RChart>
                    <Pie data={r.data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                      {r.data.map((s, i) => (
                        <Cell key={s.name} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                  </RChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {r.data.map(s => (
                  <Badge key={s.name} className="text-sm">{s.name}: {fmtMoney(s.value)}</Badge>
                ))}
              </div>
            </div>
          ));
          if (tts) speak(msg);
          break;
        }
        case "card.create.virtual": {
          const team = String(intent.params.team || "General");
          const limit = Number(intent.params.limit || 5000);
          const currency = String(intent.params.currency || "USD");
          const r = await brexApi.createVirtualCard({ team, limit, currency });
          const msg = `Created a ${currency} ${limit.toLocaleString()} virtual card for ${team}, ending in ${r.last4}.`;
          addAssistant(msg, (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <InfoStat icon={<CreditCard className="w-5 h-5" />} label="Card ID" value={r.id} />
              <InfoStat icon={<Shield className="w-5 h-5" />} label="Status" value={r.status} />
            </div>
          ));
          if (tts) speak(msg);
          break;
        }
        case "card.freeze": {
          const last4 = String(intent.params.last4 || "0000");
          const r = await brexApi.freezeCard({ last4 });
          const msg = `Card ending in ${r.last4} is now ${r.status}.`;
          addAssistant(msg);
          if (tts) speak(msg);
          break;
        }
        case "expense.approve": {
          const reportId = String(intent.params.reportId || "RPT-1234");
          const r = await brexApi.approveExpense({ reportId });
          const msg = `Expense report ${r.reportId} is ${r.status}.`;
          addAssistant(msg);
          if (tts) speak(msg);
          break;
        }
        case "smalltalk.help": {
          const msg = "You can ask: 'cash balance', 'spend by category last 30 days', 'create a virtual card for Sales with limit 2000 USD', 'freeze card ending 1234', or 'approve expense report RPT-7711'.";
          addAssistant(msg);
          if (tts) speak(msg);
          break;
        }
        default: {
          const msg = "Sorry, I didn\'t catch that. Try 'cash balance' or 'spend by category'.";
          addAssistant(msg);
          if (tts) speak(msg);
        }
      }
    } catch (err: any) {
      const msg = `Something went wrong: ${err?.message || err}`;
      addAssistant(msg);
      if (tts) speak(msg);
    } finally {
      setBusy(false);
    }
  }

  function onMicClick() {
    if (!supported) return;
    if (listening) {
      stop();
      if (transcript.trim()) handleUtterance(transcript.trim());
    } else {
      start();
    }
  }

  function onSendText() {
    const q = textInput.trim();
    if (!q) return;
    setTextInput("");
    handleUtterance(q);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Card className="shadow-lg border-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-2xl bg-primary/10">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl">Brex Voice Finance Assistant</CardTitle>
                <p className="text-sm text-muted-foreground">Hands-free balance checks, spend insights, and card actions.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">{MOCK_MODE ? "Mock Mode" : "Live Mode"}</Badge>
              <Button variant="outline" onClick={() => setTts(v => !v)} className="gap-2">
                {tts ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} {tts ? "Voice On" : "Voice Off"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mic + transcript */}
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
            <div className="flex-1">
              <Input
                placeholder={supported ? (listening ? "Listening..." : "Type a request: e.g., 'spend by category last 30 days'") : "Type your request (microphone unsupported)"}
                value={listening ? transcript : textInput}
                onChange={e => (listening ? setTranscript(e.target.value) : setTextInput(e.target.value))}
                onKeyDown={e => { if (e.key === "Enter") onSendText(); }}
                className="h-12 text-base"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={onMicClick} variant={listening ? "destructive" : "default"} className="h-12 w-12 p-0 rounded-2xl" aria-label="Toggle microphone">
                {listening ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button onClick={onSendText} disabled={busy} className="h-12 w-12 p-0 rounded-2xl" aria-label="Send">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Timeline */}
          <div className="mt-6 space-y-3">
            <AnimatePresence>
              {events.map(e => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <MessageBubble evt={e} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ evt }: { evt: AssistantEvent }) {
  const isUser = evt.role === "user";
  const isAssistant = evt.role === "assistant";
  const icon = isUser ? <Shield className="w-4 h-4" /> : <Bot className="w-4 h-4" />;
  const tone = isUser ? "bg-secondary" : evt.role === "system" ? "bg-muted" : "bg-primary/10";

  return (
    <div className={`rounded-2xl p-4 ${tone}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {isUser ? "You" : isAssistant ? "Assistant" : "System"}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">{new Date(evt.ts).toLocaleTimeString()}</span>
      </div>
      {evt.text && <p className="text-sm md:text-base leading-relaxed">{evt.text}</p>}
      {evt.rich}
    </div>
  );
}

function InfoStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}<span>{label}</span></div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

// ===================== Utils =====================

function fmtMoney(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString()}`;
  }
}
