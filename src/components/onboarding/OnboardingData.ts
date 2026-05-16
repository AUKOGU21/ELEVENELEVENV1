import leanImg from "@/assets/silhouettes/lean.jpg";
import slimImg from "@/assets/silhouettes/slim.jpg";
import averageBuildImg from "@/assets/silhouettes/average_build.jpg";
import athleticImg from "@/assets/silhouettes/athletic.jpg";
import athleteLeanImg from "@/assets/silhouettes/athlete_lean.jpg";
import petiteImg from "@/assets/silhouettes/petite.jpg";
import curvyImg from "@/assets/silhouettes/curvy.jpg";
import midCurvyImg from "@/assets/silhouettes/mid_curvy.jpg";
import midSizeImg from "@/assets/silhouettes/mid_size.jpg";
import midCurvy2Img from "@/assets/silhouettes/mid_curvy_2.jpg";
import realBellyImg from "@/assets/silhouettes/real_belly.jpg";

export type StepType = "account" | "transition" | "demographics" | "select" | "multi" | "image-select" | "fit" | "quickwin" | "pinterest";

export interface OnboardingStep {
  key: string;
  type: StepType;
  title?: string;
  subtitle?: string;
  options?: { label: string; desc?: string; image?: string }[];
  maxSelect?: number;
}

export const HEIGHT_OPTIONS = [
  { label: "Under 5'0\"" },
  { label: "5'0\" – 5'3\"" },
  { label: "5'4\" – 5'6\"" },
  { label: "5'7\" – 5'9\"" },
  { label: "5'10\" – 6'0\"" },
  { label: "Over 6'0\"" },
];

export const SIZE_OPTIONS = [
  "XXS (00)",
  "XS (0–2)",
  "S (4–6)",
  "M (8–10)",
  "L (12–14)",
  "XL (16–18)",
  "XXL (20–22)",
];

export const SILHOUETTE_OPTIONS = [
  { label: "Lean and elongated", desc: "Narrow frame with longer lines", image: leanImg },
  { label: "Slim with subtle shape", desc: "Slim build with light natural curves", image: slimImg },
  { label: "Soft and even", desc: "Soft shape with gentle, even distribution", image: averageBuildImg },
  { label: "Straight and athletic", desc: "Athletic build with a straighter silhouette", image: athleteLeanImg },
  { label: "Sculpted and athletic", desc: "Defined muscle and structured shape", image: athleticImg },
  { label: "Curved with definition", desc: "Defined waist with fuller hips or bust", image: curvyImg },
  { label: "Mid curve", desc: "Moderate curves with soft structure", image: midCurvyImg },
  { label: "Full and curved", desc: "Fuller shape with volume through hips, thighs, or bust", image: midCurvy2Img },
  { label: "Soft midsection", desc: "Less defined waist with softness through the middle", image: realBellyImg },
];

import minimalistImg from "@/assets/styles/minimalist.jpg";
import classicImg from "@/assets/styles/classic.jpg";
import preppyImg from "@/assets/styles/preppy.jpeg";
import feminineImg from "@/assets/styles/feminine.jpg";
import bohoImg from "@/assets/styles/boho.jpg";
import streetImg from "@/assets/styles/street.jpg";
import sportyImg from "@/assets/styles/sporty.jpg";
import trendyImg from "@/assets/styles/trendy.jpg";
import statementImg from "@/assets/styles/statement.jpg";

export const STYLE_OPTIONS = [
  { label: "Minimal", desc: "Clean, neutral, and pared-back with simple silhouettes", image: minimalistImg },
  { label: "Classic", desc: "Timeless, structured pieces that always feel polished", image: classicImg },
  { label: "Preppy", desc: "Structured and playful with a polished, collegiate feel", image: preppyImg },
  { label: "Feminine", desc: "Soft, shape-driven pieces with flow and delicate detail", image: feminineImg },
  { label: "Bohemian", desc: "Relaxed, layered, and expressive with texture and print", image: bohoImg },
  { label: "Street", desc: "Trend-aware, styled, and influenced by urban culture", image: streetImg },
  { label: "Sporty", desc: "Comfort-driven, active-inspired, and built for movement", image: sportyImg },
  { label: "Trend-driven", desc: "Focused on current styles, seasonal pieces, and what's new", image: trendyImg },
  { label: "Statement", desc: "Bold, expressive pieces that stand out and draw attention", image: statementImg },
];

export interface FitCategory {
  label: string;
  options: string[];
}

export const FIT_CATEGORIES: FitCategory[] = [
  { label: "Torso length", options: ["Longer torso", "Shorter torso", "About average"] },
  { label: "Bust fit", options: ["Fuller bust", "Smaller bust", "About proportional"] },
  { label: "Waist definition", options: ["Very defined", "Slightly defined", "Less defined"] },
  { label: "Hip fit", options: ["Wider hips", "Narrower hips", "About proportional"] },
  { label: "Thigh fit", options: ["Fuller thighs", "Slimmer thighs", "About proportional"] },
];

export const STEPS: OnboardingStep[] = [
  { key: "account", type: "account" },
  { key: "transition", type: "transition" },
  { key: "demographics", type: "demographics" },
  {
    key: "height",
    type: "select",
    title: "What's your height?",
    subtitle: "Helps us match you more precisely.",
    options: HEIGHT_OPTIONS,
  },
  {
    key: "sizing_top",
    type: "multi",
    title: "Top size",
    subtitle: "Pick what you buy most often",
  },
  {
    key: "sizing_bottom",
    type: "multi",
    title: "Bottom size",
    subtitle: "Pick what you buy most often",
  },
  {
    key: "silhouette",
    type: "image-select",
    title: "Which feels closest to you?",
    subtitle: "Select the one that best matches your shape.",
    options: SILHOUETTE_OPTIONS,
    maxSelect: 1,
  },
  {
    key: "style",
    type: "image-select",
    title: "What's your style identity?",
    subtitle: "Choose up to 3 that feel like you most days",
    options: STYLE_OPTIONS,
    maxSelect: 3,
  },
  {
    key: "quickwin",
    type: "quickwin",
  },
  {
    key: "pinterest",
    type: "pinterest",
  },
];
