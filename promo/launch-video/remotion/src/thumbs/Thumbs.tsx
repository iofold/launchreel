// Social thumbnails for the six launch-video directions — designed hooks, not frame grabs.
// Series system: LaunchReel wordmark chip (top-left), episode tag (bottom-left),
// primary hook ≤5 words readable at 10% scale, bottom-right kept clear (player timestamp).
import React from "react";
import { AbsoluteFill, staticFile, Img } from "remotion";
import { loadFont as loadArchivo } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/CormorantGaramond";
import { COLORS, CREW } from "../lib/brand";

const archivo = loadArchivo("normal", { weights: ["400"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["700", "800"], subsets: ["latin"] });
const serif = loadSerif("italic", { weights: ["500", "600"], subsets: ["latin"] });

const HOOK = archivo.fontFamily;
const MONO = mono.fontFamily;
const SERIF = serif.fontFamily;

// ---------- series chrome ----------

const Wordmark: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div style={{ position: "absolute", top: 44, left: 52, display: "flex", alignItems: "center", gap: 14, zIndex: 40 }}>
    <div style={{ width: 54, height: 54, borderRadius: 16, background: COLORS.blue, border: `4px solid ${dark ? "#fff" : COLORS.ink}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 0, height: 0, borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderLeft: "20px solid #fff", marginLeft: 5 }} />
    </div>
    <div style={{ fontFamily: HOOK, fontSize: 42, color: dark ? "#fff" : COLORS.ink, letterSpacing: -1 }}>
      Launch
      <span style={{ background: COLORS.pink, color: "#fff", borderRadius: 12, padding: "2px 14px 6px", marginLeft: 6, border: `4px solid ${dark ? "#fff" : COLORS.ink}` }}>Reel</span>
    </div>
  </div>
);

const Episode: React.FC<{ n: string; dark?: boolean }> = ({ n, dark }) => (
  <div style={{ position: "absolute", bottom: 44, left: 52, fontFamily: MONO, fontWeight: 800, fontSize: 26, letterSpacing: 4, color: dark ? "rgba(255,255,255,0.85)" : COLORS.ink, background: dark ? "rgba(0,0,0,0.35)" : COLORS.paper, border: `3px solid ${dark ? "rgba(255,255,255,0.7)" : COLORS.ink}`, borderRadius: 999, padding: "8px 22px", zIndex: 40 }}>
    DIRECTION {n}/6
  </div>
);

const Sticker: React.FC<{ children: React.ReactNode; bg?: string; color?: string; rotate?: number; fontSize?: number; style?: React.CSSProperties }> = ({ children, bg = COLORS.yellow, color = COLORS.ink, rotate = -3, fontSize = 150, style }) => (
  <div style={{ display: "inline-block", background: bg, color, fontFamily: HOOK, fontSize, lineHeight: 1.02, padding: "26px 48px", border: `6px solid ${COLORS.ink}`, borderRadius: 26, boxShadow: `14px 14px 0 ${COLORS.ink}`, transform: `rotate(${rotate}deg)`, ...style }}>
    {children}
  </div>
);

// ---------- 01 CHANNEL ZAP — "14 LIKES?" / "CHANGE THE CHANNEL." ----------

const BAR_COLORS = [COLORS.yellow, COLORS.sky, COLORS.green, COLORS.pink, COLORS.purple, COLORS.orange, COLORS.blue];

export const Thumb01: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.ink }}>
    <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
      {BAR_COLORS.map((c, i) => (
        <div key={i} style={{ flex: 1, background: c }} />
      ))}
    </AbsoluteFill>
    {/* scanlines + vignette */}
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 2px, transparent 2px 5px)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
    <div style={{ position: "absolute", top: 48, right: 56, background: COLORS.pink, color: "#fff", fontFamily: MONO, fontWeight: 800, fontSize: 30, letterSpacing: 3, padding: "10px 26px", borderRadius: 999, border: `4px solid ${COLORS.ink}`, boxShadow: `6px 6px 0 ${COLORS.ink}` }}>
      ● ON AIR
    </div>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 34 }}>
      <Sticker fontSize={230} rotate={-3}>14 LIKES?</Sticker>
      <Sticker fontSize={92} rotate={1.5} bg={COLORS.ink} color={COLORS.cream} style={{ boxShadow: `12px 12px 0 rgba(0,0,0,0.35)` }}>
        CHANGE THE CHANNEL.
      </Sticker>
    </AbsoluteFill>
    <Wordmark />
    <Episode n="01" />
  </AbsoluteFill>
);

// ---------- 02 EXPLODED UI — giant "47" + exploded stack ----------

const Plane: React.FC<{ z: number; w: number; h: number; bg: string; top: number; left: number; children?: React.ReactNode; border?: string }> = ({ z, w, h, bg, top, left, children, border }) => (
  <div style={{ position: "absolute", top, left, width: w, height: h, background: bg, borderRadius: 18, border: border ?? `4px solid rgba(255,255,255,0.85)`, transform: `translateZ(${z}px)`, boxShadow: "0 30px 60px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
    {children}
  </div>
);

export const Thumb02: React.FC = () => (
  <AbsoluteFill style={{ background: "#1a150f" }}>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 68% 45%, rgba(255,201,60,0.10), transparent 60%), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px)" }} />
    {/* exploded stack, right side */}
    <div style={{ position: "absolute", right: 60, top: 130, width: 760, height: 820, perspective: 1300 }}>
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: "rotateY(-24deg) rotateX(10deg)" }}>
        <Plane z={-160} w={430} h={640} bg={COLORS.blue} top={90} left={210}>
          <div style={{ fontFamily: HOOK, fontSize: 52, color: "#fff", textAlign: "center", lineHeight: 1.15 }}>Still doing<br />books at<br />midnight?</div>
        </Plane>
        <Plane z={-40} w={330} h={210} bg={COLORS.paper} top={60} left={80}>
          <Img src={staticFile("assets/mock-3-delivery.png")} style={{ width: "100%", objectFit: "cover" }} />
        </Plane>
        <Plane z={60} w={330} h={190} bg={COLORS.paper} top={470} left={140}>
          <Img src={staticFile("assets/mock-2-jobboard.png")} style={{ width: "100%", objectFit: "cover" }} />
        </Plane>
        <Plane z={150} w={340} h={90} bg={COLORS.green} top={330} left={40}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 46 }}>
            {[18, 34, 26, 44, 30, 46, 22, 38, 28, 42, 20, 34].map((h, i) => (
              <div key={i} style={{ width: 12, height: h, background: "#0b3d26", borderRadius: 4 }} />
            ))}
          </div>
        </Plane>
        <Plane z={240} w={300} h={84} bg={COLORS.yellow} top={140} left={300}>
          <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 34, color: COLORS.ink }}>SCENE 1 · HOOK</div>
        </Plane>
      </div>
    </div>
    {/* hook text, left */}
    <div style={{ position: "absolute", left: 64, top: 210, width: 900, zIndex: 30 }}>
      <div style={{ fontFamily: HOOK, fontSize: 460, lineHeight: 0.9, color: COLORS.yellow, textShadow: `18px 18px 0 rgba(0,0,0,0.55)` }}>47</div>
      <div style={{ fontFamily: HOOK, fontSize: 116, color: "#fff", marginTop: 8 }}>MOVING PARTS.</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 46, color: COLORS.yellow, marginTop: 20 }}>you touch none.</div>
    </div>
    <Wordmark dark />
    <Episode n="02" dark />
  </AbsoluteFill>
);

// ---------- 03 THE CREW — five bots + "FIVE BOTS. ONE JOB." ----------

const Bot: React.FC<{ color: string; rotate: number }> = ({ color, rotate }) => (
  <div style={{ background: COLORS.paper, border: `6px solid ${COLORS.ink}`, borderRadius: 34, padding: 26, boxShadow: `10px 10px 0 ${color}`, transform: `rotate(${rotate}deg)` }}>
    <div style={{ width: 170, height: 170, borderRadius: 40, background: color, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 26 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: COLORS.ink }} />
        </div>
      ))}
      <div style={{ position: "absolute", bottom: 26, left: "50%", transform: "translateX(-50%)", width: 56, height: 26, borderBottom: `8px solid ${COLORS.ink}`, borderRadius: "0 0 28px 28px" }} />
      <div style={{ position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)", width: 10, height: 20, background: COLORS.ink }} />
      <div style={{ position: "absolute", top: -36, left: "50%", transform: "translateX(-50%)", width: 18, height: 18, borderRadius: "50%", background: COLORS.yellow, border: `4px solid ${COLORS.ink}` }} />
    </div>
  </div>
);

export const Thumb03: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.cream }}>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(255,201,60,0.35), transparent 65%)" }} />
    <div style={{ position: "absolute", top: 150, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, fontFamily: HOOK, color: COLORS.ink, lineHeight: 1 }}>
      <div style={{ fontSize: 148, whiteSpace: "nowrap" }}>
        FIVE BOTS. <span style={{ color: COLORS.pink }}>ONE JOB:</span>
      </div>
      <div style={{ fontSize: 148 }}>YOUR LAUNCH.</div>
    </div>
    <div style={{ position: "absolute", bottom: 170, width: "100%", display: "flex", justifyContent: "center", gap: 44 }}>
      {CREW.map((c, i) => (
        <Bot key={c.name} color={c.color} rotate={[-6, 3, -2, 5, -4][i]} />
      ))}
    </div>
    <div style={{ position: "absolute", top: 64, right: 70, fontFamily: MONO, fontWeight: 800, fontSize: 40, letterSpacing: 2, color: "#C0262D", border: "6px solid #C0262D", borderRadius: 14, padding: "10px 26px", transform: "rotate(7deg)", background: "rgba(255,255,255,0.7)" }}>
      DEADLINE: TONIGHT
    </div>
    <Wordmark />
    <Episode n="03" />
  </AbsoluteFill>
);

// ---------- 04 2AM — black, mono, cursor ----------

export const Thumb04: React.FC = () => (
  <AbsoluteFill style={{ background: "#050505", justifyContent: "center", alignItems: "center" }}>
    <div style={{ position: "absolute", top: 52, right: 64, fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: 6, color: "rgba(255,255,255,0.45)" }}>
      02:14 · THE NIGHT BEFORE LAUNCH
    </div>
    <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 190, color: "#fff", display: "flex", alignItems: "center" }}>
      It's 2:14 AM.<span style={{ display: "inline-block", width: 74, height: 160, background: COLORS.pink, marginLeft: 30 }} />
    </div>
    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 62, color: "rgba(255,255,255,0.6)", marginTop: 44 }}>
      your launch post isn't written.
    </div>
    <Wordmark dark />
    <Episode n="04" dark />
  </AbsoluteFill>
);

// ---------- 05 OPENING NIGHT — lit marquee + serif ----------

export const Thumb05: React.FC = () => (
  <AbsoluteFill style={{ background: "#0a0c12" }}>
    <Img src={staticFile("assets/marquee-lit.png")} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover" }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(5,6,10,0.55) 0%, transparent 30%, transparent 62%, rgba(5,6,10,0.8) 100%)" }} />
    {/* text tracked onto the blank sign region (center ~58.3% / 51%) */}
    <div style={{ position: "absolute", left: "58.3%", top: "50.5%", transform: "translate(-50%, -50%) rotate(-1.2deg)", fontFamily: SERIF, fontStyle: "italic", fontWeight: 600, fontSize: 88, color: "#3a2f22", letterSpacing: 4, whiteSpace: "nowrap" }}>
      Your Name Here.
    </div>
    <div style={{ position: "absolute", bottom: 128, width: "100%", textAlign: "center", fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 74, color: "#F3E9CF", textShadow: "0 4px 30px rgba(0,0,0,0.8)" }}>
      Every launch deserves an opening night.
    </div>
    <Wordmark dark />
    <Episode n="05" dark />
  </AbsoluteFill>
);

// ---------- 06 0:47 — giant timer + receipt edge ----------

export const Thumb06: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.yellow }}>
    <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgba(23,19,13,0.05) 0 2px, transparent 2px 96px)" }} />
    {/* receipt peeking from the right */}
    <div style={{ position: "absolute", right: -30, top: 100, width: 460, background: COLORS.paper, border: `5px solid ${COLORS.ink}`, borderRadius: 18, padding: "34px 38px", transform: "rotate(4deg)", boxShadow: `14px 14px 0 rgba(23,19,13,0.35)`, fontFamily: MONO, fontWeight: 700, fontSize: 24, color: COLORS.ink, lineHeight: 1.8, whiteSpace: "nowrap" }}>
      ★ RECEIPT ★<br />
      1x LAUNCH TRAILER ₹999<br />
      VO + MUSIC ..... incl.<br />
      PREMIERE PAGE .. incl.<br />
      ─────────────<br />
      YOUR STANDUP<br />
      COSTS MORE ....... ✓
    </div>
    <div style={{ position: "absolute", left: 70, top: 250 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
        <div style={{ background: COLORS.green, color: "#fff", fontFamily: HOOK, fontSize: 64, padding: "10px 30px", borderRadius: 18, border: `6px solid ${COLORS.ink}`, boxShadow: `8px 8px 0 ${COLORS.ink}`, transform: "rotate(-4deg)" }}>
          PB!
        </div>
        <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 60, color: COLORS.ink, opacity: 0.75 }}>launch trailer, any%</div>
      </div>
      <div style={{ fontFamily: MONO, fontWeight: 800, fontSize: 330, letterSpacing: -8, color: COLORS.ink, lineHeight: 1.05 }}>
        00:47<span style={{ fontSize: 200, opacity: 0.85 }}>.21</span>
      </div>
      <div style={{ fontFamily: HOOK, fontSize: 96, color: COLORS.ink, marginTop: 6 }}>
        A WHOLE TRAILER. <span style={{ background: COLORS.pink, color: "#fff", padding: "0 24px", borderRadius: 16, border: `6px solid ${COLORS.ink}` }}>TIMED.</span>
      </div>
    </div>
    <Wordmark />
    <Episode n="06" />
  </AbsoluteFill>
);
